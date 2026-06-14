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
// FLUX_QUALITY: "fast" (schnell, cheapest) | "cinematic" (flux/dev, best) — default fast
// Default is "fast" to keep cost low while producing volume. Set FLUX_QUALITY=cinematic
// in Vercel when you want maximum quality (flux/dev, ~7x the credits).
function getQualityTier(): "fast" | "cinematic" {
  const q = (process.env.FLUX_QUALITY ?? "fast").toLowerCase();
  return q === "cinematic" ? "cinematic" : "fast";
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

export function getStyleConfig(niche: string, visualStyle: string): StyleConfig {
  const sig = NICHE_SIGNATURE[niche.toLowerCase()] ?? NICHE_SIGNATURE["default"]!;
  const mod = STYLE_MODIFIER[visualStyle.toLowerCase()] ?? STYLE_MODIFIER["default"]!;
  const loras = getNicheLora(niche);
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

  return {
    model,
    promptSuffix: `${sig}, ${mod}, masterpiece, ultra detailed, 8k, high dynamic range`,
    loras,
    // schnell is distilled to 4 steps; dev/lora need ~28 for full quality
    numInferenceSteps: isSchnell ? 4 : 28,
    guidanceScale: isSchnell ? 3.5 : 3.5,
  };
}
