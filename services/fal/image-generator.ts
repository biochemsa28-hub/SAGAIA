import { fal } from "@fal-ai/client";
import { writeFileSync, mkdirSync } from "fs";
import { join, isAbsolute, resolve } from "path";
import { getStyleConfig, type StyleConfig } from "./style-presets";

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

function getStorageDir(): string {
  if (process.env.VERCEL) return "/tmp/storage";
  const raw = process.env.STORAGE_PATH ?? "./storage";
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

function softenPrompt(prompt: string): string {
  return prompt
    .replace(/\b(blood|gore|murder|kill|dead body|corpse|violent|brutal|horrific)\b/gi, "dramatic")
    .replace(/\b(demon|devil|satan|evil spirit)\b/gi, "mysterious figure")
    .replace(/\b(suicide|death|dying)\b/gi, "dark moment")
    .replace(/\b(weapon|gun|knife|blade)\b/gi, "object")
    + ", cinematic, atmospheric, dramatic lighting";
}

async function generateMock(projectId: string, sceneNumber: number): Promise<ImageGenerationResult> {
  const dir = join(getStorageDir(), "images", projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${sceneNumber}.png`);
  writeFileSync(filePath, Buffer.from("PNG_PLACEHOLDER"));
  return { success: true, filePath, url: "/placeholder.png", mock: true, durationMs: 0 };
}

async function callFlux(prompt: string, style: StyleConfig): Promise<string | null> {
  try {
    // Build input — flux-lora endpoint accepts a `loras` array; others ignore it
    const input: Record<string, unknown> = {
      prompt,
      image_size: "portrait_16_9",
      num_inference_steps: style.numInferenceSteps,
      guidance_scale: style.guidanceScale,
      num_images: 1,
      enable_safety_checker: true,
    };
    if (style.loras.length > 0) input["loras"] = style.loras;

    const result = await fal.subscribe(style.model, { input, logs: false });
    // Navigate the response safely regardless of SDK wrapper shape
    const obj = result as Record<string, unknown>;
    const data = (obj?.["data"] ?? obj) as Record<string, unknown>;
    const images = data?.["images"] as Array<Record<string, unknown>> | undefined;
    const url = (images?.[0]?.["url"] as string) ?? null;
    console.log("[fal.ai] model:", style.model, "loras:", style.loras.length);
    console.log("[fal.ai] images count:", images?.length ?? 0);
    console.log("[fal.ai] extracted url:", url ?? "null");
    return url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const body = (e as Record<string, unknown>)?.["body"];
    const status = (e as Record<string, unknown>)?.["status"];
    console.error("[fal.ai callFlux error]", { status, msg, body: JSON.stringify(body).slice(0, 300) });
    return null;
  }
}

async function generateReal(params: {
  prompt: string;
  projectId: string;
  sceneNumber: number;
  niche: string;
  visualStyle: string;
}): Promise<ImageGenerationResult> {
  const { prompt, projectId, sceneNumber, niche, visualStyle } = params;
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY not set");

  fal.config({ credentials: apiKey });
  const t0 = Date.now();

  // Apply niche-specific cinematic style on top of the scene prompt
  const style = getStyleConfig(niche, visualStyle);
  const styledPrompt = `${prompt}, ${style.promptSuffix}`;

  // Try styled prompt, retry with softened if null returned (content filter)
  let imageUrl = await callFlux(styledPrompt, style);
  if (!imageUrl) {
    console.log(`[fal.ai] Retrying scene ${sceneNumber} with softened prompt`);
    imageUrl = await callFlux(`${softenPrompt(prompt)}, ${style.promptSuffix}`, style);
  }
  if (!imageUrl) throw new Error("fal.ai returned no image after retry");

  // Download and save
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const dir = join(getStorageDir(), "images", projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${sceneNumber}.jpg`);
  writeFileSync(filePath, buffer);

  return { success: true, filePath, url: imageUrl, durationMs: Date.now() - t0 };
}

export async function generateSceneImage(params: {
  prompt: string;
  projectId: string;
  sceneNumber: number;
  niche: string;
  visualStyle: string;
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
  niche: string;
  visualStyle: string;
  scenes: Array<{ scene_number: number; image_prompt: string }>;
}): Promise<SceneImageResult[]> {
  const results: SceneImageResult[] = [];
  for (const scene of params.scenes) {
    const result = await generateSceneImage({
      prompt: scene.image_prompt,
      projectId: params.projectId,
      sceneNumber: scene.scene_number,
      niche: params.niche,
      visualStyle: params.visualStyle,
    });
    results.push({ ...result, sceneNumber: scene.scene_number });
    if (!result.mock) await new Promise((r) => setTimeout(r, 300));
  }
  return results;
}
