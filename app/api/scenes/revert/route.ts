import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revertAssetVersion } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  project_id: z.string().uuid(),
  scene_number: z.number().int().positive(),
  target_url: z.string().url(),
});

// POST /api/scenes/revert — vuelve una escena a una versión anterior de su imagen.
//
// Regenerar cuesta dinero; deshacer no puede costar lo mismo. La imagen anterior
// ya está generada y pagada: volver a ella es un cambio de puntero, no una
// generación. Sin esto, una regeneración que salía peor dejaba al usuario
// pagando otra vez para intentar recuperar lo que ya tenía.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });

    await initDb();
    // La verificación de propiedad y de que la URL sea una versión REAL de este
    // asset vive dentro de revertAssetVersion — un solo lugar donde mirarla.
    const ok = await revertAssetVersion({
      projectId: parsed.data.project_id,
      userId: session.user.id,
      sceneNumber: parsed.data.scene_number,
      assetType: "image",
      targetUrl: parsed.data.target_url,
    });
    if (!ok) return NextResponse.json({ error: "Esa versión no existe para esta escena" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[API /scenes/revert]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
