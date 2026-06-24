// ─── Platform-wide production config ──────────────────────────────────────────

export type AnimationTier = "kenburns" | "cinematic" | "talking";

// ─── SINGLE PREMIUM TIER ───────────────────────────────────────────────────────
// VYNAVO produces ONE quality only: "talking" — lip-sync where the character's
// mouth moves with their voice (image + audio → VEED Fabric clip with synced
// narration). No cheap/fast tiers. Every video is a high-end "obra de arte".
// The type + functions are kept for compatibility but everything resolves to
// "talking" so old data / requests can never downgrade the output.

export function getAnimationTier(): AnimationTier {
  return "talking";
}

export const TIER_RANK: Record<AnimationTier, number> = { kenburns: 0, cinematic: 1, talking: 2 };

// Every plan produces the single premium tier — plans differ only by volume.
export function maxTierForPlan(_plan: string | null | undefined): AnimationTier {
  return "talking";
}

export function tierAllowedForPlan(_tier: AnimationTier, _plan: string | null | undefined): boolean {
  return true;
}

// The effective tier for a project is ALWAYS the premium talking tier.
export function resolveProjectTier(_projectTier: string | null | undefined, _plan: string | null | undefined): AnimationTier {
  return "talking";
}

// ─── CREDIT ECONOMY (single source of truth) ─────────────────────────────────
// NAVO = the in-app credit. Devalued ON PURPOSE into big numbers: each video costs
// THOUSANDS of NAVOS, not 1. Big buckets feel generous (Magnific/Krea/Topaz tactic)
// AND let us price each tier by its real cost. The model below GUARANTEES that every
// video — at any tier — earns at least MARGIN_MULTIPLIER× its cost, because both the
// per-video NAVO price and the plan NAVO grants are derived from the same anchor.
//
// Anchor: 1000 NAVOS = US$1.00 of customer-facing value.
export const NAVOS_PER_USD = 1000;

// Estimated REAL production cost per finished video, by tier (USD).
// ⚠️ REPLACE with your measured costs from fal / ElevenLabs / Shotstack / Seedance /
// VEED invoices once you have beta data. Everything downstream scales from here.
export const TIER_COST_USD: Record<AnimationTier, number> = {
  kenburns: 0.5,   // OpenAI guion + nano-banana imágenes + ElevenLabs voz + Shotstack
  cinematic: 2.0,  // + Seedance image-to-video por escena
  talking: 3.0,    // + VEED lip-sync por escena (lo más caro)
};

// Markup over cost. 2.0 = price is 2× cost = 100% utilidad (floor). 3.0 = 200%
// markup = ~67% gross margin (healthy SaaS). Every video stays profitable by
// construction at any value — raise/lower this single number to tune margin.
export const MARGIN_MULTIPLIER = 3.0;

// NAVO price of ONE video at a tier = cost × margin × (NAVOS per USD).
// At 3×: kenburns 1500 · cinematic 6000 · talking 9000.
export const CREDIT_COST_BY_TIER: Record<AnimationTier, number> = {
  kenburns:  Math.round(TIER_COST_USD.kenburns  * MARGIN_MULTIPLIER * NAVOS_PER_USD),
  cinematic: Math.round(TIER_COST_USD.cinematic * MARGIN_MULTIPLIER * NAVOS_PER_USD),
  talking:   Math.round(TIER_COST_USD.talking   * MARGIN_MULTIPLIER * NAVOS_PER_USD),
};

export function creditCostForTier(tier: AnimationTier): number {
  return CREDIT_COST_BY_TIER[tier] ?? CREDIT_COST_BY_TIER.kenburns;
}

// NAVOS a monthly plan should grant for a given price, so the customer gets exactly
// their money's worth at the 2× anchor — which keeps every video ≥100% markup.
// $9 → 9000 NAVOS, $49 → 49000, etc.
export function navosForPriceUsd(usd: number): number {
  return Math.round(usd * NAVOS_PER_USD);
}

// Free trial grant on signup (NAVOS). Single premium tier costs 9000 NAVOS, so we
// gift exactly ONE high-end "obra de arte" video — the wow moment that converts.
export const FREE_SIGNUP_NAVOS = 9000;

// PRO pipeline: scene image → Seedance (cinematic motion) → video lip-sync (sync.so),
// so every talking scene has REAL motion AND a synced mouth. OFF by default (it
// doubles cost + time per scene and needs live validation). Flip PRO_PIPELINE=on.
export const PRO_PIPELINE = (process.env.PRO_PIPELINE ?? "off").toLowerCase() === "on";
