import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail, updateProjectStatus, upsertAsset, getCharacter, getProjectCast } from "@/lib/db/repository";
import { generateProjectImages } from "@/services/fal/image-generator";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  project_id: z.string().uuid(),
  scene_number: z.number().int().positive().optional(), // regenerate a single scene
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

    // Single-scene regeneration: filter to just the requested scene
    const targetScenes = parsed.data.scene_number
      ? detail.scenes.filter((s) => s.scene_number === parsed.data.scene_number)
      : detail.scenes;
    if (!targetScenes.length) return NextResponse.json({ error: "Escena no encontrada" }, { status: 404 });

    // Decide the character reference image:
    //  1) A SAVED recurring character linked to the project → highest priority,
    //     so EVERY scene reuses that character's locked-in look.
    //  2) Otherwise, for single-scene regen of scene > 1, use scene 1's image so
    //     the regenerated scene keeps the same person.
    let referenceImageUrl: string | undefined;
    if (detail.project.character_id) {
      const character = await getCharacter(detail.project.character_id, session.user.id);
      referenceImageUrl = character?.reference_image_url ?? undefined;
    }
    // A user-uploaded product/creative image drives ALL scenes so the REAL asset
    // appears in the ad (the "looks real, made with AI" moment).
    if (!referenceImageUrl && detail.project.reference_image_url) {
      referenceImageUrl = detail.project.reference_image_url;
    }
    if (!referenceImageUrl && parsed.data.scene_number && parsed.data.scene_number > 1) {
      const scene1 = detail.scenes.find((s) => s.scene_number === 1);
      const refAsset = detail.assets?.find(
        (a) => a.asset_type === "image" && a.scene_id === scene1?.id
      );
      referenceImageUrl = refAsset?.public_url ?? undefined;
    }

    // Phase 4: build a per-scene reference from the project cast — each scene's
    // speaker → that character's selected portrait. Only applies when NO single
    // saved character overrides everything (that takes priority above).
    let sceneReferences: Map<number, string> | undefined;
    if (!detail.project.character_id) {
      const cast = await getProjectCast(parsed.data.project_id).catch(() => []);
      if (cast.length) {
        const portraitByName = new Map(
          cast.filter((c) => c.reference_image_url).map((c) => [c.name.trim().toLowerCase(), c.reference_image_url!])
        );
        const map = new Map<number, string>();
        for (const s of targetScenes) {
          const url = s.speaker ? portraitByName.get(s.speaker.trim().toLowerCase()) : undefined;
          if (url) map.set(s.scene_number, url);
        }
        if (map.size) sceneReferences = map;
      }
    }

    const results = await generateProjectImages({
      projectId: parsed.data.project_id,
      niche: detail.project.niche,
      visualStyle: detail.project.visual_style,
      scenes: targetScenes.map((s) => ({
        scene_number: s.scene_number,
        image_prompt: s.image_prompt ?? "",
      })),
      referenceImageUrl,
      sceneReferences,
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
