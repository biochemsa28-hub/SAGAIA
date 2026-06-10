import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail, updateProjectStatus, upsertAsset } from "@/lib/db/repository";
import { generateProjectVideos } from "@/services/fal/video-generator";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — Kling takes ~30s per clip

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

    // Get image assets for this project (need image URLs to animate)
    const imageAssets = detail.assets?.filter((a) => a.asset_type === "image") ?? [];
    if (!imageAssets.length) {
      return NextResponse.json(
        { error: "Genera las imágenes primero antes de animar" },
        { status: 422 }
      );
    }

    // Build scene list with image URLs
    const scenesWithImages = detail.scenes
      .map((scene) => {
        const asset = imageAssets.find((a) => {
          // Match by scene_id or by order
          return a.scene_id
            ? a.scene_id === scene.id
            : imageAssets.indexOf(a) === scene.scene_number - 1;
        });
        return {
          scene_number: scene.scene_number,
          animation_prompt: scene.animation_prompt ?? "cinematic camera movement, smooth motion",
          image_url: asset?.public_url ?? null,
        };
      })
      .filter((s): s is typeof s & { image_url: string } => s.image_url !== null);

    if (!scenesWithImages.length) {
      return NextResponse.json(
        { error: "No se encontraron imágenes asociadas a las escenas" },
        { status: 422 }
      );
    }

    await updateProjectStatus(parsed.data.project_id, "generating");

    const results = await generateProjectVideos({
      projectId: parsed.data.project_id,
      scenes: scenesWithImages,
    });

    // Save video URLs to assets table
    await Promise.all(
      results
        .filter((r) => r.success && r.url)
        .map((r) =>
          upsertAsset({
            projectId: parsed.data.project_id,
            sceneNumber: r.sceneNumber,
            assetType: "video",
            publicUrl: r.url!,
            filePath: r.filePath,
            mimeType: "video/mp4",
          })
        )
    );

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    await updateProjectStatus(
      parsed.data.project_id,
      failed === 0 ? "ready" : "images_done"
    );

    return NextResponse.json({
      success: true,
      total: results.length,
      succeeded,
      failed,
      mock: results[0]?.mock ?? false,
      errors: results.filter((r) => !r.success).map((r) => ({ scene: r.sceneNumber, error: r.error })),
      scenes: results.map((r) => ({
        scene_number: r.sceneNumber,
        success: r.success,
        url: r.url,
        file_size_bytes: r.fileSizeBytes,
        duration_ms: r.durationMs,
        error: r.error,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /videos]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET() {
  const hasKey = Boolean(process.env.FAL_API_KEY);
  return NextResponse.json({ status: "ok", provider: "kling-v1.6", has_key: hasKey });
}
