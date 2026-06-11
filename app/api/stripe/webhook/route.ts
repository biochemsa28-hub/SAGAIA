import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { addCredits, updateUserPlan } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import type Stripe from "stripe";

export const runtime = "nodejs";

// Stripe requires raw body for signature verification
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook error";
    console.error("[stripe/webhook] Signature failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { user_id, plan_id, credits } = session.metadata ?? {};

    if (!user_id || !credits) {
      console.error("[stripe/webhook] Missing metadata", session.metadata);
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
    }

    try {
      await initDb();
      const creditsToAdd = parseInt(credits, 10);
      await addCredits(user_id, creditsToAdd);
      if (plan_id) await updateUserPlan(user_id, plan_id);
      console.log(`[stripe/webhook] ✅ +${creditsToAdd} credits → user ${user_id} (plan: ${plan_id})`);
    } catch (err) {
      console.error("[stripe/webhook] DB error:", err);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
