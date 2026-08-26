import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, initDb } from "@/lib/db";
import { internalSecret } from "@/lib/internal-auth";
import { z } from "zod";

export const runtime = "nodejs";

// POST /api/admin/reset-password — restablecer la contraseña de un usuario.
//
// No existe flujo de "olvidé mi contraseña" (Resend nunca se configuró), así
// que cuando el dueño la pierde no hay NINGUNA puerta: el panel admin exige
// sesión, y para tener sesión hace falta la contraseña. Este endpoint rompe
// ese ciclo con el mismo candado que ya usan el worker y repair-urls: el
// secreto interno del servidor (header x-vynavo-internal). Quien tiene el
// secreto tiene el deploy entero, así que no agrega superficie nueva.
//
// La contraseña llega ya elegida (se genera fuera y se entrega al usuario en
// mano); acá solo se hashea y se guarda. Nunca se registra en logs.
const BodySchema = z.object({
  email: z.string().email(),
  new_password: z.string().min(10).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const secret = internalSecret();
    if (!secret || req.headers.get("x-vynavo-internal") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    await initDb();
    const db = getDb();
    const email = parsed.data.email.trim().toLowerCase();
    const u = await db.execute({ sql: "SELECT id FROM users WHERE lower(email)=?", args: [email] });
    if (!u.rows.length) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    const userId = String((u.rows[0] as Record<string, unknown>).id);

    const hash = await bcrypt.hash(parsed.data.new_password, 12);
    await db.execute({
      sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
      args: [hash, userId],
    });
    console.log(`[admin] contraseña restablecida para ${email}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[API /admin/reset-password]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
