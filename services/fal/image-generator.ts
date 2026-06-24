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

// Pull the image URL out of fal's response regardless of SDK wrapper shape.
function extractUrl(result: unknown): string | null {
  const obj = result as Record<string, unknown>;
  const data = (obj?.["data"] ?? obj) as Record<string, unknown>;
  const images = data?.["images"] as Array<Record<string, unknown>> | undefined;
  return (images?.[0]?.["url"] as string) ?? null;
}

async function callFlux(prompt: string, style: StyleConfig, seed?: number): Promise<string | null> {
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
    // Fixed seed → same "look" across scenes (cheap consistency baseline).
    if (typeof seed === "number") input["seed"] = seed;
    if (style.loras.length > 0) input["loras"] = style.loras;

    const result = await fal.subscribe(style.model, { input, logs: false });
    const url = extractUrl(result);
    console.log("[fal.ai] model:", style.model, "loras:", style.loras.length, "url:", url ?? "null");
    return url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const body = (e as Record<string, unknown>)?.["body"];
    const status = (e as Record<string, unknown>)?.["status"];
    console.error("[fal.ai callFlux error]", { status, msg, body: JSON.stringify(body).slice(0, 300) });
    return null;
  }
}

// Character-consistent generation: edit a REFERENCE image (the saved character or
// scene 1) into a new scene while keeping the same person/face/outfit. Default model
// is nano-banana edit (best-in-class character consistency). Returns null on any
// failure so the caller can gracefully fall back — never crashes the pipeline.
async function callReference(prompt: string, referenceUrl: string): Promise<string | null> {
  const model = process.env.CHARACTER_REF_MODEL ?? "fal-ai/nano-banana/edit";
  // nano-banana / gemini edit models take an `image_urls` ARRAY; flux-kontext
  // takes a single `image_url`. Send the right shape for the configured model.
  const isNanoOrGemini = /nano-banana|gemini/i.test(model);
  const input: Record<string, unknown> = isNanoOrGemini
    ? { prompt, image_urls: [referenceUrl], num_images: 1 }
    : { prompt, image_url: referenceUrl, num_images: 1, guidance_scale: 3.5, safety_tolerance: "5" };
  try {
    const result = await fal.subscribe(model, { input, logs: false });
    const url = extractUrl(result);
    console.log("[fal.ai] reference model:", model, "url:", url ?? "null");
    return url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[fal.ai callReference error]", msg.slice(0, 200));
    return null;
  }
}

