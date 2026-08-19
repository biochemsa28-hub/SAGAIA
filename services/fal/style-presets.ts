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
  // True for drawn styles (anime/cartoon). The generator flips to an illustrated
  // negative-prompt set — the photographic one bans "anime/cartoon/illustration"
  // and would fight the very style we're asking for.
  illustrated: boolean;
}

// ── Per-niche cinematic signature ────────────────────────────────────────────
// Distinct lighting / palette / lens / mood per niche
const NICHE_SIGNATURE: Record<string, string> = {
  terror:
    "terrifying horror cinematography, pitch-black crushed shadows swallowing half the frame, cold sickly desaturated palette, heavy volumetric fog, harsh single-source low-key lighting, oppressive claustrophobic framing, visceral primal dread, unsettling wrongness, ONLY the people and objects the scene describes — no added figures, silhouettes or creatures, A24 psychological horror film still, anamorphic lens flare, heavy film grain",
  horror:
    "terrifying horror cinematography, pitch-black crushed shadows swallowing half the frame, cold sickly desaturated palette, heavy volumetric fog, harsh single-source low-key lighting, oppressive claustrophobic framing, visceral primal dread, unsettling wrongness, ONLY the people and objects the scene describes — no added figures, silhouettes or creatures, A24 psychological horror film still, anamorphic lens flare, heavy film grain",
  romance:
    "stunningly attractive magnetic leads, sensual warm golden lighting caressing the skin, glowing luminous skin tones, intimate close framing with faces and bodies near each other, charged romantic tension, soft rim backlight tracing shoulders and jawline, shallow depth of field with creamy bokeh, warm amber and rose palette, silk and soft fabrics, dim candlelit ambience, 85mm portrait lens, breathtaking romantic cinematic still, palpable chemistry",
  misterio:
    "gripping neo-noir mystery, high-contrast chiaroscuro carving the face, cold teal clashing with warm amber, hard shadows swallowing half the frame, atmospheric haze, one unexplained detail catching the eye, unsettling tension, 35mm film, cinematic thriller still",
  mystery:
    "gripping neo-noir mystery, high-contrast chiaroscuro carving the face, cold teal clashing with warm amber, hard shadows swallowing half the frame, atmospheric haze, one unexplained detail catching the eye, unsettling tension, 35mm film, cinematic thriller still",
  inspiracional:
    "triumphant epic golden-hour sunlight breaking through, warm glow on a weathered determined face, soft lens flare, low heroic angle, hard-earned dignity, hopeful palette rising out of grey, goosebump-inducing motivational cinematic still, shallow depth",
  inspirational:
    "triumphant epic golden-hour sunlight breaking through, warm glow on a weathered determined face, soft lens flare, low heroic angle, hard-earned dignity, hopeful palette rising out of grey, goosebump-inducing motivational cinematic still, shallow depth",
  fantasia:
    "ethereal magical lighting, glowing floating particles, rich saturated jewel tones, volumetric god rays, epic fantasy cinematography, otherworldly atmosphere, highly detailed fantasy concept art",
  fantasy:
    "ethereal magical lighting, glowing floating particles, rich saturated jewel tones, volumetric god rays, epic fantasy cinematography, otherworldly atmosphere, highly detailed fantasy concept art",
  historia:
    "documentary cinematography, period-accurate detail, soft natural window light, muted earthy tones, gentle sepia warmth, textured authentic atmosphere, historical film still",
  drama:
    "devastating emotional drama, raw grief visible on the face, glassy welling eyes, trembling restraint, cold grey overcast light through a window, desaturated muted palette with one dying warm accent, small lonely figure in a large empty frame, heavy negative space, intimate expressive close-up, shallow depth of field, quiet unbearable stillness, restrained film grain, award-winning festival-film aesthetic",
  // Estos nichos no tenían firma visual y caían al genérico, así que salían con la
  // misma cara que cualquier otro video: iluminación "cinematográfica" y nada más.
  // La firma por nicho es lo que hace que un chisme se vea como un chisme antes de
  // que se diga una palabra.
  thriller:
    "relentless thriller cinematography, urgent handheld energy, cold blue-steel palette with one hot practical light, hard directional shadows, tension in what is off-frame (implied by the character's gaze, never drawn), tight claustrophobic framing on hands and eyes, shallow depth of field, restless composition, 35mm film, high-contrast contemporary thriller still",
  chisme:
    "candid intimate realism, everyday domestic setting with real lived-in clutter, warm practical lamplight and kitchen fluorescents, phone-video immediacy but beautifully composed, faces close to camera as if confiding, slight overexposure near the window, natural skin texture, contemporary and relatable, documentary-style still",
  confesion:
    "unflinching intimate portrait, one soft source from a single direction, deep quiet shadow filling the rest of the frame, very shallow depth of field, the face large and centred, no set dressing competing for attention, muted desaturated palette, honest unretouched skin, stillness, festival-film confessional still",
  comedia:
    "bright warm comedic cinematography, even flattering light, saturated cheerful palette, wide framing that keeps the absurdity visible in the background, crisp focus throughout, expressive faces caught mid-reaction, contemporary sitcom-film look",
  comedy:
    "bright warm comedic cinematography, even flattering light, saturated cheerful palette, wide framing that keeps the absurdity visible in the background, crisp focus throughout, expressive faces caught mid-reaction, contemporary sitcom-film look",
  documental:
    "observational documentary cinematography, available natural light, neutral honest color, slightly imperfect handheld framing, real textures and real locations, subject aware of the camera, restrained and credible, photojournalistic still",
  documentary:
    "observational documentary cinematography, available natural light, neutral honest color, slightly imperfect handheld framing, real textures and real locations, subject aware of the camera, restrained and credible, photojournalistic still",
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
    "premium modern anime, theatrical anime film quality, Makoto Shinkai and Kyoto Animation aesthetic, " +
    "beautiful expressive anime faces with large emotive eyes and detailed catchlights, " +
    "crisp confident linework, rich cel shading with soft gradients, dramatic anime lighting with god rays and lens flare, " +
    "lush hand-painted detailed backgrounds, cinematic composition, vibrant saturated color grading, " +
    "emotional atmosphere, anime key visual, masterpiece anime illustration, " +
    // El anime también tiene "piel": el sombreado de la cara con dos tonos y un
    // rubor suave, la luz de recorte en el pelo, y ojos con brillo doble — es lo
    // que separa un fotograma de película de un dibujo plano.
    "soft two-tone skin shading with subtle blush, delicate rim light on the hair, double catchlights in the eyes, gentle subsurface glow on the skin in warm light",
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
function getQualityTier(): "fast" | "cinematic" | "ultra" {
  const q = (process.env.FLUX_QUALITY ?? "cinematic").toLowerCase();
  if (q === "fast") return "fast";
  if (q === "ultra") return "ultra";
  return "cinematic";
}

// Premium base model for the "ultra" tier — sharper, more cinematic than flux/dev.
// Override with IMAGE_MODEL (e.g. fal-ai/imagen4/preview, fal-ai/recraft-v3).
function getUltraModel(): string {
  return process.env.IMAGE_MODEL ?? "fal-ai/flux-pro/v1.1-ultra";
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

  // "ultra" tier uses a premium endpoint (Flux 1.1 Pro Ultra / Imagen) that does NOT
  // support LoRAs — so we drop them and let the model's native quality carry it.
  const useUltra = tier === "ultra";
  // If a LoRA is configured (and not ultra), use the flux-lora endpoint (flux-dev base).
  // Otherwise honor the quality tier: ultra | schnell (fast) | flux/dev (cinematic).
  const effectiveLoras = useUltra ? [] : loras;
  const model = useUltra
    ? getUltraModel()
    : effectiveLoras.length > 0
      ? "fal-ai/flux-lora"
      : tier === "fast"
        ? "fal-ai/flux/schnell"
        : "fal-ai/flux/dev";

  const isSchnell = model === "fal-ai/flux/schnell";

  // Realism layer — kills the plastic "AI look": photographic imperfections,
  // natural skin, real-lens artifacts. Applied to photographic styles only
  // (skipped for anime/cartoon where it would fight the aesthetic).
  const photographic = !["anime", "cartoon"].includes(visualStyle.toLowerCase());
  // "no legible text": medido en un video hiperrealista, el modelo bordó
  // "JRICI" y "FERICH" en los uniformes. En anime no se nota; en foto el ojo
  // LEE, y una palabra inventada rompe la ilusión más rápido que cualquier
  // otro defecto. Sin letras en ropa, gorras, carteles ni pantallas.
  const realism = photographic
    ? ", photographic film grain, natural skin texture with pores and subtle imperfections, realistic subsurface scattering, authentic depth of field, slight lens vignette, true-to-life color science, candid unposed expression, no plastic skin, no overly smooth render, no legible text, no logos, no lettering or writing on clothing, patches, caps, signs or screens, " +
      // Piel y luz que se sienten reales: es lo que hace que el espectador crea
      // que es una persona y no un render. Luz principal suave a 45° con
      // sombra visible, luz de recorte en el pelo, brillo en los ojos, y la
      // piel con lo que la piel tiene — poros, vello fino, una vena, un rubor.
      "soft key light at 45 degrees with a visible falloff shadow on the far cheek, thin rim light on the hair, bright catchlights in both eyes, " +
      "fine peach fuzz on the cheek edge in backlight, faint blush and slight sheen on the nose and forehead, natural under-eye texture, real lips with texture"
    : "";

  // Pro cinematography layer — the "this looks like a real film" production value
  // that makes viewers go "wow, this was made with AI". Photographic styles only.
  // Tuned for HIGH VISUAL IMPACT: bold contrast, striking light, vivid yet graded.
  const cinematic = photographic
    ? ", shot on ARRI Alexa with 35mm anamorphic lens, master cinematographer framing, " +
      // PRODUCTION DESIGN — this is what separates a "photo" from a "film frame":
      // a set that looks built, dressed and lived-in rather than an empty backdrop.
      "meticulous production design, richly dressed lived-in set with layered props and texture, " +
      "deep layered composition with distinct foreground, midground and background elements, " +
      "atmospheric depth with haze catching the light, practical lights visible in frame, " +
      // LIGHTING — motivated, sculpted, high dynamic range.
      "dramatic motivated key light sculpting the face, strong rim light separating subject from background, " +
      "deep rich blacks with luminous specular highlights, sophisticated cinematic color grade, " +
      // SUBJECT PRESENCE — striking, magnetic, screen-worthy.
      "striking magnetic screen presence, expressive detailed face, immaculate wardrobe and styling, " +
      "shallow cinematic depth of field with creamy anamorphic bokeh, epic emotionally charged atmosphere, " +
      "award-winning cinematography, breathtaking museum-quality movie still, visually stunning, tack-sharp on the subject"
    // Illustrated styles get their OWN production layer — the anime equivalent of
    // art direction. Without this they were the only styles receiving no quality
    // boost at all, which is why they looked flatter than the photographic ones.
    : ", theatrical anime film production quality, meticulously detailed hand-painted background art, " +
      "layered depth with foreground framing elements, dramatic anime cinematography and camera angles, " +
      "expressive emotional character acting, beautiful atmospheric lighting with bloom and light rays, " +
      "detailed hair and fabric rendering, rich color script, studio-grade key visual, breathtaking anime frame";

  // Realism LoRA trigger word (e.g. "Super Realism" for strangerzonehf's LoRA).
  // Only added when a realism LoRA is active AND a trigger is configured — it
  // activates the LoRA's trained style. Placed at the FRONT for strongest effect.
  // Skip the trigger word on ultra (no realism LoRA active there).
  const realismTrigger =
    !useUltra && photographic && getRealismLora(visualStyle).length > 0 && process.env.FLUX_REALISM_TRIGGER
      ? `${process.env.FLUX_REALISM_TRIGGER}, `
      : "";

  return {
    model,
    promptSuffix: `${realismTrigger}${sig}, ${mod}${realism}${cinematic}, masterpiece, ultra detailed, 8k, high dynamic range`,
    loras: effectiveLoras,
    // schnell is distilled to 4 steps; dev/lora need ~28 for full quality
    numInferenceSteps: isSchnell ? 4 : 28,
    guidanceScale: isSchnell ? 3.5 : 3.5,
    illustrated: !photographic,
  };
}
