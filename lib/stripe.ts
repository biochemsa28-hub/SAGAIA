// ─── Server-only Stripe client ─────────────────────────────────────────────
// DO NOT import this file from client components — use lib/stripe-plans.ts instead

import Stripe from "stripe";

export { PLANS, getPlanById } from "./stripe-plans";
export type { Plan } from "./stripe-plans";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia",
});
