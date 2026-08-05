import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb, initDb } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { getPlanById } from "@/lib/stripe-plans";

export const runtime = "nodejs";

// GET /api/admin/metrics — VYNAVO Nucleus. Owner-only aggregate metrics for
// measuring growth: users, activity, production, cost, revenue signal.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdmin(session.user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await initDb();
    const db = getDb();
    const one = async (sql: string): Promise<number> => {
      const r = await db.execute(sql);
      const row = r.rows[0] as Record<string, unknown> | undefined;
      const v = row ? Object.values(row)[0] : 0;
      return Number(v ?? 0);
    };
    const rows = async (sql: string) => (await db.execute(sql)).rows as Record<string, unknown>[];

    // ── Users ──────────────────────────────────────────────────────────────
    const users = {
      total: await one("SELECT COUNT(*) FROM users"),
      today: await one("SELECT COUNT(*) FROM users WHERE date(created_at)=date('now')"),
      week: await one("SELECT COUNT(*) FROM users WHERE created_at >= datetime('now','-7 days')"),
      month: await one("SELECT COUNT(*) FROM users WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')"),
      paying: await one("SELECT COUNT(*) FROM users WHERE plan != 'free'"),
    };

    // ── Production ─────────────────────────────────────────────────────────
    const videos = {
      projects: await one("SELECT COUNT(*) FROM projects"),
      finished: await one("SELECT COUNT(*) FROM projects WHERE status IN ('ready','done')"),
      today: await one("SELECT COUNT(*) FROM projects WHERE date(created_at)=date('now')"),
      week: await one("SELECT COUNT(*) FROM projects WHERE created_at >= datetime('now','-7 days')"),
      failed: await one("SELECT COUNT(*) FROM projects WHERE status='failed'"),
    };

    // ── Cost (estimated) ───────────────────────────────────────────────────
    const cost = {
      today: Math.round((await one("SELECT COALESCE(SUM(cost_usd),0) FROM api_logs WHERE date(created_at)=date('now')")) * 1000) / 1000,
      month: Math.round((await one("SELECT COALESCE(SUM(cost_usd),0) FROM api_logs WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')")) * 100) / 100,
      all: Math.round((await one("SELECT COALESCE(SUM(cost_usd),0) FROM api_logs")) * 100) / 100,
    };

    // ── Credits / revenue signal ───────────────────────────────────────────
    const navos = {
      in_circulation: await one("SELECT COALESCE(SUM(credits),0) FROM users"),
      spent: await one("SELECT COALESCE(SUM(credits_spent),0) FROM projects WHERE credit_refunded=0"),
    };

    // ── Engagement / Retention / Virality ──────────────────────────────────
    const activeUsers7d = await one("SELECT COUNT(DISTINCT user_id) FROM projects WHERE created_at >= datetime('now','-7 days')");
    // "Returning" = users who created projects on 2+ DISTINCT days (they came back).
    const returning = await one(
      "SELECT COUNT(*) FROM (SELECT user_id FROM projects GROUP BY user_id HAVING COUNT(DISTINCT date(created_at)) >= 2)"
    );
    const engagement = {
      active_7d: activeUsers7d,
      returning_users: returning,
      videos_per_user: users.total ? Math.round((videos.projects / users.total) * 10) / 10 : 0,
      completion_rate: videos.projects ? Math.round((videos.finished / videos.projects) * 100) : 0,
      // Retention %: of all users, how many came back (proxy for stickiness).
      retention_pct: users.total ? Math.round((returning / users.total) * 100) : 0,
    };
    // Top creators = your power users (who to interview / who loves it).
    const topCreators = await rows(
      `SELECT u.email, COUNT(p.id) videos, MAX(p.created_at) last_seen
       FROM users u JOIN projects p ON p.user_id = u.id
       GROUP BY u.id ORDER BY videos DESC LIMIT 6`
    );

    // ── Revenue (MRR from active plans) + Margin ───────────────────────────
    const planRows = await rows("SELECT plan, COUNT(*) n FROM users GROUP BY plan");
    let mrr = 0;
    for (const r of planRows) {
      const plan = getPlanById(String(r.plan ?? "free"));
      if (plan && plan.priceMonthly > 0) mrr += (plan.priceMonthly / 100) * Number(r.n);
    }
    const revenue = {
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(mrr * 12 * 100) / 100,
      margin_month: Math.round((mrr - cost.month) * 100) / 100, // ingresos - costo del mes
    };

    // ── 14-day trend series (for the growth chart) ─────────────────────────
    const seriesRaw = async (sql: string) => {
      const map = new Map<string, number>();
      for (const r of await rows(sql)) map.set(String(r.d), Number(r.n));
      return map;
    };
    const uMap = await seriesRaw("SELECT date(created_at) d, COUNT(*) n FROM users WHERE created_at >= datetime('now','-13 days') GROUP BY d");
    const pMap = await seriesRaw("SELECT date(created_at) d, COUNT(*) n FROM projects WHERE created_at >= datetime('now','-13 days') GROUP BY d");
    const cMap = await seriesRaw("SELECT date(created_at) d, ROUND(COALESCE(SUM(cost_usd),0),3) n FROM api_logs WHERE created_at >= datetime('now','-13 days') GROUP BY d");
    const series: { date: string; users: number; projects: number; cost: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      series.push({ date: d, users: uMap.get(d) ?? 0, projects: pMap.get(d) ?? 0, cost: cMap.get(d) ?? 0 });
    }

    // ── Breakdowns ─────────────────────────────────────────────────────────
    const byPlan = planRows.sort((a, b) => Number(b.n) - Number(a.n));
    const byNiche = await rows("SELECT niche, COUNT(*) n FROM projects GROUP BY niche ORDER BY n DESC LIMIT 8");
    const costByProvider = await rows("SELECT provider, ROUND(COALESCE(SUM(cost_usd),0),3) usd, COUNT(*) n FROM api_logs GROUP BY provider ORDER BY usd DESC");
    const recentUsers = await rows("SELECT email, plan, credits, created_at FROM users ORDER BY created_at DESC LIMIT 12");

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      users, videos, cost, navos, engagement, revenue, series,
      top_creators: topCreators.map((r) => ({ email: r.email, videos: Number(r.videos), last_seen: r.last_seen })),
      by_plan: byPlan.map((r) => ({ plan: r.plan, n: Number(r.n) })),
      by_niche: byNiche.map((r) => ({ niche: r.niche, n: Number(r.n) })),
      cost_by_provider: costByProvider.map((r) => ({ provider: r.provider, usd: Number(r.usd), n: Number(r.n) })),
      recent_users: recentUsers.map((r) => ({ email: r.email, plan: r.plan, credits: Number(r.credits), created_at: r.created_at })),
    });
  } catch (err) {
    console.error("[API /admin/metrics]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
