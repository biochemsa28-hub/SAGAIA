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

// Turn a scene emotion (usually written in Spanish by the story AI) into concrete
// ENGLISH photographic direction — how that feeling should LOOK in the frame.
// Substring matching keeps it robust against long phrases like "horror de lo imposible".
const EMOTION_VISUAL: Array<[RegExp, string]> = [
  [/terror|miedo|horror|panico|pánico|dread/i, "raw visible fear in the eyes, tense jaw, body frozen mid-motion, cold desaturated shadows swallowing the edges of the frame"],
  [/suspens|tensi|inquiet|nervios/i, "held breath, alert eyes scanning off-frame, taut posture, deep shadows and one hard light source"],
  [/revelaci|compren|descubr|dar[sn]e cuenta|shock|sorpres/i, "the exact instant of realization, eyes widening, lips parting, blood draining from the face"],
  [/traici|engan|engaño|rabia|ira|furia/i, "jaw clenched, eyes burning, controlled fury, harsh directional light carving the face"],
  [/trist|duelo|dolor|perdida|pérdida|llanto/i, "grief weighing the whole body down, glassy eyes, soft desaturated light, hollow gaze"],
  [/amor|ternur|intim|cariñ|carin/i, "warm intimate closeness, soft golden light, gentle unguarded expression, shallow dreamy focus"],
  [/esperanz|alivio|triunf|orgullo|inspira/i, "light breaking across the face, chin lifting, quiet strength, warm hopeful glow"],
  [/culpa|verguenz|vergüenz|arrepent/i, "eyes cast down, shoulders curled inward, face half in shadow"],
  [/urgenc|accion|acción|escape|huid|correr/i, "caught mid-action with motion energy, off-balance stance, dynamic angle"],
  [/soledad|vacio|vacío|abandon/i, "small figure isolated in a large empty frame, cold negative space around them"],
];
function emotionToVisualDirection(emotion?: string): string | null {
  if (!emotion) return null;
  for (const [re, direction] of EMOTION_VISUAL) if (re.test(emotion)) return direction;
  return "emotionally charged expression, cinematic dramatic lighting";
}

