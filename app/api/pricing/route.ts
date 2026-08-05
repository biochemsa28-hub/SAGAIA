import { NextResponse } from "next/server";
import { creditCostForTier, getAnimationTier, NAVOS_PER_USD } from "@/lib/config";

export const runtime = "nodejs";

// GET /api/pricing — what a video actually costs, from the same constant the
// credit engine deducts with.
//
// The pricing page cannot compute this itself: it is a client component, and
// FORCE_TIER lives in the server environment. Reading lib/config from the browser
// silently falls back to the default tier, which is how the page ended up
// advertising a video count that no longer matched what the engine charged.
// Public on purpose — it is the price list.
export async function GET() {
  const tier = getAnimationTier();
  const navosPerVideo = creditCostForTier(tier);
  return NextResponse.json({
    tier,
    navos_per_video: navosPerVideo,
    usd_per_video: navosPerVideo / NAVOS_PER_USD,
  });
}
