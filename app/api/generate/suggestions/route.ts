import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { rateLimit, getClientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const BodySchema = z.object({
  niche: z.string().min(1),
  tone: z.string().min(1),
  sub_niche: z.string().optional(),
  language: z.string().default("es"),
});

export interface StorySuggestion {
  emoji: string;
  title: string;     // short hook-y title
  premise: string;   // 1-2 sentence story premise (goes into the topic field)
}

const LANG: Record<string, string> = {
  es: "español latinoamericano natural",
  en: "English",
  pt: "português brasileiro",
};

// What FEELING each tone must evoke — so suggestions hit the emotion the user picked.
const EMOTION_BRIEF: Record<string, string> = {
  horror:        "MIEDO real: lo cotidiano que se vuelve siniestro, la amenaza cercana e invisible, el escalofrío.",
  romance:       "AMOR y ternura: el casi-roce, lo no dicho, el deseo que también duele.",
  mystery:       "INTRIGA: un detalle que no cuadra, una pregunta que el espectador NECESITA responder.",
  inspirational: "MOTIVACIÓN: el fondo real antes del triunfo, 'si él pudo, yo puedo'.",
  thriller:      "ADRENALINA: un reloj que corre, una decisión imposible, sin respiro.",
  drama:         "un NUDO en la garganta: conflicto humano universal, una verdad que duele.",
  comedy:        "RISA: situación absurda pero creíble, remate inesperado.",
  documentary:   "ASOMBRO: 'no sabía esto', un hecho real que se siente revelación.",
  fantasy:       "MARAVILLA: lo imposible que se siente posible, con corazón humano debajo.",
};

function buildPrompt(input: z.infer<typeof BodySchema>): string {
  const lang = LANG[input.language] ?? LANG.es;
  const emotion = EMOTION_BRIEF[input.tone] ?? `la emoción "${input.tone}"`;
  return `Eres VYNAVO, showrunner experto en microseries virales. Genera 3 ideas de historia ORIGINALES y adictivas para una microserie vertical corta.

NICHO: ${input.niche}${input.sub_niche ? ` (${input.sub_niche})` : ""}
EMOCIÓN A PROVOCAR: ${emotion}
IDIOMA: ${lang}

Cada idea debe:
- Provocar exactamente esa emoción al leerla (que el usuario sienta "¡esa quiero!").
- Partir de algo cotidiano y reconocible, con un GIRO que sorprenda ("esto me podría pasar a mí").
- Ser concreta y específica (no abstracta). Una premisa que ya insinúa el conflicto y el misterio.
- Ser DISTINTA a las otras dos (distintos ángulos).

Devuelve EXACTAMENTE este JSON, sin texto adicional:
{
  "suggestions": [
    { "emoji": "un emoji que capture la idea", "title": "título corto e impactante (máx 6 palabras)", "premise": "premisa de 1-2 frases que enganche y deje una pregunta abierta" },
    { "emoji": "...", "title": "...", "premise": "..." },
    { "emoji": "...", "title": "...", "premise": "..." }
  ]
}`;
}

// Provider-agnostic: prefer Claude (anthropic) like the rest of the app, fall back to OpenAI.
async function generate(input: z.infer<typeof BodySchema>): Promise<StorySuggestion[]> {
  const prompt = buildPrompt(input);

  if (process.env.ANTHROPIC_API_KEY) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 1024,
        system: "Responde SOLO con JSON válido. Sin markdown, sin texto antes ni después.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "{}";
    return parseSuggestions(raw);
  }

  if (process.env.OPENAI_API_KEY) {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      messages: [
        { role: "system", content: "Responde SOLO con JSON válido." },
        { role: "user", content: prompt },
      ],
      temperature: 1.0,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });
    return parseSuggestions(completion.choices[0]?.message?.content ?? "{}");
  }

  // Mock fallback
  return [
    { emoji: "😱", title: "La llamada imposible", premise: `Algo cotidiano se vuelve siniestro en ${input.niche}, y para cuando lo entiende, ya es tarde.` },
    { emoji: "🔍", title: "El detalle que no cuadra", premise: `Un objeto fuera de lugar abre una pregunta que no la deja dormir.` },
    { emoji: "💔", title: "Lo que nunca dijo", premise: `Una verdad guardada por años sale a la luz en el peor momento.` },
  ];
}

function parseSuggestions(raw: string): StorySuggestion[] {
  // Strip accidental code fences
  const clean = raw.replace(/```json\s*|\s*```/g, "").trim();
  const parsed = JSON.parse(clean) as { suggestions?: StorySuggestion[] };
  if (!parsed.suggestions?.length) throw new Error("Formato de sugerencias inválido");
  return parsed.suggestions.slice(0, 3);
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`suggest:${ip}`, { limit: 40, windowSecs: 3600 });
  if (!rl.allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  try {
    const session = await getServerSession(authOptions);
    const isMock = process.env.FORCE_MOCK_AI === "true";
    if (!session?.user && !isMock) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    const suggestions = await generate(parsed.data);
    return NextResponse.json({ success: true, suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("[API /generate/suggestions]", message);
    return NextResponse.json({ error: "No se pudieron generar sugerencias. Intenta de nuevo." }, { status: 500 });
  }
}
