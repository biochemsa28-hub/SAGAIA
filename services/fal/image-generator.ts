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

// ─── Prompt sanitizer (fallback for safety blocks) ────────────────────────────

function softenPrompt(prompt: string): string {
  return prompt
    .replace(/\b(blood|gore|murder|kill|dead body|corpse|violent|brutal|horrific)\b/gi, "dramatic")
    .replace(/\b(demon|devil|satan|evil spirit)\b/gi, "mysterious figure")
    .replace(/\b(suicide|death|dying)\b/gi, "dark moment")
    .replace(/\b(weapon|gun|knife|blade)\b/gi, "object")
    + ", cinematic, atmospheric, dramatic lighting, high quality";
}

// ─── Mock ─────────────────────────────────────────────────────────────────────

async function generateMock(projectId: string, sceneNumber: number): Promise<ImageGenerationResult> {
  const dir = join(getStorageDir(), "images", projectId);
  mkdirSync(dir, { recursive: true });
  const tinyPng = Buffer.from(
    "89504e470d0a1a0a0000000d494844520000000100000001080200000090" +
    "012e00000000c4944415478016360f8cfc000000200017ef4a2f0000000049454e44ae426082",
    "hex"
  );
  const filePath = join(dir, `scene_${sceneNumber}.png`);
  writeFileSync(filePath, tinyPng);
  return { success: true, filePath, url: "/placeholder.png", mock: true, durationMs: 0 };
}

// ─── Real fal.ai (Flux Schnell) ───────────────────────────────────────────────

type FalResult = { images?: Array<{ url: string; content_type: string }> };

async function callFlux(prompt: string): Promise<string | null> {
  const result = await fal.subscribe("fal-ai/flux/schnell", {
    input: {
      prompt,
      image_size: "portrait_16_9" as const,
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: false,
    },
    logs: false,
  }) as FalResult;
  return result.images?.[0]?.url ?? null;
}

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

  // Try original prompt, then soften if blocked
  let imageUrl = await callFlux(prompt);
  if (!imageUrl) {
    console.log(`[fal.ai] Safety block on scene ${sceneNumber}, retrying with softened prompt`);
    imageUrl = await callFlux(softenPrompt(prompt));
  }
  if (!imageUrl) throw new Error("fal.ai returned no image after retry");

  // Download and save
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const dir = join(getStorageDir(), "images", projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${sceneNumber}.jpg`);
  writeFileSync(filePath, buffer);

  return { success: true, filePath, url: imageUrl, durationMs: Date.now() - t0 };
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

    if (!result.mock) await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}
