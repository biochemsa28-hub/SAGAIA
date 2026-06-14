import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe, getPlanById } from "@/lib/stripe";
import { z } from "zod";

const Schema = z.object({
  plan_id: z.enum(["starter", "creator", "pro", "studio"]),
  billing: z.enum(["monthly", "annual"]).default("monthly"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }

    const plan = getPlanById(parsed.data.plan_id);
    if (!plan) return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vynavo.com";
    const isAnnual = parsed.data.billing === "annual";
    const unitAmount = isAnnual ? plan.priceAnnual : plan.priceMonthly;
    const interval = isAnnual ? "year" : "month";
    const intervalCount = isAnnual ? 1 : 1;
    const creditsPerPeriod = isAnnual ? plan.credits * 12 : plan.credits;

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: session.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: isAnnual ? unitAmount * 12 : unitAmount,
            recurring: { interval, interval_count: intervalCount },
            product_data: {
              name: `VYNAVO ${plan.name} — ${plan.credits} NAVOS/${isAnnual ? "mes" : "mes"}`,
              description: plan.description,
            },
          },
        },
      ],
      subscription_data: {
        metadata: {
          user_id: session.user.id,
          plan_id: plan.id,
          credits: String(plan.credits),
          credits_per_period: String(creditsPerPeriod),
          billing: parsed.data.billing,
        },
      },
      metadata: {
        user_id: session.user.id,
        plan_id: plan.id,
        credits: String(plan.credits),
        billing: parsed.data.billing,
      },
      success_url: `${appUrl}/dashboard?payment=success&plan=${plan.id}`,
      cancel_url: `${appUrl}/pricing`,
    });

    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/checkout]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
