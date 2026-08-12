import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { setSceneLock } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  project_id: z.string().uuid(),
  scene_number: z.number().int().positive(),
  locked: z.boolean(),
});

// POST /api/scenes/lock — aprueba (o desaprueba) una escena.
//
// Una escena aprobada no se regenera: es la que el usuario ya dio por buena, y
// perderla por un click de más en una miniatura pequeña es el accidente que
// hace que la gente deje de tocar los controles. El candado se hace cumplir en
// /api/images, no solo acá — un candado que solo apaga un botón no es candado.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });

    await initDb();
    const ok = await setSceneLock({
      projectId: parsed.data.project_id,
      userId: session.user.id,
      sceneNumber: parsed.data.scene_number,
      locked: parsed.data.locked,
    });
    if (!ok) return NextResponse.json({ error: "Escena no encontrada" }, { status: 404 });

    return NextResponse.json({ success: true, locked: parsed.data.locked });
  } catch (err) {
    console.error("[API /scenes/lock]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
