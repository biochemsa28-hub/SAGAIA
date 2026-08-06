import { NextResponse } from "next/server";
import {
  resolveProjectTier, creditCostForTier, getAnimationTier, TIER_COST_USD,
  CHARACTER_BIBLE_ON, CONTINUITY_GATE_ON, SHOT_GRID_ON, HOOK_BLOCK_ON,
  SHOTS_PER_SCENE, ANIMATE_HERO_SCENES, MAX_CONCURRENT_JOBS, MAX_DAILY_VIDEOS,
  FREE_SIGNUP_NAVOS, MAX_VIDEO_SECONDS, MAX_BLOCKS_PER_VIDEO,
  NATIVE_AUDIO_ON, NARRATIVE_BLOCKS_ON, ANCHOR_IMAGES_ONLY,
} from "@/lib/config";
import { internalSecret } from "@/lib/internal-auth";

export const runtime = "nodejs";

export async function GET() {
  // Actually TALK to the database instead of checking that a variable exists.
  // Reporting database:true for a present-but-broken connection is what sent us
  // chasing a "forgotten password" for half an hour while every write silently
  // failed with a 500. A health check that only reads env vars is a health check
  // that lies at the exact moment you need it.
  let db_connection: { ok: boolean; error?: string } = { ok: false, error: "no probada" };
  try {
    const { getDb } = await import("@/lib/db");
    await getDb().execute("SELECT 1");
    db_connection = { ok: true };
  } catch (e) {
    db_connection = { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }

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
    // These were NOT checked before, which made it impossible to tell from
    // outside whether production had them — and both fail SILENTLY when absent.
    // Without Anthropic the story quietly falls back to OpenAI; without R2 every
    // asset is written to fal storage, whose URLs EXPIRE. That is the exact bug
    // that made finished videos disappear.
    anthropic:   Boolean(process.env.ANTHROPIC_API_KEY),
    r2_storage:  Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET),
    internal_secret: Boolean(process.env.INTERNAL_JOB_SECRET),
    force_mock_ai:    process.env.FORCE_MOCK_AI    ?? "unset",
    force_mock_voice: process.env.FORCE_MOCK_VOICE ?? "unset",
    force_mock_image: process.env.FORCE_MOCK_IMAGE ?? "unset",
    env: process.env.NODE_ENV,
    vercel: Boolean(process.env.VERCEL),
  };

  // Effective creative-pipeline config the RUNNING server has loaded — confirms
  // the .env.local changes actually took effect (env needs a server restart).
  // What the RUNNING server actually has switched on. Production had been
  // diagnosed by guessing for weeks — every quality and cost decision in this app
  // is a flag, and none of them were visible from outside the box.
  const tier = resolveProjectTier(null, "free");
  const production = {
    tier,
    navos_per_video: creditCostForTier(tier),
    cost_usd_per_video: TIER_COST_USD[tier],
    free_signup_navos: FREE_SIGNUP_NAVOS,
    character_bible: CHARACTER_BIBLE_ON,
    continuity_gate: CONTINUITY_GATE_ON,
    shot_grid: SHOT_GRID_ON,
    hook_block: HOOK_BLOCK_ON,
    shots_per_scene: SHOTS_PER_SCENE,
    animate_hero_scenes: ANIMATE_HERO_SCENES,
    // The worker is a long-lived loop; on serverless it can never run, which is
    // the single most important thing to know about a given deployment.
    queue_worker_configured: Boolean(internalSecret()),
    max_concurrent_jobs: MAX_CONCURRENT_JOBS,
    max_daily_videos: MAX_DAILY_VIDEOS,
    max_video_seconds: MAX_VIDEO_SECONDS,
    max_blocks_per_video: MAX_BLOCKS_PER_VIDEO,
    native_audio: NATIVE_AUDIO_ON,
    narrative_blocks: NARRATIVE_BLOCKS_ON,
    anchor_images_only: ANCHOR_IMAGES_ONLY,
    render_engine: (process.env.RENDER_ENGINE ?? "shotstack").toLowerCase(),
    voice_model: process.env.ELEVEN_MODEL ?? "eleven_v3",
    shot_grid_model: process.env.SHOT_GRID_MODEL ?? "flux-pro/kontext/max",
    effective_tier_source: process.env.FORCE_TIER ? "FORCE_TIER" : "default",
    animation_tier_default: getAnimationTier(),
  };

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


  // Validate the SHAPE of each secret without ever revealing it. A variable that
  // merely EXISTS is not enough: pasting a raw .env block into a hosting panel can
  // store the whole  line as the value, and the trailing quote comes
  // along too. Those characters are illegal in an HTTP header, so every provider
  // call died with "invalid header value" while the health check happily reported
  // the key as present.
  const suciedad = (v?: string) => {
    if (!v) return null;
    if (/^[A-Z0-9_]+=/.test(v)) return 'contiene el NOMBRE de la variable';
    if (/^["']|["']$/.test(v)) return 'tiene comillas';
    if (v !== v.trim()) return 'tiene espacios o saltos de linea';
    if (v.includes(String.fromCharCode(10)) || v.includes(String.fromCharCode(13))) return "tiene saltos de linea";
    return null;
  };
  const secret_format: Record<string, string> = {};
  for (const k of ['FAL_API_KEY','ANTHROPIC_API_KEY','OPENAI_API_KEY','ELEVENLABS_API_KEY','TURSO_AUTH_TOKEN','TURSO_DATABASE_URL','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','STRIPE_SECRET_KEY','INTERNAL_JOB_SECRET','NEXTAUTH_SECRET']) {
    const problema = suciedad(process.env[k]);
    if (problema) secret_format[k] = problema;
  }

  const missing = Object.entries(checks)
    .filter(([k, v]) => typeof v === "boolean" && !v)
    .map(([k]) => k);

  return NextResponse.json({
    ok: missing.length === 0,
    missing,
    checks,
    db_connection,
    secret_format,
    production,
    pipeline,
  });
}
