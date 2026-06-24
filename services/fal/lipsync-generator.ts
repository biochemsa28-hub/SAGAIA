import { fal } from "@fal-ai/client";

// ─── Lip-sync (talking character) generator ────────────────────────────────────
// Turns a still character image + the scene's narration audio into a talking clip
// where the mouth moves with the words. Default = VEED Fabric 1.0. Swap to a more
// EXPRESSIVE model (e.g. Hedra Character-3) via LIPSYNC_MODEL — the input shape is
// adapted per model. The output MP4 ALREADY contains the synced narration audio, so
// the assembler must not add a separate narration track for these scenes.

const LIPSYNC_MODEL = process.env.LIPSYNC_MODEL ?? "veed/fabric-1.0";
const LIPSYNC_RESOLUTION = process.env.VIDEO_RESOLUTION ?? "720p";

const isHedra = (model: string) => /hedra/i.test(model);

// Build the per-model input. Hedra Character-3 takes image + audio + aspect_ratio
// (and an optional prompt); VEED Fabric takes image + audio + resolution.
function buildLipsyncInput(imageUrl: string, audioUrl: string): Record<string, unknown> {
  if (isHedra(LIPSYNC_MODEL)) {
    return { image_url: imageUrl, audio_url: audioUrl, aspect_ratio: "9:16" };
  }
  return { image_url: imageUrl, audio_url: audioUrl, resolution: LIPSYNC_RESOLUTION };
}

export interface LipsyncJob {
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

// Submit one lip-sync job per scene (image + audio). Returns immediately (queue).
export async function submitLipsyncJobs(params: {
  scenes: Array<{ scene_number: number; image_url: string; audio_url: string }>;
}): Promise<LipsyncJob[]> {
  fal.config({ credentials: getApiKey() });

  const jobs: LipsyncJob[] = [];
  for (const scene of params.scenes) {
    if (!scene.image_url || !scene.audio_url) {
      jobs.push({ sceneNumber: scene.scene_number, requestId: "", status: "failed", error: "Falta imagen o audio para lip-sync" });
      continue;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.queue.submit as any)(LIPSYNC_MODEL, {
        input: buildLipsyncInput(scene.image_url, scene.audio_url),
      }) as { request_id: string };
      jobs.push({ sceneNumber: scene.scene_number, requestId: result.request_id, status: "queued" });
    } catch (err) {
      jobs.push({ sceneNumber: scene.scene_number, requestId: "", status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }
  return jobs;
}

export async function checkLipsyncJob(requestId: string): Promise<{
  status: "queued" | "in_progress" | "completed" | "failed";
  url?: string;
  error?: string;
}> {
  fal.config({ credentials: getApiKey() });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = await (fal.queue.status as any)(LIPSYNC_MODEL, { requestId, logs: false }) as { status: string };
    if (status.status === "COMPLETED") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.queue.result as any)(LIPSYNC_MODEL, { requestId }) as Record<string, unknown>;
      const data = (result?.["data"] ?? result) as Record<string, unknown>;
      // Different models nest the URL differently: VEED → data.video.url; some
      // Hedra/others → data.video (string) or data.url. Cover all shapes.
      const v = data?.["video"];
      const url = (typeof v === "object" && v ? (v as { url?: string }).url : typeof v === "string" ? v : undefined)
        ?? (data?.["url"] as string | undefined);
      return { status: "completed", url };
    }
    if (status.status === "FAILED") return { status: "failed", error: "Lip-sync job failed" };
    if (status.status === "IN_PROGRESS") return { status: "in_progress" };
    return { status: "queued" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
