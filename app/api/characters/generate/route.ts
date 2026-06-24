import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateCharacterOptions } from "@/services/fal/image-generator";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  description: z.string().min(3).max(1000),
  niche: z.string().max(40).optional(),
  visual_style: z.string().max(40).optional(),
});

// POST /api/characters/generate — generate portrait OPTIONS for a new character.
// Returns image URLs only; nothing is saved until the user picks one and POSTs to
// /api/characters with their chosen reference_image_url.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Describe tu personaje (mínimo 3 caracteres)" }, { status: 400 });

    const result = await generateCharacterOptions({
      description: parsed.data.description,
      niche: parsed.data.niche,
      visualStyle: parsed.data.visual_style,
      count: 4,
    });

    if (!result.success) return NextResponse.json({ error: result.error ?? "No se pudieron generar opciones" }, { status: 502 });
    return NextResponse.json({ success: true, options: result.urls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /characters/generate]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
