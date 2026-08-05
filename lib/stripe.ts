// ─── Server-only Stripe client ─────────────────────────────────────────────
// DO NOT import this file from client components — use lib/stripe-plans.ts instead

import Stripe from "stripe";

export { PLANS, getPlanById } from "./stripe-plans";
export type { Plan } from "./stripe-plans";

// Built on FIRST USE, not on import.
//
// At module scope this ran during `next build`, where STRIPE_SECRET_KEY does not
// exist yet — the constructor threw and the whole build died with "Failed to
// collect page data for /api/stripe/webhook". A route handler needs its secrets
// when a request arrives, never while the page tree is being compiled.
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY no está configurada");
    _stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
  }
  return _stripe;
}

// A Proxy so the four existing call sites keep writing `stripe.checkout...`
// unchanged, while the real client is only created when a property is actually
// read — i.e. inside a request.
export const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    const client = getStripe() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
