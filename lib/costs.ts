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

export function estimateVideos(count: number, model: "seedance" | "veo3", lipsync: boolean): number {
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