async function generateReal(params: {
  prompt: string;
  projectId: string;
  sceneNumber: number;
  niche: string;
  visualStyle: string;
  seed?: number;
  referenceImageUrl?: string;  // scene-1 image to keep the same character
}): Promise<ImageGenerationResult> {
  const { prompt, sceneNumber, niche, visualStyle, seed, referenceImageUrl } = params;
  const projectId = params.projectId;
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY not set");

  fal.config({ credentials: apiKey });
  const t0 = Date.now();

  // Apply niche-specific cinematic style on top of the scene prompt
  const style = getStyleConfig(niche, visualStyle);

  let imageUrl: string | null = null;

  // Path A: subject-consistent — edit the reference image into this new scene.
  // Subject-agnostic wording so it preserves BOTH a recurring character's face AND
  // a user-uploaded product's exact look/branding (for ads).
  if (referenceImageUrl) {
    const refPrompt = `Keep the exact same subject from the reference image — identical appearance, face and details, colors and branding. Feature it naturally in a NEW scene: ${prompt}. ${style.promptSuffix}`;
    imageUrl = await callReference(refPrompt, referenceImageUrl);
    if (!imageUrl) console.log(`[fal.ai] reference failed for scene ${sceneNumber}, falling back to flux`);
  }

  // Path B: plain generation (also the fallback if the reference edit failed)
  if (!imageUrl) {
    const styledPrompt = `${prompt}, ${style.promptSuffix}`;
    imageUrl = await callFlux(styledPrompt, style, seed);
    if (!imageUrl) {
      console.log(`[fal.ai] Retrying scene ${sceneNumber} with softened prompt`);
      imageUrl = await callFlux(`${softenPrompt(prompt)}, ${style.promptSuffix}`, style, seed);
    }
  }

  // Path C: safety net — if a LoRA (e.g. the realism layer) was set but failed,
  // drop all LoRAs and generate on plain flux/dev so a bad LoRA URL never blocks
  // the image (we still get full cinematic quality, just without the LoRA).
  if (!imageUrl && style.loras.length > 0) {
    console.log(`[fal.ai] LoRA path failed for scene ${sceneNumber}, retrying on flux/dev without LoRAs`);
    const noLoraStyle: StyleConfig = { ...style, loras: [], model: "fal-ai/flux/dev", numInferenceSteps: 28 };
    imageUrl = await callFlux(`${prompt}, ${style.promptSuffix}`, noLoraStyle, seed);
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
  seed?: number;
  referenceImageUrl?: string;
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

// Extract a compact character+palette anchor from scene 1's prompt.
// The AI always opens image_prompt with "[Character name, physical traits], [palette X, Y, Z]"
// — we grab the first ~120 chars and prepend them to scenes 2+ so Flux sees the same
// character reference on every generation.
function extractCharacterAnchor(firstPrompt: string): string {
  // Grab up to 120 chars, stopping at a sentence boundary if possible
  const snippet = firstPrompt.slice(0, 140);
  const stopAt = Math.max(
    snippet.lastIndexOf(","),
    snippet.lastIndexOf("."),
  );
  return stopAt > 40 ? snippet.slice(0, stopAt) : snippet;
}

// Run an async mapper over items with a max number running at once.
// Keeps us fast without tripping fal.ai rate limits (429).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

// How many images to generate in parallel. Tunable via env for rate-limit headroom.
const IMAGE_CONCURRENCY = Math.max(1, Number(process.env.IMAGE_CONCURRENCY ?? 3) || 3);

// Stable per-project seed so the same project always re-rolls the same visual
// "look" (helps consistency + makes regeneration predictable).
function stableSeed(projectId: string): number {
  let h = 0;
  for (let i = 0; i < projectId.length; i++) h = (h * 31 + projectId.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

export async function generateProjectImages(params: {
  projectId: string;
  niche: string;
  visualStyle: string;
  scenes: Array<{ scene_number: number; image_prompt: string }>;
  // For single-scene regen of scene>1: the existing scene-1 image to use as the
  // character reference (so the regenerated scene keeps the same person).
  referenceImageUrl?: string;
  // Phase 4: per-scene character reference — scene_number → the portrait of the
  // character who appears/speaks in that scene. When present each scene uses its
  // OWN reference (multi-character casting), so a scene with the antagonist shows
  // the antagonist's face, not the protagonist's.
  sceneReferences?: Map<number, string>;
}): Promise<SceneImageResult[]> {
  const consistency = (process.env.CHARACTER_CONSISTENCY ?? "on").toLowerCase() !== "off";
  const seed = stableSeed(params.projectId);
  const scenes = params.scenes;

  // ── Multi-character path: every scene has its own speaker portrait ────────────
  // Each scene is generated independently against its speaker's reference image.
  if (consistency && params.sceneReferences && params.sceneReferences.size > 0) {
    const refs = params.sceneReferences;
    const out = await mapWithConcurrency(scenes, IMAGE_CONCURRENCY, async (scene) => {
      const ref = refs.get(scene.scene_number);
      const result = await generateSceneImage({
        prompt: scene.image_prompt,
        projectId: params.projectId,
        sceneNumber: scene.scene_number,
        niche: params.niche,
        visualStyle: params.visualStyle,
        seed,
        referenceImageUrl: ref || params.referenceImageUrl || undefined,
      });
      return { ...result, sceneNumber: scene.scene_number };
    });
    out.sort((a, b) => a.sceneNumber - b.sceneNumber);
    return out;
  }

  // Character/palette anchor from scene 1's prompt — used in fallback prompts when
  // no reference image is available.
  const firstInBatch = scenes.find((s) => s.scene_number === 1);
  const anchor = firstInBatch ? extractCharacterAnchor(firstInBatch.image_prompt) : null;

  const results: SceneImageResult[] = [];
  let refUrl: string | null = params.referenceImageUrl ?? null;

  // ── A SAVED CHARACTER was chosen (params.referenceImageUrl) ──────────────────
  // Its locked-in image drives EVERY scene (including scene 1), so the same
  // recurring character appears across this and all future stories. We skip the
  // "generate scene 1 fresh" step entirely.
  const usingSavedCharacter = consistency && !!params.referenceImageUrl;

  // ── Step 1: generate scene 1 FIRST as the character reference ─────────────────
  // (Only when NO saved character is used AND scene 1 is in this batch.)
  if (firstInBatch && !usingSavedCharacter) {
    const r = await generateSceneImage({
      prompt: firstInBatch.image_prompt,
      projectId: params.projectId,
      sceneNumber: 1,
      niche: params.niche,
      visualStyle: params.visualStyle,
      seed,
    });
    results.push({ ...r, sceneNumber: 1 });
    if (r.success && r.url) refUrl = r.url;
  }

  // ── Step 2: remaining scenes in parallel, referencing the character ───────────
  // With a saved character, scene 1 is included here too (it also references the
  // saved image instead of being generated from scratch).
  const rest = usingSavedCharacter
    ? scenes
    : scenes.filter((s) => s.scene_number !== 1);
  const restResults = await mapWithConcurrency(rest, IMAGE_CONCURRENCY, async (scene) => {
    const useRef = consistency && !!refUrl;
    // With a reference image the model handles consistency, so we pass the clean
    // scene prompt. Without one, inject the text anchor as a best-effort cue.
    const prompt = useRef
      ? scene.image_prompt
      : anchor
        ? `same exact person and outfit as before (${anchor}), consistent face and wardrobe. ${scene.image_prompt}`
        : scene.image_prompt;

    const result = await generateSceneImage({
      prompt,
      projectId: params.projectId,
      sceneNumber: scene.scene_number,
      niche: params.niche,
      visualStyle: params.visualStyle,
      seed,
      referenceImageUrl: useRef ? refUrl! : undefined,
    });
    return { ...result, sceneNumber: scene.scene_number };
  });
  results.push(...restResults);

  results.sort((a, b) => a.sceneNumber - b.sceneNumber);
  return results;
}

// ─── Character creation (nano-banana) ──────────────────────────────────────────
// Generate N portrait OPTIONS from a text description so the user can pick the one
// they like best. That chosen image becomes the recurring character's locked face.

const CHARACTER_GEN_MODEL = process.env.CHARACTER_GEN_MODEL ?? "fal-ai/nano-banana";

// Slight variation per option so the 4 results feel distinct (angle/expression).
const OPTION_VARIATIONS = [
  "front view, neutral confident expression, eye-level",
  "three-quarter angle, subtle expression, soft key light",
  "dramatic side lighting, intense gaze, cinematic mood",
  "natural candid look, shallow depth of field, looking slightly off-camera",
];

async function callTextToImage(prompt: string): Promise<string | null> {
  try {
    const result = await fal.subscribe(CHARACTER_GEN_MODEL, {
      input: { prompt, num_images: 1, aspect_ratio: "9:16" },
      logs: false,
    });
    return extractUrl(result);
  } catch (e) {
    // Retry without aspect_ratio in case the model rejects that param
    try {
      const result = await fal.subscribe(CHARACTER_GEN_MODEL, { input: { prompt, num_images: 1 }, logs: false });
      return extractUrl(result);
    } catch (err) {
      console.error("[fal.ai callTextToImage error]", err instanceof Error ? err.message : String(err));
      return null;
    }
  }
}

export async function generateCharacterOptions(params: {
  description: string;
  niche?: string;
  visualStyle?: string;
  count?: number;
}): Promise<{ success: boolean; urls: string[]; error?: string }> {
  if (process.env.FORCE_MOCK_IMAGE === "true" || !process.env.FAL_API_KEY) {
    return { success: true, urls: ["/placeholder.png", "/placeholder.png", "/placeholder.png", "/placeholder.png"] };
  }
  fal.config({ credentials: process.env.FAL_API_KEY });

  const style = getStyleConfig(params.niche ?? "default", params.visualStyle ?? "cinematic");
  const count = Math.min(Math.max(params.count ?? 4, 1), 4);

  const urls = await mapWithConcurrency(OPTION_VARIATIONS.slice(0, count), count, async (variation) => {
    const prompt = `Character portrait for a vertical short-form video. ${params.description}. ${variation}. ${style.promptSuffix}`;
    return callTextToImage(prompt);
  });

  const ok = urls.filter((u): u is string => !!u);
  if (!ok.length) return { success: false, urls: [], error: "No se pudieron generar opciones de personaje" };
  return { success: true, urls: ok };
}
