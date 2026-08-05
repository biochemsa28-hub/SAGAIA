import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb, initDb } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/costs — real spend visibility so you're never blind again.
// Returns: today's total, this month's total, and a breakdown by provider/endpoint.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await initDb();
    const db = getDb();

    const sum = async (where: string): Promise<{ n: number; usd: number }> => {
      const r = await db.execute(`SELECT COUNT(*) n, COALESCE(SUM(cost_usd),0) usd FROM api_logs ${where}`);
      const row = r.rows[0] as Record<string, unknown>;
      return { n: Number(row?.n ?? 0), usd: Math.round((Number(row?.usd ?? 0)) * 1000) / 1000 };
    };

    const today = await sum("WHERE date(created_at) = date('now')");
    const month = await sum("WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m','now')");
    const all = await sum("");

    const byProviderRes = await db.execute(
      `SELECT provider, COUNT(*) n, ROUND(COALESCE(SUM(cost_usd),0),3) usd
       FROM api_logs GROUP BY provider ORDER BY usd DESC`
    );
    const byProvider = byProviderRes.rows.map((r) => ({
      provider: String((r as Record<string, unknown>).provider ?? "?"),
      calls: Number((r as Record<string, unknown>).n ?? 0),
      usd: Number((r as Record<string, unknown>).usd ?? 0),
    }));

    return NextResponse.json({
      note: "Costos ESTIMADOS de fal/ElevenLabs/Shotstack (no exactos) + reales de Claude/OpenAI.",
      today_usd: today.usd,
      month_usd: month.usd,
      all_time_usd: all.usd,
      by_provider: byProvider,
    });
  } catch (err) {
    console.error("[API /costs]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
