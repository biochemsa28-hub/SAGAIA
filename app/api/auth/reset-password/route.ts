import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, initDb } from "@/lib/db";
import { internalSecret } from "@/lib/internal-auth";
import { consumePasswordReset } from "@/lib/db/repository";
import { rateLimit, getClientIp } from "@/lib/security/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";

const Schema = z.object({
  email: z.string().email(),
  new_password: z.string().min(8, "Mínimo 8 caracteres"),
});

// El camino normal: el token que llegó por correo.
const TokenSchema = z.object({
  token: z.string().min(32).max(128),
  new_password: z.string().min(8, "Mínimo 8 caracteres"),
});

// POST /api/auth/reset-password — set a user's password, authenticated with the
// internal secret rather than a session.
//
// This exists because there is no "forgot password" flow at all: a user who
// forgets theirs is locked out permanently, with no way back in. Until that flow
// is built (it needs Resend to send the link), this is the operator's escape
// hatch — and it is deliberately the same shape the real endpoint will have.
//
// Not reachable from a browser: the caller must present INTERNAL_JOB_SECRET, and
// if that variable is unset the route refuses every request instead of falling
// open. A password endpoint that fails open is a way to take over any account.
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json().catch(() => null);

    // ── CAMINO DEL USUARIO: token del correo ─────────────────────────────────
    // El de abajo (secreto interno) era la salida de emergencia mientras esto no
    // existía. Se conserva para el operador, pero ya no es el único camino.
    const conToken = TokenSchema.safeParse(body);
    if (conToken.success) {
      const rl = rateLimit(`reset:${getClientIp(req)}`, { limit: 10, windowSecs: 3600 });
      if (!rl.allowed) {
        return NextResponse.json({ error: "Demasiados intentos. Esperá un rato." }, { status: 429 });
      }
      await initDb();
      const hash = await bcrypt.hash(conToken.data.new_password, 12);
      const ok = await consumePasswordReset(conToken.data.token, hash);
      if (!ok) {
        // Un solo mensaje para las tres causas —no existe, ya se usó, venció—
        // porque distinguirlas le da información a quien pruebe tokens al azar.
        return NextResponse.json(
          { error: "Este enlace ya no sirve. Pedí uno nuevo desde “Olvidé mi contraseña”." },
          { status: 400 },
        );
      }
      console.log("[reset] contraseña cambiada con token");
      return NextResponse.json({ success: true });
    }

    // ── CAMINO DEL OPERADOR: secreto interno ─────────────────────────────────
    const secret = internalSecret();
    if (!secret) {
      return NextResponse.json({ error: "No disponible" }, { status: 503 });
    }
    if (req.headers.get("x-vynavo-internal") !== secret) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }

    await initDb();
    const hash = await bcrypt.hash(parsed.data.new_password, 12);
    const result = await getDb().execute({
      sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE email = ?",
      args: [hash, parsed.data.email.toLowerCase().trim()],
    });

    if (result.rowsAffected !== 1) {
      return NextResponse.json({ error: "Ese email no existe" }, { status: 404 });
    }
    return NextResponse.json({ success: true, email: parsed.data.email });
  } catch (err) {
    console.error("[reset-password]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
