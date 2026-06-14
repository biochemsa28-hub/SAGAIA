import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { addCredits, updateUserPlan } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import type Stripe from "stripe";
import { captureServer } from "@/lib/analytics/posthog";

export const runtime = "nodejs";

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

  await initDb();

  // First payment — subscription created
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { user_id, plan_id, credits } = session.metadata ?? {};
    if (!user_id || !credits) return NextResponse.json({ received: true });
    try {
      const creditsToAdd = parseInt(credits, 10);
      await addCredits(user_id, creditsToAdd);
      if (plan_id) await updateUserPlan(user_id, plan_id);
      captureServer(user_id, "payment_completed", {
        plan: plan_id, credits: creditsToAdd,
        amount_total: session.amount_total, currency: session.currency,
      });
      console.log(`[webhook] ✅ checkout +${creditsToAdd} NAVOS → ${user_id}`);
    } catch (err) {
      console.error("[webhook] DB error on checkout:", err);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
  }

  // Monthly renewal — add NAVOS again
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    // Skip the first invoice (already handled by checkout.session.completed)
    if (invoice.billing_reason === "subscription_create") {
      return NextResponse.json({ received: true });
    }
    const invoiceAny = invoice as unknown as Record<string, unknown>;
    const sub = invoiceAny["subscription"] as string | { id: string } | null | undefined;
    if (!sub) return NextResponse.json({ received: true });
    try {
      const subscription = await stripe.subscriptions.retrieve(
        typeof sub === "string" ? sub : sub.id
      );
      const { user_id, plan_id, credits } = subscription.metadata ?? {};
      if (!user_id || !credits) return NextResponse.json({ received: true });
      const creditsToAdd = parseInt(credits, 10);
      await addCredits(user_id, creditsToAdd);
      captureServer(user_id, "subscription_renewed", {
        plan: plan_id, credits: creditsToAdd,
        amount_paid: invoice.amount_paid, currency: invoice.currency,
      });
      console.log(`[webhook] ✅ renewal +${creditsToAdd} NAVOS → ${user_id}`);
    } catch (err) {
      console.error("[webhook] DB error on renewal:", err);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
  }

  // Cancellation — optionally mark plan as cancelled
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const { user_id } = subscription.metadata ?? {};
    if (user_id) {
      await updateUserPlan(user_id, "free").catch(() => null);
      captureServer(user_id, "subscription_cancelled", { plan: subscription.metadata?.plan_id });
      console.log(`[webhook] subscription cancelled → ${user_id}`);
    }
  }

  return NextResponse.json({ received: true });
}
