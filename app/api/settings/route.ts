import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getUserSettings, updateUserProfile, updateUserPassword,
  updateApiKeys, getEncryptedKeys,
} from "@/lib/db/repository";
import { encrypt, decrypt } from "@/lib/crypto";
import { initDb } from "@/lib/db";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

// ── GET — current settings ────────────────────────────────────────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await initDb();
    const settings = await getUserSettings(session.user.id);
    return NextResponse.json(settings);
  } catch (err) {
    console.error("[API /settings GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// ── POST — update settings ────────────────────────────────────────────────────
const UpdateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("profile"),
    name: z.string().min(2).max(80),
  }),
  z.object({
    action: z.literal("password"),
    current_password: z.string().min(1),
    new_password: z.string().min(8),
  }),
  z.object({
    action: z.literal("api_keys"),
    openai_key: z.string().optional(),   // empty string = remove, undefined = no change
    eleven_key: z.string().optional(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }

    await initDb();
    const userId = session.user.id;

    if (parsed.data.action === "profile") {
      await updateUserProfile(userId, { name: parsed.data.name });
      return NextResponse.json({ success: true, message: "Perfil actualizado" });
    }

    if (parsed.data.action === "password") {
      // Verify current password
      const { getUserByEmail } = await import("@/lib/db/repository");
      const user = await getUserByEmail(session.user.email ?? "");
      if (!user?.password_hash) return NextResponse.json({ error: "Error de autenticación" }, { status: 401 });

      const valid = await bcrypt.compare(parsed.data.current_password, user.password_hash);
      if (!valid) return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 400 });

      const newHash = await bcrypt.hash(parsed.data.new_password, 12);
      await updateUserPassword(userId, newHash);
      return NextResponse.json({ success: true, message: "Contraseña actualizada" });
    }

    if (parsed.data.action === "api_keys") {
      const updates: { openai_key_enc?: string | null; eleven_key_enc?: string | null } = {};

      if (parsed.data.openai_key !== undefined) {
        updates.openai_key_enc = parsed.data.openai_key.trim()
          ? encrypt(parsed.data.openai_key.trim())
          : null;
      }
      if (parsed.data.eleven_key !== undefined) {
        updates.eleven_key_enc = parsed.data.eleven_key.trim()
          ? encrypt(parsed.data.eleven_key.trim())
          : null;
      }

      await updateApiKeys(userId, updates);
      return NextResponse.json({ success: true, message: "Claves guardadas correctamente" });
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (err) {
    console.error("[API /settings POST]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// ── GET masked keys (separate endpoint for UI) ────────────────────────────────
export async function PUT(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await initDb();
    const keys = await getEncryptedKeys(session.user.id);
    const { maskKey } = await import("@/lib/crypto");

    return NextResponse.json({
      openai_key_masked: keys.openai_key_enc ? maskKey(decrypt(keys.openai_key_enc)) : null,
      eleven_key_masked: keys.eleven_key_enc ? maskKey(decrypt(keys.eleven_key_enc)) : null,
    });
  } catch (err) {
    console.error("[API /settings PUT]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
