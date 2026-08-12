import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { actualizarPlanDeEscena } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  project_id: z.string().uuid(),
  scene_number: z.number().int().positive(),
  camera_move: z.string().max(200).optional(),
  emotion: z.string().max(60).optional(),
  environment: z.string().max(200).optional(),
});

// POST /api/scenes/plan — corrige el plan de movimiento de una escena.
//
// Gratis y sin generar nada: solo cambia lo que el generador va a leer cuando
// llegue el momento de animar. Ese es el punto — se dirige ANTES de gastar, no
// se corrige después pagando otra vez.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });

    await initDb();
    const ok = await actualizarPlanDeEscena({
      projectId: parsed.data.project_id,
      userId: session.user.id,
      sceneNumber: parsed.data.scene_number,
      camera_move: parsed.data.camera_move,
      emotion: parsed.data.emotion,
      environment: parsed.data.environment,
    });
    if (!ok) return NextResponse.json({ error: "Escena no encontrada o sin cambios" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[API /scenes/plan]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
