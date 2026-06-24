// ─── Visual Style Presets ─────────────────────────────────────────────────────
// Turns generic Flux output into cinematic, niche-specific imagery.
// Each niche has a distinct visual signature (lighting, palette, lens, mood)
// and each visual_style stacks a rendering modifier on top.
//
// LoRA support is OPT-IN via env vars (FLUX_LORA_<NICHE>) so verified LoRA URLs
// can be added later without code changes. Defaults to none — never ships a
// broken/hallucinated LoRA URL to production.

export interface StyleConfig {
  model: string;                       // fal endpoint
  promptSuffix: string;                // cinematic style tokens appended to prompt
  loras: Array<{ path: string; scale: number }>;
  numInferenceSteps: number;
  guidanceScale: number;
}

// ── Per-niche cinematic signature ────────────────────────────────────────────
// Distinct lighting / palette / lens / mood per niche
const NICHE_SIGNATURE: Record<string, string> = {
  terror:
    "dark moody cinematography, deep crushed shadows, cold desaturated palette, volumetric fog, low-key dramatic lighting, eerie unsettling atmosphere, horror film still, anamorphic lens flare, subtle film grain",
  horror:
    "dark moody cinematography, deep crushed shadows, cold desaturated palette, volumetric fog, low-key dramatic lighting, eerie unsettling atmosphere, horror film still, anamorphic lens flare, subtle film grain",
  romance:
    "soft warm golden-hour lighting, shallow depth of field, dreamy creamy bokeh, tender warm pastel palette, intimate framing, gentle rim backlight, 85mm portrait lens, romantic cinematic still",
  misterio:
    "neo-noir lighting, high-contrast chiaroscuro, cold teal and warm amber palette, dramatic hard shadows, atmospheric haze, mysterious tense mood, 35mm film, cinematic thriller still",
  mystery:
    "neo-noir lighting, high-contrast chiaroscuro, cold teal and warm amber palette, dramatic hard shadows, atmospheric haze, mysterious tense mood, 35mm film, cinematic thriller still",
  inspiracional:
    "epic golden-hour sunlight, warm uplifting glow, soft lens flare, sweeping heroic composition, vibrant hopeful palette, dynamic energy, motivational cinematic still, shallow depth",
  inspirational:
    "epic golden-hour sunlight, warm uplifting glow, soft lens flare, sweeping heroic composition, vibrant hopeful palette, dynamic energy, motivational cinematic still, shallow depth",
  fantasia:
    "ethereal magical lighting, glowing floating particles, rich saturated jewel tones, volumetric god rays, epic fantasy cinematography, otherworldly atmosphere, highly detailed fantasy concept art",
  fantasy:
    "ethereal magical lighting, glowing floating particles, rich saturated jewel tones, volumetric god rays, epic fantasy cinematography, otherworldly atmosphere, highly detailed fantasy concept art",
  historia:
    "documentary cinematography, period-accurate detail, soft natural window light, muted earthy tones, gentle sepia warmth, textured authentic atmosphere, historical film still",
  drama:
    "intimate cinematic drama, naturalistic soft lighting, muted emotional palette, shallow depth of field, expressive close-up framing, restrained film grain, festival-film aesthetic",
  default:
    "cinematic lighting, balanced dramatic composition, professional color grading, shallow depth of field, atmospheric mood, film still",
};

// ── Per visual_style rendering modifier ──────────────────────────────────────
const STYLE_MODIFIER: Record<string, string> = {
  cinematic:
    "shot on ARRI Alexa, anamorphic widescreen, professional cinematic color grade, photographic realism",
  realistic:
    "hyperrealistic, photorealistic, ultra-detailed, razor-sharp focus, lifelike skin and textures, 8k photography",
  anime:
    "anime style, Studio Ghibli inspired, clean cel shading, vibrant detailed anime illustration, expressive linework",
  cartoon:
    "stylized 3D render, Pixar-quality CGI, polished and colorful, expressive characters, soft global illumination",
  vintage:
    "vintage film aesthetic, 1970s–1990s, heavy authentic film grain, faded retro colors, Kodak Portra look, light leaks",
  default:
    "cinematic, professional color grade, detailed",
};

// Quality tier — controls model + step count (cost/speed vs fidelity)
// FLUX_QUALITY: "fast" (schnell, cheapest) | "cinematic" (flux/dev, best) — default cinematic
// Default is "cinematic" (flux/dev, 28 steps): the image IS the whole vertical frame,
// so quality here is the single biggest driver of how the video looks. Set
// FLUX_QUALITY=fast to drop back to schnell (4 steps) for ultra-cheap volume.
function getQualityTier(): "fast" | "cinematic" {
  const q = (process.env.FLUX_QUALITY ?? "cinematic").toLowerCase();
  return q === "fast" ? "fast" : "cinematic";
}

