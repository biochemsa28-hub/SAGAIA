import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserById } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { resolveProjectTier, creditCostForTier } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await initDb();
    const user = await getUserById(session.user.id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // El precio que el wizard MUESTRA tiene que ser el que el servidor COBRA.
    // El cliente no puede saberlo solo: FORCE_TIER y el plan del usuario viven
    // en el servidor, así que el wizard cotizaba "talking" (19.500) mientras se
    // cobraba kenburns (12.240). Un precio mostrado que no es el real vuelve
    // inútil la predicción de costo, que es justamente lo que da confianza.
    const tier = resolveProjectTier(null, user.plan ?? "free");
    return NextResponse.json({
      credits: user.credits,
      plan: user.plan,
      tier,
      navos_por_60s: creditCostForTier(tier),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /credits]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
