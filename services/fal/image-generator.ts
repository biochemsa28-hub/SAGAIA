import { fal } from "@fal-ai/client";
import { writeFileSync, mkdirSync } from "fs";
import { join, isAbsolute, resolve } from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImageGenerationResult {
  success: boolean;
  filePath?: string;
  url?: string;
  sceneNumber?: number;
  durationMs?: number;
  error?: string;
  mock?: boolean;
}

export interface SceneImageResult extends ImageGenerationResult {
  sceneNumber: number;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function getStorageDir(): string {
  if (process.env.VERCEL) return "/tmp/storage";
  const raw = process.env.STORAGE_PATH ?? "./storage";
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

// ─── Mock ─────────────────────────────────────────────────────────────────────

async function generateMock(projectId: string, sceneNumber: number): Promise<ImageGenerationResult> {
  const dir = join(getStorageDir(), "images", projectId);
  mkdirSync(dir, { recursive: true });
  // Write a tiny 1x1 PNG placeholder
  const tinyPng = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108020000009001" +
    "2e00000000c4944415478016360f8cfc000000200017ef4a2f00000000049454e44ae426082",
    "hex"
  );
  const filePath = join(dir, `scene_${sceneNumber}.png`);
  writeFileSync(filePath, tinyPng);
  return { success: true, filePath, url: "/placeholder.png", mock: true, durationMs: 0 };
}

// ─── Real fal.ai (Flux Pro) ───────────────────────────────────────────────────

async function generateReal(params: {
  prompt: string;
  projectId: string;
  sceneNumber: number;
}): Promise<ImageGenerationResult> {
  const { prompt, projectId, sceneNumber } = params;
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY not set");

  fal.config({ credentials: apiKey });

  const t0 = Date.now();

  const result = await fal.subscribe("fal-ai/flux/schnell", {
    input: {
      prompt,
      image_size: "portrait_16_9" as const,   // 9:16 — perfect for Reels/Shorts/TikTok
      num_inference_steps: 4,         // schnell is optimized for 4 steps
      num_images: 1,
      enable_safety_checker: true,
    },
    logs: false,
  }) as { images?: Array<{ url: string; content_type: string }> };

  const imageUrl = result.images?.[0]?.url;
  if (!imageUrl) throw new Error("fal.ai returned no image");

  // Download and save locally
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const dir = join(getStorageDir(), "images", projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${sceneNumber}.jpg`);
  writeFileSync(filePath, buffer);

  return {
    success: true,
    filePath,
    url: imageUrl,
    durationMs: Date.now() - t0,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateSceneImage(params: {
  prompt: string;
  projectId: string;
  sceneNumber: number;
}): Promise<ImageGenerationResult> {
  const isMock = process.env.FORCE_MOCK_IMAGE === "true" || !process.env.FAL_API_KEY;
  if (isMock) return generateMock(params.projectId, params.sceneNumber);

  try {
    return await generateReal(params);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[fal.ai]", error);
    return { success: false, error };
  }
}

export async function generateProjectImages(params: {
  projectId: string;
  scenes: Array<{ scene_number: number; image_prompt: string }>;
}): Promise<SceneImageResult[]> {
  const results: SceneImageResult[] = [];

  for (const scene of params.scenes) {
    const result = await generateSceneImage({
      prompt: scene.image_prompt,
      projectId: params.projectId,
      sceneNumber: scene.scene_number,
    });
    results.push({ ...result, sceneNumber: scene.scene_number });

    // Small delay between requests to be respectful of rate limits
    if (!result.mock) await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}
