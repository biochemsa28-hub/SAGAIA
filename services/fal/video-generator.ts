import { fal } from "@fal-ai/client";
import { writeFileSync, mkdirSync } from "fs";
import { join, isAbsolute, resolve } from "path";

export interface VideoJob {
  sceneNumber: number;
  requestId: string;
  status: "queued" | "done" | "failed";
  url?: string;
  error?: string;
}

export interface VideoGenerationResult {
  success: boolean;
  filePath?: string;
  url?: string;
  durationMs?: number;
  fileSizeBytes?: number;
  error?: string;
  mock?: boolean;
}

export interface SceneVideoResult extends VideoGenerationResult {
  sceneNumber: number;
}

function getStorageDir(): string {
  if (process.env.VERCEL) return "/tmp/storage";
  const raw = process.env.STORAGE_PATH ?? "./storage";
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

function getApiKey(): string {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY not set");
  return key;
}

// ─── Submit jobs to fal queue (returns immediately) ───────────────────────────

export async function submitVideoJobs(params: {
  scenes: Array<{ scene_number: number; animation_prompt: string; image_url: string }>;
}): Promise<VideoJob[]> {
  fal.config({ credentials: getApiKey() });

  const jobs: VideoJob[] = [];
  for (const scene of params.scenes) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.queue.submit as any)(
        "fal-ai/kling-video/v1.6/standard/image-to-video",
        {
          input: {
            prompt: scene.animation_prompt,
            image_url: scene.image_url,
            duration: "5",
          },
        }
      ) as { request_id: string };

      jobs.push({
        sceneNumber: scene.scene_number,
        requestId: result.request_id,
        status: "queued",
      });
    } catch (err) {
      jobs.push({
        sceneNumber: scene.scene_number,
        requestId: "",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return jobs;
}

// ─── Check status of a submitted job ─────────────────────────────────────────

export async function checkVideoJob(requestId: string): Promise<{
  status: "queued" | "in_progress" | "completed" | "failed";
  url?: string;
  error?: string;
}> {
  fal.config({ credentials: getApiKey() });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = await (fal.queue.status as any)(
      "fal-ai/kling-video/v1.6/standard/image-to-video",
      { requestId, logs: false }
    ) as { status: string };

    if (status.status === "COMPLETED") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.queue.result as any)(
        "fal-ai/kling-video/v1.6/standard/image-to-video",
        { requestId }
      ) as Record<string, unknown>;

      const data = (result?.["data"] ?? result) as Record<string, unknown>;
      const video = data?.["video"] as { url: string } | undefined;
      return { status: "completed", url: video?.url };
    }

    if (status.status === "FAILED") return { status: "failed", error: "Kling job failed" };
    if (status.status === "IN_PROGRESS") return { status: "in_progress" };
    return { status: "queued" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Download and save a completed video ─────────────────────────────────────

export async function downloadVideo(params: {
  url: string;
  projectId: string;
  sceneNumber: number;
}): Promise<{ filePath: string; fileSizeBytes: number }> {
  const response = await fetch(params.url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const dir = join(getStorageDir(), "videos", params.projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${params.sceneNumber}.mp4`);
  writeFileSync(filePath, buffer);

  return { filePath, fileSizeBytes: buffer.length };
}
