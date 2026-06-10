import { fal } from "@fal-ai/client";
import { writeFileSync, mkdirSync } from "fs";
import { join, isAbsolute, resolve } from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Storage ──────────────────────────────────────────────────────────────────

function getStorageDir(): string {
  if (process.env.VERCEL) return "/tmp/storage";
  const raw = process.env.STORAGE_PATH ?? "./storage";
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

// ─── Mock ─────────────────────────────────────────────────────────────────────

async function generateMock(projectId: string, sceneNumber: number): Promise<VideoGenerationResult> {
  const dir = join(getStorageDir(), "videos", projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${sceneNumber}.mp4`);
  writeFileSync(filePath, Buffer.from("MOCK_VIDEO"));
  return { success: true, filePath, url: "/placeholder.mp4", mock: true, durationMs: 0 };
}

// ─── Real Kling via fal.ai ────────────────────────────────────────────────────

type KlingResult = { video?: { url: string; file_size?: number } };

async function generateReal(params: {
  imageUrl: string;
  animationPrompt: string;
  projectId: string;
  sceneNumber: number;
}): Promise<VideoGenerationResult> {
  const { imageUrl, animationPrompt, projectId, sceneNumber } = params;
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY not set");

  fal.config({ credentials: apiKey });
  const t0 = Date.now();

  const result = await fal.subscribe("fal-ai/kling-video/v1.6/standard/image-to-video", {
    input: {
      prompt: animationPrompt,
      image_url: imageUrl,
      duration: "5",
    } as Record<string, unknown>,
    logs: false,
  });

  // Extract video URL safely
  const obj = result as Record<string, unknown>;
  const data = (obj?.["data"] ?? obj) as Record<string, unknown>;
  const video = data?.["video"] as KlingResult["video"] | undefined;
  const videoUrl = video?.url ?? null;

  if (!videoUrl) throw new Error("Kling returned no video");

  // Download and save
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const dir = join(getStorageDir(), "videos", projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${sceneNumber}.mp4`);
  writeFileSync(filePath, buffer);

  return {
    success: true,
    filePath,
    url: videoUrl,
    fileSizeBytes: buffer.length,
    durationMs: Date.now() - t0,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateSceneVideo(params: {
  imageUrl: string;
  animationPrompt: string;
  projectId: string;
  sceneNumber: number;
}): Promise<VideoGenerationResult> {
  const isMock = process.env.FORCE_MOCK_VIDEO === "true" || !process.env.FAL_API_KEY;
  if (isMock) return generateMock(params.projectId, params.sceneNumber);

  try {
    return await generateReal(params);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[Kling]", error);
    return { success: false, error };
  }
}

export async function generateProjectVideos(params: {
  projectId: string;
  scenes: Array<{ scene_number: number; animation_prompt: string; image_url: string }>;
}): Promise<SceneVideoResult[]> {
  const results: SceneVideoResult[] = [];

  for (const scene of params.scenes) {
    const result = await generateSceneVideo({
      imageUrl: scene.image_url,
      animationPrompt: scene.animation_prompt,
      projectId: params.projectId,
      sceneNumber: scene.scene_number,
    });
    results.push({ ...result, sceneNumber: scene.scene_number });

    // Kling needs ~30s per clip — small delay between requests
    if (!result.mock && result.success) await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}
