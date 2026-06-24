import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createCharacter, listCharacters } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

// GET /api/characters — list the user's saved recurring characters
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await initDb();
    const characters = await listCharacters(session.user.id);
    return NextResponse.json({ success: true, characters });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /characters GET]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(1000),
  archetype: z.string().max(40).optional(),
  visual_prompt: z.string().max(2000).optional(),
  voice_style: z.string().max(200).optional(),
  reference_image_url: z.string().url().optional(),
  niche: z.string().max(40).optional(),
});

// POST /api/characters — save a new recurring character
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    await initDb();
    const character = await createCharacter({
      userId: session.user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      archetype: parsed.data.archetype,
      visualPrompt: parsed.data.visual_prompt,
      voiceStyle: parsed.data.voice_style,
      referenceImageUrl: parsed.data.reference_image_url,
      niche: parsed.data.niche,
    });
    return NextResponse.json({ success: true, character });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /characters POST]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
