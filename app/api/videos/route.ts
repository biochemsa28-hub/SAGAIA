import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail, updateProjectStatus, upsertAsset } from "@/lib/db/repository";
import { submitVideoJobs, checkVideoJob, downloadVideo } from "@/services/fal/video-generator";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const SubmitSchema = z.object({
  project_id: z.string().uuid(),
  action: z.enum(["submit", "collect"]).default("submit"),
  jobs: z.array(z.object({
    scene_number: z.number(),
    request_id: z.string(),
  })).optional(),
});

// POST /api/videos — submit jobs OR collect results
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json();
    const parsed = SubmitSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    await initDb();

    // ── ACTION: submit ────────────────────────────────────────────────────────
    if (parsed.data.action === "submit") {
      const detail = await getProjectDetail(parsed.data.project_id, session.user.id);
      if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
      if (!detail.scenes?.length) return NextResponse.json({ error: "Sin escenas" }, { status: 422 });

      const imageAssets = detail.assets?.filter((a) => a.asset_type === "image") ?? [];
      if (!imageAssets.length) {
        return NextResponse.json({ error: "Genera las imágenes primero" }, { status: 422 });
      }

      const scenes = detail.scenes
        .map((scene, idx) => ({
          scene_number: scene.scene_number,
          animation_prompt: scene.animation_prompt ?? "cinematic camera movement, smooth motion",
          image_url: imageAssets[idx]?.public_url ?? imageAssets[0]?.public_url ?? "",
          duration_seconds: scene.duration_seconds ?? 5,
        }))
        .filter((s) => s.image_url);

      const jobs = await submitVideoJobs({ scenes });

      return NextResponse.json({
        success: true,
        action: "submitted",
        total: jobs.length,
        jobs: jobs.map((j) => ({
          scene_number: j.sceneNumber,
          request_id: j.requestId,
          status: j.status,
          error: j.error,
        })),
      });
    }

    // ── ACTION: collect ───────────────────────────────────────────────────────
    if (parsed.data.action === "collect" && parsed.data.jobs?.length) {
      const results = await Promise.all(
        parsed.data.jobs.map(async (job) => {
          const status = await checkVideoJob(job.request_id);
          return { scene_number: job.scene_number, request_id: job.request_id, ...status };
        })
      );

      // Download + save completed ones
      const completed = results.filter((r) => r.status === "completed" && r.url);
      for (const r of completed) {
        try {
          const { filePath } = await downloadVideo({
            url: r.url!,
            projectId: parsed.data.project_id,
            sceneNumber: r.scene_number,
          });
          await upsertAsset({
            projectId: parsed.data.project_id,
            sceneNumber: r.scene_number,
            assetType: "video",
            publicUrl: r.url!,
            filePath,
            mimeType: "video/mp4",
          });
        } catch (e) {
          console.error("[videos collect]", e);
        }
      }

      const allDone = results.every((r) => r.status === "completed" || r.status === "failed");
      if (allDone) {
        const anySuccess = results.some((r) => r.status === "completed");
        await updateProjectStatus(parsed.data.project_id, anySuccess ? "ready" : "images_done");
      }

      return NextResponse.json({
        success: true,
        action: "collect",
        all_done: allDone,
        scenes: results,
      });
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /videos]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const hasKey = Boolean(process.env.FAL_API_KEY);
  return NextResponse.json({ status: "ok", provider: "kling-v1.6", has_key: hasKey });
}
