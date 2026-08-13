// ─── Cost estimator ─────────────────────────────────────────────────────────
// fal / ElevenLabs / Shotstack don't return per-call cost in their responses, so
// we estimate from published prices. These are APPROXIMATE (USD) — good enough to
// see where money goes and to never fly blind again. Override any via env.
//
// Sources are list prices as of build time; tune with your real invoice.
const N = (envKey: string, def: number) => {
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v >= 0 ? v : def;
};

// Per-operation USD estimates.
export const COST = {
  image_flux_dev:   () => N("COST_IMAGE", 0.025),   // Flux dev / schnell per image
  image_flux_lora:  () => N("COST_IMAGE_LORA", 0.035),
  image_upscale:    () => N("COST_UPSCALE", 0.05),   // clarity-upscaler
  image_pro_ultra:  () => N("COST_IMAGE_ULTRA", 0.06),
  video_seedance:   () => N("COST_SEEDANCE", 0.62),  // per ~5-10s clip
  video_veo3:       () => N("COST_VEO3", 3.20),      // per 8s clip WITH audio (premium)
  lipsync_clip:     () => N("COST_LIPSYNC", 0.30),   // sync.so / VEED per clip
  voice_per_1k:     () => N("COST_VOICE_1K", 0.30),  // ElevenLabs per 1k chars (approx)
  shotstack_render: () => N("COST_RENDER", 0.20),    // per final render
  ffmpeg_render:    () => 0,                         // local render — genuinely free
  image_edit:       () => N("COST_IMAGE_EDIT", 0.025),  // nano-banana/edit (retrato, biblia)
  // ⚠️ NO VERIFICADO. fal no expone el precio por API y su web devuelve 429.
  // Este número entra en cada video que use la grilla — corregilo con la factura
  // real vía COST_SHEET y todo lo demás se recalcula solo.
  storyboard_sheet: () => N("COST_SHEET", 0.08),     // flux-pro/kontext/max, 1 hoja
  music_track:      () => N("COST_MUSIC", 0.10),
} as const;

// Estimate the cost of a batch of image generations given the active config.
export function estimateImages(count: number, opts: { lora?: boolean; ultra?: boolean; upscale?: boolean }): number {
  const per = opts.ultra ? COST.image_pro_ultra() : opts.lora ? COST.image_flux_lora() : COST.image_flux_dev();
  const up = opts.upscale ? COST.image_upscale() : 0;
  return count * (per + up);
}

// ─── EL COSTO DE UN CLIP SE CALCULA, NO SE ADIVINA ──────────────────────────
// COST_SEEDANCE era una tarifa PLANA de $0.62 "por clip de 5-10s", igual para
// cualquier resolución y cualquier duración. Eso dejó de describir la realidad
// en cuanto empezamos a generar a 1080p: un clip de 1080p tiene 2,25 veces los
// píxeles de uno de 720p y cuesta proporcionalmente más. Todo análisis de
// márgenes hecho sobre ese número estaba mal, y lo peor es que parecía medido.
//
// fal publica la fórmula exacta para Seedance:
//   tokens = (alto × ancho × fps × segundos) / 1024
//   $2.40 por millón de tokens CON audio · $1.20 SIN audio
// Verificado contra su propio ejemplo: 720p, 5s, con audio → $0.26.
const SEEDANCE_USD_POR_MILLON_CON_AUDIO = () => N("COST_SEEDANCE_M_AUDIO", 2.4);
const SEEDANCE_USD_POR_MILLON_SIN_AUDIO = () => N("COST_SEEDANCE_M", 1.2);
const RESOLUCIONES: Record<string, { w: number; h: number }> = {
  "480p": { w: 480, h: 854 }, "720p": { w: 720, h: 1280 }, "1080p": { w: 1080, h: 1920 },
};

export function costoClipSeedance(opts: {
  segundos: number; resolucion?: string; conAudio?: boolean; fps?: number;
}): number {
  const r = RESOLUCIONES[(opts.resolucion ?? "720p").toLowerCase()] ?? RESOLUCIONES["720p"]!;
  const fps = opts.fps ?? 24;
  const tokens = (r.w * r.h * fps * Math.max(1, opts.segundos)) / 1024;
  const porMillon = opts.conAudio === false
    ? SEEDANCE_USD_POR_MILLON_SIN_AUDIO()
    : SEEDANCE_USD_POR_MILLON_CON_AUDIO();
  return (tokens / 1_000_000) * porMillon;
}

// ─── reference-to-video: otra cola, otro precio ─────────────────────────────
// La fórmula de arriba es la de Seedance image-to-video. El endpoint de
// referencias no cobra por píxeles: MEDIDO sobre el clip real que aprobamos,
// $2.42 por 8 segundos → $0.30 por segundo. Es ~6x lo que cuesta el otro a 720p
// ($0.052/s), y si se factura con la fórmula equivocada el gasto real de un
// video con RTV_MODE=all queda seis veces subestimado en los registros — que es
// exactamente cómo se pierde dinero sin enterarse.
const RTV_USD_POR_SEGUNDO = () => N("COST_RTV_SEGUNDO", 0.3025);

export function costoClipReferencias(segundos: number): number {
  return Math.max(1, segundos) * RTV_USD_POR_SEGUNDO();
}

export function estimateVideos(
  count: number,
  model: "seedance" | "veo3",
  lipsync: boolean,
  // Sin estos datos se cae a la tarifa plana vieja, que es una estimación y hay
  // que tratarla como tal.
  detalle?: { segundos: number; resolucion?: string; conAudio?: boolean },
): number {
  if (model === "seedance" && detalle) {
    return count * (costoClipSeedance(detalle) + (lipsync ? COST.lipsync_clip() : 0));
  }
  const per = model === "veo3" ? COST.video_veo3() : COST.video_seedance();
  return count * (per + (lipsync ? COST.lipsync_clip() : 0));
}

// Everything an images run spends beyond the primary scene renders: the one-time
// character bibles and the per-scene storyboard sheets.
export function estimateImageExtras(opts: { bibles: number; sheets: number; extraShots: number }): number {
  return opts.bibles * COST.image_edit()
       + opts.sheets * COST.storyboard_sheet()
       + opts.extraShots * COST.image_edit();
}

export function estimateVoice(totalChars: number): number {
  return (totalChars / 1000) * COST.voice_per_1k();
}
