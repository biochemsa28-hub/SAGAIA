import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, createPasswordReset } from "@/lib/db/repository";
import { sendPasswordResetEmail } from "@/lib/email/resend";
import { initDb } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/security/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";

const Schema = z.object({ email: z.string().email() });

// POST /api/auth/forgot-password — envía el enlace para volver a entrar.
//
// Hasta ahora no existía ningún camino de vuelta: quien olvidaba su contraseña
// quedaba afuera para siempre. Con usuarios reales eso no es una molestia, es un
// cliente perdido en silencio — no escribe para quejarse, simplemente no vuelve.
export async function POST(req: NextRequest) {
  // 5 por hora por IP. Sin esto el endpoint sirve para dos abusos distintos:
  // inundar de correos a una dirección ajena, y probar direcciones para ver
  // cuáles existen.
  const rl = rateLimit(`forgot:${getClientIp(req)}`, { limit: 5, windowSecs: 3600 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Esperá un rato antes de volver a pedirlo." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    // SIEMPRE la misma respuesta, exista o no la cuenta — y también cuando el
    // correo está mal escrito. Responder distinto convierte este endpoint en un
    // detector de qué direcciones están registradas.
    const ok = NextResponse.json({
      success: true,
      message: "Si esa dirección tiene una cuenta, te llega un enlace en unos minutos.",
    });
    if (!parsed.success) return ok;

    await initDb();
    const email = parsed.data.email.trim().toLowerCase();
    const user = await getUserByEmail(email).catch(() => null);
    if (!user) return ok;

    const token = await createPasswordReset(user.id, 60);
    const base = (process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
    const url = `${base}/reset-password?token=${token}`;

    const enviado = await sendPasswordResetEmail({ to: user.email, userName: user.name, resetUrl: url })
      .catch((e) => { console.error("[reset] envío falló:", e instanceof Error ? e.message.slice(0, 140) : e); return false; });

    // Sin Resend configurado el correo no sale, y el usuario quedaría esperando
    // algo que nunca se mandó. Dejarlo en el log permite que un operador lo pase
    // a mano y, sobre todo, hace visible que falta configurar el envío.
    if (!enviado) {
      console.warn(`[reset] SIN ENVÍO (falta RESEND_API_KEY). Enlace para ${user.email}: ${url}`);
    } else {
      console.log(`[reset] enlace enviado a ${user.email}`);
    }
    return ok;
  } catch (e) {
    console.error("[forgot-password]", e instanceof Error ? e.message : e);
    // Incluso ante un error interno se responde igual: un 500 acá también
    // delataría qué direcciones existen.
    return NextResponse.json({
      success: true,
      message: "Si esa dirección tiene una cuenta, te llega un enlace en unos minutos.",
    });
  }
}
