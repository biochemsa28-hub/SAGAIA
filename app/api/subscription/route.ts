import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export interface SubscriptionInfo {
  status: "active" | "canceled" | "past_due" | "none";
  plan_id: string | null;
  billing: "monthly" | "annual" | null;
  current_period_end: number | null; // unix timestamp
  cancel_at_period_end: boolean;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customers = await stripe.customers.list({
      email: session.user.email,
      limit: 1,
    });

    if (!customers.data[0]) {
      return NextResponse.json<SubscriptionInfo>({
        status: "none",
        plan_id: null,
        billing: null,
        current_period_end: null,
        cancel_at_period_end: false,
      });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "all",
      limit: 1,
    });

    const sub = subscriptions.data[0];
    if (!sub) {
      return NextResponse.json<SubscriptionInfo>({
        status: "none",
        plan_id: null,
        billing: null,
        current_period_end: null,
        cancel_at_period_end: false,
      });
    }

    const meta = sub.metadata ?? {};
    const billingRaw = meta["billing"];
    // current_period_end moved to subscription items in newer Stripe API versions
    const subAny = sub as unknown as Record<string, unknown>;
    const periodEnd =
      (subAny["current_period_end"] as number | undefined) ??
      (sub.items?.data[0] as unknown as Record<string, unknown> | undefined)?.["current_period_end"] as number | undefined ??
      null;

    return NextResponse.json<SubscriptionInfo>({
      status: sub.status === "active" ? "active"
            : sub.status === "canceled" ? "canceled"
            : sub.status === "past_due" ? "past_due"
            : "none",
      plan_id: (meta["plan_id"] as string | undefined) ?? null,
      billing: billingRaw === "annual" ? "annual" : billingRaw === "monthly" ? "monthly" : null,
      current_period_end: periodEnd,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[subscription]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
