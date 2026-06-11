import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe, getPlanById } from "@/lib/stripe";
import { z } from "zod";

const Schema = z.object({
  plan_id: z.enum(["starter", "pro", "studio"]),
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
      return NextResponse.json({ error: "plan_id inválido" }, { status: 400 });
    }

    const plan = getPlanById(parsed.data.plan_id);
    if (!plan) return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://sagaia.vercel.app";

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: session.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: plan.price,
            product_data: {
              name: `SAGAIA ${plan.name} — ${plan.credits} créditos`,
              description: plan.description,
              images: [`${appUrl}/og-image.png`],
            },
          },
        },
      ],
      metadata: {
        user_id: session.user.id,
        plan_id: plan.id,
        credits: String(plan.credits),
      },
      success_url: `${appUrl}/dashboard?payment=success&plan=${plan.id}`,
      cancel_url: `${appUrl}/pricing?payment=cancelled`,
    });

    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/checkout]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
