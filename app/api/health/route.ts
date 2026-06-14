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

  const missing = Object.entries(checks)
    .filter(([k, v]) => typeof v === "boolean" && !v)
    .map(([k]) => k);

  return NextResponse.json({
    ok: missing.length === 0,
    missing,
    checks,
  });
}
