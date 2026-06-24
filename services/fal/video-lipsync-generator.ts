import { fal } from "@fal-ai/client";

// ─── Video lip-sync (stage 2 of the PRO pipeline) ──────────────────────────────
// Takes a MOVING video (e.g. a Seedance cinematic clip) + the scene's audio and
// applies accurate mouth movement ON the video — so the scene has real motion AND
// a talking character. This is the "looks like a real film" pipeline:
//   image → Seedance (motion) → THIS (video lip-sync) → final talking clip.
// Default model is sync.so (sync-lipsync) on fal; override via VIDEO_LIPSYNC_MODEL
// (e.g. "fal-ai/latentsync"). Different from lipsync-generator.ts which is IMAGE→talk.

const VIDEO_LIPSYNC_MODEL = process.env.VIDEO_LIPSYNC_MODEL ?? "fal-ai/sync-lipsync";

export interface VideoLipsyncJob {
  sceneNumber: number;
  requestId: string;
  status: "queued" | "done" | "failed";
  url?: string;
  error?: string;
}

function getApiKey(): string {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY not set");
  return key;
}

// Submit one video-lipsync job per scene (moving video + audio). Returns queue ids.
export async function submitVideoLipsyncJobs(params: {
  scenes: Array<{ scene_number: number; video_url: string; audio_url: string }>;
}): Promise<VideoLipsyncJob[]> {
  fal.config({ credentials: getApiKey() });

  const jobs: VideoLipsyncJob[] = [];
  for (const scene of params.scenes) {
    if (!scene.video_url || !scene.audio_url) {
      jobs.push({ sceneNumber: scene.scene_number, requestId: "", status: "failed", error: "Falta video o audio para lip-sync" });
      continue;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.queue.submit as any)(VIDEO_LIPSYNC_MODEL, {
        input: { video_url: scene.video_url, audio_url: scene.audio_url },
      }) as { request_id: string };
      jobs.push({ sceneNumber: scene.scene_number, requestId: result.request_id, status: "queued" });
    } catch (err) {
      jobs.push({ sceneNumber: scene.scene_number, requestId: "", status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }
  return jobs;
}

export async function checkVideoLipsyncJob(requestId: string): Promise<{
  status: "queued" | "in_progress" | "completed" | "failed";
  url?: string;
  error?: string;
}> {
  fal.config({ credentials: getApiKey() });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = await (fal.queue.status as any)(VIDEO_LIPSYNC_MODEL, { requestId, logs: false }) as { status: string };
    if (status.status === "COMPLETED") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.queue.result as any)(VIDEO_LIPSYNC_MODEL, { requestId }) as Record<string, unknown>;
      const data = (result?.["data"] ?? result) as Record<string, unknown>;
      const video = data?.["video"] as { url: string } | undefined;
      return { status: "completed", url: video?.url };
    }
    if (status.status === "FAILED") return { status: "failed", error: "Video lip-sync job failed" };
    if (status.status === "IN_PROGRESS") return { status: "in_progress" };
    return { status: "queued" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
