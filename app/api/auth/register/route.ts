import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail, createUser } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { z } from "zod";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
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

    return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /auth/register]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
