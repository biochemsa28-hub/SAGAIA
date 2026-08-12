import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ascenderAEstreno, getProjectDetail, getUserById, deductCredits } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { resolveProjectTier, creditCostFor, creditCostForTier, BORRADOR_NAVOS, esBorrador } from "@/lib/config";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({ project_id: z.string().uuid() });

// POST /api/projects/upgrade — pasa un borrador a estreno.
//
// El borrador ya pagó y ya tiene lo caro de producir en tiempo: guion, elenco,
// retratos, imágenes y voz. Lo único que falta comprar es la animación, así que
// el ascenso cobra LA DIFERENCIA, no el video de nuevo. Cobrar dos veces por lo
// mismo convertiría el borrador en un impuesto en vez de en un ahorro.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "project_id requerido" }, { status: 400 });

    await initDb();
    const detail = await getProjectDetail(parsed.data.project_id, session.user.id);
    if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    if (!esBorrador(detail.project.quality)) {
      return NextResponse.json({ error: "Este proyecto ya es un estreno" }, { status: 409 });
    }

    const user = await getUserById(session.user.id);
    const tier = resolveProjectTier(detail.project.animation_tier, user?.plan ?? "free");
    const duracion = detail.project.duration_target;
    const precioEstreno = creditCostFor(tier, duracion, "estreno");
    const yaPagado = creditCostFor(tier, duracion, "borrador");
    const diferencia = Math.max(1, precioEstreno - yaPagado);

    const credito = await deductCredits(session.user.id, diferencia);
    if (!credito.ok) {
      return NextResponse.json(
        { error: `Necesitas ${diferencia.toLocaleString("es")} NAVOS para pasarlo a estreno.`, required: diferencia, credits: credito.remaining },
        { status: 402 },
      );
    }

    const ok = await ascenderAEstreno(parsed.data.project_id, session.user.id);
    if (!ok) return NextResponse.json({ error: "No se pudo ascender" }, { status: 409 });

    console.log(`[upgrade] proyecto ${parsed.data.project_id.slice(0, 8)} borrador → estreno, cobrado ${diferencia} NAVOS (diferencia sobre ${precioEstreno})`);
    return NextResponse.json({ success: true, cobrado: diferencia, base: BORRADOR_NAVOS, estreno: creditCostForTier(tier) });
  } catch (err) {
    console.error("[API /projects/upgrade]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
