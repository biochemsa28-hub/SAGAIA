import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail, updateProjectStatus, upsertAsset, getUserById } from "@/lib/db/repository";
import { submitVideoJobs, checkVideoJob, downloadVideo } from "@/services/fal/video-generator";
import { submitLipsyncJobs, checkLipsyncJob } from "@/services/fal/lipsync-generator";
import { submitVideoLipsyncJobs, checkVideoLipsyncJob } from "@/services/fal/video-lipsync-generator";
import { initDb } from "@/lib/db";
import { resolveProjectTier, PRO_PIPELINE } from "@/lib/config";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const SubmitSchema = z.object({
  project_id: z.string().uuid(),
  // "lipsync_submit" = PRO pipeline stage 2: video lip-sync over the Seedance clips.
  action: z.enum(["submit", "collect", "lipsync_submit"]).default("submit"),
  // PRO pipeline stage for collect ("motion" = Seedance, "lipsync" = video lip-sync).
  stage: z.enum(["motion", "lipsync"]).optional(),
  scene_number: z.number().int().positive().optional(), // regenerate a single scene
  jobs: z.array(z.object({
    scene_number: z.number(),
    request_id: z.string(),
  })).optional(),
  // For lipsync_submit: the completed Seedance motion clips to lip-sync.
  motion: z.array(z.object({
    scene_number: z.number(),
    video_url: z.string(),
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

      // Effective tier = project's choice, clamped to the owner's plan.
      const user = await getUserById(session.user.id).catch(() => null);
      const tier = resolveProjectTier(detail.project.animation_tier, user?.plan ?? "free");
      // Ken Burns tier never uses a video model — short-circuit so no credits are spent.
      if (tier === "kenburns") {
        return NextResponse.json({ success: true, action: "skipped", reason: "kenburns_tier", total: 0, jobs: [] });
      }

      if (!detail.scenes?.length) return NextResponse.json({ error: "Sin escenas" }, { status: 422 });

      const imageAssets = detail.assets?.filter((a) => a.asset_type === "image") ?? [];
      if (!imageAssets.length) {
        return NextResponse.json({ error: "Genera las imágenes primero" }, { status: 422 });
      }

      // Map scene.id -> image asset (robust) with positional fallback (legacy)
      const imageBySceneId = new Map(
        imageAssets.filter((a) => a.scene_id).map((a) => [a.scene_id, a])
      );

      // ── TALKING tier ──────────────────────────────────────────────────────────
      if (tier === "talking") {
        const audioAssets = detail.assets?.filter((a) => a.asset_type === "audio") ?? [];
        if (!audioAssets.length) {
          return NextResponse.json({ error: "Genera la voz primero (lip-sync necesita el audio)" }, { status: 422 });
        }
        const audioBySceneId = new Map(audioAssets.filter((a) => a.scene_id).map((a) => [a.scene_id, a]));
        const sourceScenesT = parsed.data.scene_number
          ? detail.scenes.filter((s) => s.scene_number === parsed.data.scene_number)
          : detail.scenes;

        // ── PRO pipeline: stage 1 = Seedance cinematic motion on the scene image.
        // Stage 2 (video lip-sync) runs via the "lipsync_submit" action once these
        // motion clips finish — so the scene has real motion AND a synced mouth.
        if (PRO_PIPELINE) {
          // Match the clip length to the real voice duration so motion + lip-sync
          // stay in sync (fall back to the scene's planned duration).
          const audioDur = (sceneId: string): number | undefined => {
            const meta = audioBySceneId.get(sceneId)?.metadata;
            if (!meta) return undefined;
            try { const m = JSON.parse(meta) as { duration?: number }; return typeof m.duration === "number" ? m.duration : undefined; } catch { return undefined; }
          };
          const motionScenes = sourceScenesT
            .map((scene, idx) => ({
              scene_number: scene.scene_number,
              animation_prompt: scene.animation_prompt ?? "subtle cinematic camera movement, natural motion",
              image_url: imageBySceneId.get(scene.id)?.public_url ?? imageAssets[idx]?.public_url ?? "",
              duration_seconds: Math.max(scene.duration_seconds ?? 5, audioDur(scene.id) ?? 0),
            }))
            .filter((s) => s.image_url);
          const motionJobs = await submitVideoJobs({ scenes: motionScenes });
          return NextResponse.json({
            success: true,
            action: "submitted",
            tier: "talking",
            pipeline: "pro",
            stage: "motion",
            total: motionJobs.length,
            jobs: motionJobs.map((j) => ({ scene_number: j.sceneNumber, request_id: j.requestId, status: j.status, error: j.error })),
          });
        }

        // ── Standard: image + scene audio → talking clip (VEED Fabric).
        const lipScenes = sourceScenesT
          .map((scene, idx) => ({
            scene_number: scene.scene_number,
            image_url: imageBySceneId.get(scene.id)?.public_url ?? imageAssets[idx]?.public_url ?? "",
            audio_url: audioBySceneId.get(scene.id)?.public_url ?? "",
          }))
          .filter((s) => s.image_url && s.audio_url);
        const lipJobs = await submitLipsyncJobs({ scenes: lipScenes });
        return NextResponse.json({
          success: true,
          action: "submitted",
          tier: "talking",
          total: lipJobs.length,
          jobs: lipJobs.map((j) => ({ scene_number: j.sceneNumber, request_id: j.requestId, status: j.status, error: j.error })),
        });
      }

      // Map scene.id -> real audio duration (so Kling picks 10s when the voice
      // is longer than 5s, keeping clip + narration in sync).
      const audioDurBySceneId = new Map<string, number>();
      for (const a of detail.assets ?? []) {
        if (a.asset_type !== "audio" || !a.scene_id || !a.metadata) continue;
        try {
          const m = JSON.parse(a.metadata) as { duration?: number };
          if (typeof m.duration === "number" && m.duration > 0) audioDurBySceneId.set(a.scene_id, m.duration);
        } catch { /* ignore */ }
      }

      // Single-scene regeneration: only submit the requested scene
      const sourceScenes = parsed.data.scene_number
        ? detail.scenes.filter((s) => s.scene_number === parsed.data.scene_number)
        : detail.scenes;

      const scenes = sourceScenes
        .map((scene, idx) => {
          const matched = imageBySceneId.get(scene.id)?.public_url;
          const fallback = imageAssets[idx]?.public_url ?? imageAssets[0]?.public_url ?? "";
          const realAudio = audioDurBySceneId.get(scene.id);
          const effectiveDur = Math.max(scene.duration_seconds ?? 5, realAudio ?? 0);
          return {
            scene_number: scene.scene_number,
            animation_prompt: scene.animation_prompt ?? "cinematic camera movement, smooth motion",
            image_url: matched ?? fallback,
            duration_seconds: effectiveDur,
          };
        })
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

    // ── ACTION: lipsync_submit (PRO pipeline stage 2) ──────────────────────────
    // Takes the finished Seedance motion clips + each scene's audio and applies
    // video lip-sync (sync.so) → the final talking clip WITH real motion.
    if (parsed.data.action === "lipsync_submit" && parsed.data.motion?.length) {
      const lsDetail = await getProjectDetail(parsed.data.project_id, session.user.id);
      if (!lsDetail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
      const audioBySceneId = new Map(
        (lsDetail.assets ?? []).filter((a) => a.asset_type === "audio" && a.scene_id).map((a) => [a.scene_id, a])
      );
      const sceneAudio = new Map<number, string>();
      for (const s of lsDetail.scenes ?? []) {
        const url = audioBySceneId.get(s.id)?.public_url;
        if (url) sceneAudio.set(s.scene_number, url);
      }
      const lsScenes = parsed.data.motion
        .map((m) => ({ scene_number: m.scene_number, video_url: m.video_url, audio_url: sceneAudio.get(m.scene_number) ?? "" }))
        .filter((s) => s.video_url && s.audio_url);
      const lsJobs = await submitVideoLipsyncJobs({ scenes: lsScenes });
      return NextResponse.json({
        success: true,
        action: "submitted",
        pipeline: "pro",
        stage: "lipsync",
        total: lsJobs.length,
        jobs: lsJobs.map((j) => ({ scene_number: j.sceneNumber, request_id: j.requestId, status: j.status, error: j.error })),
      });
    }

    // ── ACTION: collect ───────────────────────────────────────────────────────
    if (parsed.data.action === "collect" && parsed.data.jobs?.length) {
      // Stage-aware checker: PRO motion → Seedance; PRO lipsync → video lip-sync;
      // otherwise talking → VEED image lip-sync; cinematic → Seedance.
      const collectDetail = await getProjectDetail(parsed.data.project_id, session.user.id);
      const collectUser = await getUserById(session.user.id).catch(() => null);
      const collectTier = resolveProjectTier(collectDetail?.project.animation_tier, collectUser?.plan ?? "free");
      const stage = parsed.data.stage;
      const checkJob = stage === "motion" ? checkVideoJob
        : stage === "lipsync" ? checkVideoLipsyncJob
        : collectTier === "talking" ? checkLipsyncJob : checkVideoJob;
      const results = await Promise.all(
        parsed.data.jobs.map(async (job) => {
          const status = await checkJob(job.request_id);
          return { scene_number: job.scene_number, request_id: job.request_id, ...status };
        })
      );

      // Stage "motion" clips are INTERMEDIATE (they still need lip-sync) — don't
      // save them as the scene's final video asset; just hand the URLs back.
      const saveAsset = stage !== "motion";
      const completed = saveAsset ? results.filter((r) => r.status === "completed" && r.url) : [];
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
  return NextResponse.json({ status: "ok", provider: process.env.VIDEO_MODEL ?? "seedance-pro", has_key: hasKey });
}
