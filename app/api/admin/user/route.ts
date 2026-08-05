import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb, initDb } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { z } from "zod";

export const runtime = "nodejs";

// POST /api/admin/user — owner-only control panel actions.
//   { email, action: "grant_credits", amount }   → add NAVOS
//   { email, action: "set_plan", plan }          → change plan
const BodySchema = z.object({
  email: z.string().email(),
  action: z.enum(["grant_credits", "set_plan"]),
  amount: z.number().int().optional(),
  plan: z.enum(["free", "starter", "creator", "pro", "studio"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdmin(session.user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    await initDb();
    const db = getDb();
    const email = parsed.data.email.trim().toLowerCase();
    const u = await db.execute({ sql: "SELECT id FROM users WHERE lower(email)=?", args: [email] });
    if (!u.rows.length) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    const userId = String((u.rows[0] as Record<string, unknown>).id);

    if (parsed.data.action === "grant_credits") {
      const amount = Math.floor(parsed.data.amount ?? 0);
      if (!amount) return NextResponse.json({ error: "amount requerido" }, { status: 400 });
      await db.execute({
        sql: "UPDATE users SET credits = MAX(0, credits + ?), updated_at = datetime('now') WHERE id = ?",
        args: [amount, userId],
      });
      const nc = await db.execute({ sql: "SELECT credits FROM users WHERE id=?", args: [userId] });
      return NextResponse.json({ success: true, credits: Number((nc.rows[0] as Record<string, unknown>).credits) });
    }

    if (parsed.data.action === "set_plan") {
      const plan = parsed.data.plan ?? "free";
      await db.execute({ sql: "UPDATE users SET plan = ?, updated_at = datetime('now') WHERE id = ?", args: [plan, userId] });
      return NextResponse.json({ success: true, plan });
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (err) {
    console.error("[API /admin/user]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
