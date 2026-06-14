import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail, updateProjectStatus, upsertAsset } from "@/lib/db/repository";
import { generateProjectImages } from "@/services/fal/image-generator";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  project_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "project_id requerido" }, { status: 400 });

    await initDb();
    const detail = await getProjectDetail(parsed.data.project_id, session.user.id);
    if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    if (!detail.scenes?.length) return NextResponse.json({ error: "El proyecto no tiene escenas" }, { status: 422 });

    const results = await generateProjectImages({
      projectId: parsed.data.project_id,
      scenes: detail.scenes.map((s) => ({
        scene_number: s.scene_number,
        image_prompt: s.image_prompt ?? "",
      })),
    });

    // Save URLs to DB assets table
    await Promise.all(
      results
        .filter((r) => r.success && r.url)
        .map((r) =>
          upsertAsset({
            projectId: parsed.data.project_id,
            sceneNumber: r.sceneNumber,
            assetType: "image",
            publicUrl: r.url!,
            filePath: r.filePath,
            mimeType: "image/jpeg",
          })
        )
    );

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    await updateProjectStatus(
      parsed.data.project_id,
      failed === 0 ? "images_done" : "images_partial"
    );

    // Log errors for debugging
    results.filter(r => !r.success).forEach(r => {
      console.error(`[images] Scene ${r.sceneNumber} failed:`, r.error);
    });

    const firstError = results.find(r => !r.success)?.error;
    return NextResponse.json({
      success: succeeded > 0,
      total: results.length,
      succeeded,
      failed,
      error: succeeded === 0 ? (firstError ?? "Todas las imágenes fallaron") : undefined,
      mock: results[0]?.mock ?? false,
      errors: results.filter(r => !r.success).map(r => ({ scene: r.sceneNumber, error: r.error })),
      scenes: results.map((r) => ({
        scene_number: r.sceneNumber,
        success: r.success,
        url: r.url,
        error: r.error,
        duration_ms: r.durationMs,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /images]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET() {
  const hasKey = Boolean(process.env.FAL_API_KEY);
  const isMock = process.env.FORCE_MOCK_IMAGE === "true" || !hasKey;
  return NextResponse.json({ status: "ok", mock_mode: isMock, has_key: hasKey });
}