// RETRY-ONLY fallback: runs when a prompt fails to generate. The old version
// gutted the scene ("knife" → "object", "demon" → "mysterious figure"), which is
// why retried horror shots came back toothless. Now it swaps only the few literal
// terms that trip generators, and REPLACES them with stronger cinematic horror
// language — dread, presence, implication — which is both scarier and renders far
// better on Flux than explicit gore ever would.
function softenPrompt(prompt: string): string {
  return prompt
    .replace(/\b(gore|mutilated|dismembered)\b/gi, "harrowing aftermath implied in shadow")
    .replace(/\b(blood|bloody|bleeding)\b/gi, "dark glistening stain")
    .replace(/\b(corpse|dead body)\b/gi, "motionless figure")
    .replace(/\b(murder|kill|killing)\b/gi, "the unspeakable act, unseen")
    .replace(/\b(demon|devil|satan)\b/gi, "malevolent entity")
    .replace(/\b(suicide)\b/gi, "irreversible moment")
    // Keep weapons — they're standard thriller iconography — just frame them
    // cinematically instead of removing them.
    .replace(/\b(knife|blade)\b/gi, "blade catching the light")
    + ", intense atmospheric horror, palpable dread, deep shadows concealing something, "
    + "unsettling presence just out of frame, cinematic tension, film still";
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
    // Flux Pro Ultra / Imagen use a DIFFERENT param shape (aspect_ratio, no steps/loras).
    const isProUltra = /flux-pro|flux\/v1\.1|\/ultra|imagen/i.test(style.model);
    let input: Record<string, unknown>;

    if (isProUltra) {
      // Premium endpoints: sharper, more cinematic, no LoRA/steps params.
      input = {
        prompt,
        aspect_ratio: "9:16",
        num_images: 1,
        enable_safety_checker: false,
        safety_tolerance: "6",
        raw: false,                       // false = more polished/aesthetic
      };
    } else {
      input = {
        prompt,
        // Style-aware: the photographic list bans "anime, cartoon, illustration",
        // which would actively sabotage an illustrated render. Drawn styles get
        // their own negatives (photoreal look, 3D, broken linework) instead.
        negative_prompt: style.illustrated
          ? "text, letters, words, writing, typography, caption, watermark, logo, signature, " +
            "gibberish text, garbled letters, " +
            "photorealistic, photograph, realistic skin pores, 3d render, CGI, live action footage, " +
            "blurry, low quality, jpeg artifacts, bad anatomy, deformed hands, extra fingers, " +
            "malformed limbs, messy sketchy linework, muddy washed-out colors, " +
            "flat lifeless shading, off-model face, inconsistent art style"
          : // Text artifacts first — AI loves inventing garbled fake labels/captions
            // on products and packaging, which instantly reads as "AI slop".
            "text, letters, words, writing, typography, caption, subtitle, label text, " +
            "gibberish text, garbled letters, fake writing, watermark, logo, signature, " +
            "plastic skin, waxy face, overly smooth skin, symmetrical face, CGI, 3D render, " +
            "cartoon, illustration, painting, anime, artificial lighting, studio background, " +
            "blurry hands, extra fingers, deformed hands, " +
            "oversaturated, overexposed, blown out highlights, flat lighting, unnatural colors, " +
            "fake bokeh, AI generated look, uncanny valley, doll-like, perfect skin",
        image_size: "portrait_16_9",
        num_inference_steps: style.loras.length > 0 ? 40 : 32,
        guidance_scale: 4.5,
        num_images: 1,
        enable_safety_checker: false,
        safety_tolerance: "6",
      };
      if (typeof seed === "number") input["seed"] = seed;
      if (style.loras.length > 0) input["loras"] = style.loras;
    }

    const result = await fal.subscribe(style.model, { input, logs: false });
    const url = extractUrl(result);
    console.log("[fal.ai] model:", style.model, "ultra:", isProUltra, "url:", url ?? "null");
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
async function callReference(prompt: string, referenceUrl: string, extraImages?: string[]): Promise<string | null> {
  const model = process.env.CHARACTER_REF_MODEL ?? "fal-ai/nano-banana/edit";
  // nano-banana / gemini edit models take an `image_urls` ARRAY; flux-kontext
  // takes a single `image_url`. Send the right shape for the configured model.
  const isNanoOrGemini = /nano-banana|gemini/i.test(model);
  // Pass ALL product angles to nano-banana (dedup, cap at 4) so it reconstructs the
  // real product faithfully from multiple views. flux-kontext only takes one.
  const allImages = [referenceUrl, ...(extraImages ?? [])].filter((u, i, a) => u && a.indexOf(u) === i).slice(0, 4);
  const input: Record<string, unknown> = isNanoOrGemini
    ? { prompt, image_urls: allImages, num_images: 1, enable_safety_checker: false }
    : { prompt, image_url: referenceUrl, num_images: 1, guidance_scale: 3.5, safety_tolerance: "6", enable_safety_checker: false };
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

// Second-pass creative upscaler — adds micro-detail that Flux's base run lacks:
// skin pores, fabric texture, authentic film grain, sharp edges.
// Uses fal-ai/clarity-upscaler (creative upscale, not just interpolation).
// Returns the enhanced URL or null so the caller can fall back gracefully.
async function callClarityUpscale(imageUrl: string, prompt: string): Promise<string | null> {
  try {
    const result = await fal.subscribe("fal-ai/clarity-upscaler", {
      input: {
        image_url: imageUrl,
        prompt,                      // guides detail-generation in the upscale pass
        upscale_factor: 2,           // 2× (keeps cost manageable vs 4×)
        creativity: 0.3,             // low creativity = faithful, high detail, not AI-hallucinated
        resemblance: 0.85,           // stay close to the original composition
        guidance_scale: 4,
        num_inference_steps: 18,
        enable_safety_checker: false,   // sin censura también en el realce
      },
      logs: false,
    });
    const obj = (result as Record<string, unknown>);
    const data = (obj?.["data"] ?? obj) as Record<string, unknown>;
    // ClarityUpscalerOutput → { image: { url: string } }
    const url = ((data?.["image"] as Record<string, unknown>)?.["url"] as string) ?? null;
    return url;
  } catch (e) {
    console.error("[fal.ai clarity-upscaler]", e instanceof Error ? e.message : String(e));
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
  referenceImageUrl?: string;
  referenceImageUrls?: string[];
  emotion?: string;
  narrationText?: string;
}): Promise<ImageGenerationResult> {
  const { sceneNumber, niche, visualStyle, seed, referenceImageUrl } = params;
  const projectId = params.projectId;
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY not set");

  fal.config({ credentials: apiKey });
  const t0 = Date.now();

  const style = getStyleConfig(niche, visualStyle);

  // Enrich with the scene's emotion translated into ENGLISH photographic direction.
  // (Raw Spanish emotion words and raw dialogue are NOT injected: Flux is trained on
  // English and would either ignore them or try to render the text into the frame.)
  let prompt = params.prompt;
  const emoDirection = emotionToVisualDirection(params.emotion);
  if (emoDirection) prompt += `, ${emoDirection}`;

  let imageUrl: string | null = null;

  // Path A: subject-consistent — edit the reference image into this new scene.
  // Subject-agnostic wording so it preserves BOTH a recurring character's face AND
  // a user-uploaded product's exact look/branding (for ads).
  if (referenceImageUrl) {
    // Lead with the NEW dramatic moment (edit models weight early tokens most), then
    // constrain identity. Leading with "keep identical" froze the composition and made
    // every scene look like a re-render of the reference instead of the story moving.
    const refPrompt = `A completely NEW scene showing this exact moment: ${prompt}. IMPORTANT: the person/product must be the SAME one from the reference image — identical face, features, colors and branding — but in this new pose, action, framing and location. Do not reuse the reference's composition. ${style.promptSuffix}`;
    imageUrl = await callReference(refPrompt, referenceImageUrl, params.referenceImageUrls);
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

  // Second pass — creative upscale: adds micro-detail (pores, fabric texture,
  // light grain) that Flux's base 28-step run lacks. Controlled by IMAGE_UPSCALE=on.
  // Doubles cost + ~8s latency, but the jump in perceived realism is significant.
  if (process.env.IMAGE_UPSCALE === "on") {
    const enhanced = await callClarityUpscale(imageUrl, prompt);
    if (enhanced) {
      console.log(`[fal.ai] upscale OK → scene ${sceneNumber}`);
      imageUrl = enhanced;
    } else {
      console.log(`[fal.ai] upscale failed for scene ${sceneNumber} — using base image`);
    }
  }

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
  referenceImageUrls?: string[];
  emotion?: string;
  narrationText?: string;
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

// ── Character bible (multi-view reference sheet) ─────────────────────────────
// One 2x2 sheet showing the SAME character from several angles and expressions,
// generated from the portrait the user already approved. A single portrait gives
// the edit model one viewpoint and it has to invent the rest; a sheet gives it the
// face from multiple angles, which holds identity far better across scenes and
// across episodes. Generated ONCE per character (~$0.06) and reused forever.
// Returns null on any failure — the pipeline simply falls back to the portrait.
export async function generateCharacterBible(params: {
  portraitUrl: string;
  description: string;
  niche: string;
  visualStyle: string;
}): Promise<string | null> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) return null;
  fal.config({ credentials: apiKey });
  const style = getStyleConfig(params.niche, params.visualStyle);
  const prompt =
    `Character reference sheet: a clean 2x2 grid of FOUR views of the EXACT SAME person from the reference image — ` +
    `identical face, hair, wardrobe and colors in every view. ` +
    `Top-left: front view, neutral expression. Top-right: three-quarter view. ` +
    `Bottom-left: side profile. Bottom-right: close-up of the face with an intense emotional expression. ` +
    `Plain neutral background, even lighting, no text, no labels, no numbers, no borders. ` +
    // Without this, the style suffix can win over the reference and render one panel
    // in a different medium than the other three — a sheet that contradicts itself is
    // worse than no sheet, because every scene inherits the contradiction.
    `CRITICAL: all four views must use the SAME rendering medium and art style as the ` +
    `reference image — do not switch between photographic and illustrated. ` +
    `${params.description}. ${style.promptSuffix}`;
  try {
    // Edit model = keeps the approved face; a fresh text-to-image would invent a new one.
    return await callReference(prompt, params.portraitUrl);
  } catch (e) {
    console.error("[bible]", e instanceof Error ? e.message.slice(0, 140) : e);
    return null;
  }
}

// ── Extra camera setups for one scene (multi-shot editing) ───────────────────
// Generates alternate framings of the SAME moment, using the scene's own finished
// image as the reference so the character, wardrobe, set and lighting stay
// identical — only the lens changes. The edit then cuts between them.
// Returns the extra shot URLs in cut order (excludes the primary shot).
export async function generateSceneShots(params: {
  basePrompt: string;
  primaryImageUrl: string;
  projectId: string;
  sceneNumber: number;
  niche: string;
  visualStyle: string;
  framings: string[];          // modifiers for shots 2..N (index 0 already rendered)
  emotion?: string;
}): Promise<string[]> {
  if (!params.framings.length) return [];
  const out = await mapWithConcurrency(params.framings, Math.min(2, params.framings.length), async (framing, i) => {
    const r = await generateSceneImage({
      prompt: `${params.basePrompt}${framing}`,
      projectId: params.projectId,
      sceneNumber: params.sceneNumber,
      niche: params.niche,
      visualStyle: params.visualStyle,
      // The primary frame IS the reference — that's what keeps the cut believable.
      referenceImageUrl: params.primaryImageUrl,
      emotion: params.emotion,
    });
    if (!r.success || !r.url) console.warn(`[shots] scene ${params.sceneNumber} shot ${i + 2} failed`);
    return r.success && r.url ? r.url : null;
  });
  return out.filter((u): u is string => Boolean(u));
}

export async function generateProjectImages(params: {
  projectId: string;
  niche: string;
  visualStyle: string;
  scenes: Array<{ scene_number: number; image_prompt: string; emotion?: string; narration_text?: string }>;
  referenceImageUrl?: string;
  referenceImageUrls?: string[];   // multiple product angles → nano-banana sees them all
  sceneReferences?: Map<number, string>;
  // scene_number → that speaker's multi-view bible sheet. Passed ALONGSIDE the
  // portrait so the edit model sees the face from several angles.
  sceneBibles?: Map<number, string>;
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
        // Portrait + multi-view bible together: nano-banana takes an image array,
        // so it gets the face from several angles instead of extrapolating from one.
        referenceImageUrls: (() => {
          const b = params.sceneBibles?.get(scene.scene_number);
          return b ? [b] : params.referenceImageUrls;
        })(),
        emotion: scene.emotion,
        narrationText: scene.narration_text,
      });
      return { ...result, sceneNumber: scene.scene_number };
    });
    out.sort((a, b) => a.sceneNumber - b.sceneNumber);
    return out;
  }

  const firstInBatch = scenes.find((s) => s.scene_number === 1);
  const anchor = firstInBatch ? extractCharacterAnchor(firstInBatch.image_prompt) : null;

  const results: SceneImageResult[] = [];
  let refUrl: string | null = params.referenceImageUrl ?? null;

  const usingSavedCharacter = consistency && !!params.referenceImageUrl;

  if (firstInBatch && !usingSavedCharacter) {
    const r = await generateSceneImage({
      prompt: firstInBatch.image_prompt,
      projectId: params.projectId,
      sceneNumber: 1,
      niche: params.niche,
      visualStyle: params.visualStyle,
      seed,
      referenceImageUrls: params.referenceImageUrls,
      emotion: firstInBatch.emotion,
      narrationText: firstInBatch.narration_text,
    });
    results.push({ ...r, sceneNumber: 1 });
    if (r.success && r.url) refUrl = r.url;
  }

  const rest = usingSavedCharacter
    ? scenes
    : scenes.filter((s) => s.scene_number !== 1);
  const restResults = await mapWithConcurrency(rest, IMAGE_CONCURRENCY, async (scene) => {
    const useRef = consistency && !!refUrl;
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
      // Pass the extra product angles only when the primary ref IS the product
      // (scene 1's generated image becomes the ref for later scenes — no extras then).
      referenceImageUrls: useRef && refUrl === params.referenceImageUrl ? params.referenceImageUrls : undefined,
      emotion: scene.emotion,
      narrationText: scene.narration_text,
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
      input: { prompt, num_images: 1, aspect_ratio: "9:16", enable_safety_checker: false },
      logs: false,
    });
    return extractUrl(result);
  } catch (e) {
    // Retry without aspect_ratio in case the model rejects that param
    try {
      const result = await fal.subscribe(CHARACTER_GEN_MODEL, { input: { prompt, num_images: 1, enable_safety_checker: false }, logs: false });
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
    // Casting-quality portrait: this face carries the whole series, so ask for real
    // screen presence and a dressed environment instead of a flat headshot.
    const prompt = `Cinematic character portrait for a premium vertical drama series. ${params.description}. ${variation}. ` +
      `Magnetic screen presence, striking expressive face with real skin texture, immaculate character-appropriate wardrobe and styling, ` +
      `placed in a richly dressed environment that fits the character (never an empty studio backdrop), ` +
      `${style.promptSuffix}`;
    return callTextToImage(prompt);
  });

  const ok = urls.filter((u): u is string => !!u);
  if (!ok.length) return { success: false, urls: [], error: "No se pudieron generar opciones de personaje" };
  return { success: true, urls: ok };
}