// Read opt-in LoRA from env for a given niche, e.g. FLUX_LORA_TERROR=https://...
// Optional scale via FLUX_LORA_TERROR_SCALE (default 0.9)
function getNicheLora(niche: string): Array<{ path: string; scale: number }> {
  const key = `FLUX_LORA_${niche.toUpperCase()}`;
  const path = process.env[key];
  if (!path) return [];
  const scaleRaw = process.env[`${key}_SCALE`];
  const scale = scaleRaw ? Number(scaleRaw) : 0.9;
  return [{ path, scale: Number.isFinite(scale) ? scale : 0.9 }];
}

// ── Global REALISM LoRA layer ────────────────────────────────────────────────
// A realism LoRA is a fine-tune trained on real photos that removes the plastic
// "AI look" — natural skin, real lighting, true photographic texture. It stacks
// on top of flux/dev for ALL photographic styles (skipped for anime/cartoon).
//
// Activate by setting FLUX_REALISM_LORA to a fal-reachable .safetensors URL, e.g.
// a public Flux realism LoRA from HuggingFace. Scale via FLUX_REALISM_SCALE (0–1).
// Left empty by default so nothing breaks until a verified URL is provided; a bad
// URL also degrades gracefully (image-generator drops LoRAs and retries on flux/dev).
function getRealismLora(visualStyle: string): Array<{ path: string; scale: number }> {
  const photographic = !["anime", "cartoon"].includes(visualStyle.toLowerCase());
  if (!photographic) return [];
  const path = process.env.FLUX_REALISM_LORA;
  if (!path) return [];
  const scale = Number(process.env.FLUX_REALISM_SCALE ?? 0.8);
  return [{ path, scale: Number.isFinite(scale) ? scale : 0.8 }];
}

export function getStyleConfig(niche: string, visualStyle: string): StyleConfig {
  const sig = NICHE_SIGNATURE[niche.toLowerCase()] ?? NICHE_SIGNATURE["default"]!;
  const mod = STYLE_MODIFIER[visualStyle.toLowerCase()] ?? STYLE_MODIFIER["default"]!;
  // Realism LoRA stacks on top of any niche LoRA — the "more realistic" layer.
  const loras = [...getNicheLora(niche), ...getRealismLora(visualStyle)];
  const tier = getQualityTier();

  // If a LoRA is configured, we must use the flux-lora endpoint (flux-dev base).
  // Otherwise honor the quality tier: schnell (fast) or flux/dev (cinematic).
  const model =
    loras.length > 0
      ? "fal-ai/flux-lora"
      : tier === "fast"
        ? "fal-ai/flux/schnell"
        : "fal-ai/flux/dev";

  const isSchnell = model === "fal-ai/flux/schnell";

  // Realism layer — kills the plastic "AI look": photographic imperfections,
  // natural skin, real-lens artifacts. Applied to photographic styles only
  // (skipped for anime/cartoon where it would fight the aesthetic).
  const photographic = !["anime", "cartoon"].includes(visualStyle.toLowerCase());
  const realism = photographic
    ? ", photographic film grain, natural skin texture with pores and subtle imperfections, realistic subsurface scattering, authentic depth of field, slight lens vignette, true-to-life color science, candid unposed expression, no plastic skin, no overly smooth render"
    : "";

  // Pro cinematography layer — the "this looks like a real film" production value
  // that makes viewers go "wow, this was made with AI". Photographic styles only.
  const cinematic = photographic
    ? ", shot on professional cinema camera, 35mm anamorphic lens, cinematic color grading, soft volumetric lighting, motivated key light with gentle rim light, shallow cinematic depth of field with creamy bokeh, balanced film contrast, professional cinematography, movie still"
    : "";

  // Realism LoRA trigger word (e.g. "Super Realism" for strangerzonehf's LoRA).
  // Only added when a realism LoRA is active AND a trigger is configured — it
  // activates the LoRA's trained style. Placed at the FRONT for strongest effect.
  const realismTrigger =
    photographic && getRealismLora(visualStyle).length > 0 && process.env.FLUX_REALISM_TRIGGER
      ? `${process.env.FLUX_REALISM_TRIGGER}, `
      : "";

  return {
    model,
    promptSuffix: `${realismTrigger}${sig}, ${mod}${realism}${cinematic}, masterpiece, ultra detailed, 8k, high dynamic range`,
    loras,
    // schnell is distilled to 4 steps; dev/lora need ~28 for full quality
    numInferenceSteps: isSchnell ? 4 : 28,
    guidanceScale: isSchnell ? 3.5 : 3.5,
  };
}
