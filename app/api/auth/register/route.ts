import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail, createUser } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { z } from "zod";
import { captureServer } from "@/lib/analytics/posthog";
import { rateLimit, getClientIp } from "@/lib/security/rate-limit";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // 5 registration attempts per IP per hour
  const ip = getClientIp(req);
  const rl = rateLimit(`register:${ip}`, { limit: 5, windowSecs: 3600 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera antes de intentarlo de nuevo." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body: unknown = await req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }

    await initDb();
    const existing = await getUserByEmail(parsed.data.email);
    if (existing) {
      return NextResponse.json({ error: "El email ya está registrado" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await createUser({
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
    });

    captureServer(user.id, "user_registered", { email: user.email, name: user.name });
    return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stack = err instanceof Error ? err.stack : "";
    console.error("[API /auth/register] ERROR:", message);
    console.error("[API /auth/register] STACK:", stack);
    console.error("[register] internal error:", message);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
