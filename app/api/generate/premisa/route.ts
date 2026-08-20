import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { rateLimit, getClientIp } from "@/lib/security/rate-limit";
import { evaluarPremisa } from "@/services/quality/premisa";

export const runtime = "nodejs";
export const maxDuration = 30;

const BodySchema = z.object({
  topic: z.string().min(5).max(500),
  format: z.enum(["story", "ad", "consejo", "escena"]).optional(),
  niche: z.string().optional(),
  tone: z.string().optional(),
});

// Motor de Premisas Virales — FASE 1: aconseja, nunca bloquea. Gratis para el
// usuario (una llamada de texto, centavos); el puntaje viaja de vuelta y la UI
// lo muestra con las dos reescrituras.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ip = getClientIp(req);
  const rl = rateLimit(`premisa:${ip}`, { limit: 30, windowSecs: 3600 });
  if (!rl.allowed) return NextResponse.json({ error: "Demasiadas evaluaciones — espera unos minutos." }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Premisa inválida" }, { status: 400 });

  const evaluacion = await evaluarPremisa(parsed.data);
  if (!evaluacion) return NextResponse.json({ error: "No se pudo evaluar — intenta de nuevo." }, { status: 502 });
  return NextResponse.json(evaluacion);
}
