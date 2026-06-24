import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const checks = {
    openai:      Boolean(process.env.OPENAI_API_KEY),
    elevenlabs:  Boolean(process.env.ELEVENLABS_API_KEY),
    fal:         Boolean(process.env.FAL_API_KEY),
    shotstack:   Boolean(process.env.SHOTSTACK_API_KEY),
    stripe:      Boolean(process.env.STRIPE_SECRET_KEY),
    resend:      Boolean(process.env.RESEND_API_KEY),
    posthog:     Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
    nextauth:    Boolean(process.env.NEXTAUTH_SECRET),
    database:    Boolean(process.env.TURSO_DATABASE_URL),
    force_mock_ai:    process.env.FORCE_MOCK_AI    ?? "unset",
    force_mock_voice: process.env.FORCE_MOCK_VOICE ?? "unset",
    force_mock_image: process.env.FORCE_MOCK_IMAGE ?? "unset",
    env: process.env.NODE_ENV,
    vercel: Boolean(process.env.VERCEL),
  };

  // Effective creative-pipeline config the RUNNING server has loaded — confirms
  // the .env.local changes actually took effect (env needs a server restart).
  const pipeline = {
    flux_quality:           process.env.FLUX_QUALITY ?? "default(cinematic)",
    realism_lora_active:    Boolean(process.env.FLUX_REALISM_LORA),
    realism_trigger:        process.env.FLUX_REALISM_TRIGGER ?? "unset",
    character_consistency:  process.env.CHARACTER_CONSISTENCY ?? "default(on)",
    character_ref_model:    process.env.CHARACTER_REF_MODEL ?? "default(nano-banana/edit)",
    character_gen_model:    process.env.CHARACTER_GEN_MODEL ?? "default(nano-banana)",
    animation_tier_default: process.env.ANIMATION_TIER ?? "default(kenburns)",
    video_model:            process.env.VIDEO_MODEL ?? "default(seedance-pro)",
    auto_sfx:               process.env.AUTO_SFX ?? "default(on)",
    lipsync_model:          process.env.LIPSYNC_MODEL ?? "default(veed/fabric-1.0)",
  };

  const missing = Object.entries(checks)
    .filter(([k, v]) => typeof v === "boolean" && !v)
    .map(([k]) => k);

  return NextResponse.json({
    ok: missing.length === 0,
    missing,
    checks,
    pipeline,
  });
}
