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
  topic: z.string().min(5),
  language: z.string().default("es"),
  duration_target: z.string().default("60s"),
});

export interface HookVariant {
  id: string;
  type: "question" | "in_medias_res" | "shocking_fact";
  type_label: string;
  text: string;
  why: string; // brief explanation of why this hook works
}

const HOOK_SYSTEM = `Eres un experto en hooks virales para videos de TikTok/Reels. Tu único trabajo es crear las primeras frases que DETIENEN el scroll en menos de 2 segundos.

TÉCNICAS DE HOOK:
1. PREGUNTA RETÓRICA: Una pregunta que el cerebro no puede ignorar. No es "¿Qué pasaría si...?" genérico — es una pregunta específica con stake emocional.
2. IN MEDIAS RES: Empieza en el momento de mayor tensión, como si el espectador hubiera entrado a la mitad de una crisis.
3. DATO IMPACTANTE: Un hecho, cifra o revelación que desafía una creencia común y genera incredulidad inmediata.

REGLAS:
- Máximo 20 palabras por hook
- Sin puntos suspensivos al inicio
- Sin "En este video..."
- Sin frases genéricas — todo debe ser ultra específico al tema
- El hook debe crear una PREGUNTA MENTAL que el cerebro necesita responder
- Escribe en el idioma solicitado`;

function buildHookPrompt(input: z.infer<typeof BodySchema>): string {
  const langMap: Record<string, string> = {
    es: "español latinoamericano",
    en: "English",
    pt: "português brasileiro",
  };

  return `Escribe 3 hooks virales para este video.

TEMA: ${input.topic}
NICHO: ${input.niche}
TONO: ${input.tone}
IDIOMA: ${langMap[input.language] ?? "español latinoamericano"}

Genera EXACTAMENTE este JSON (sin texto adicional):
{
  "hooks": [
    {
      "id": "question",
      "type": "question",
      "type_label": "Pregunta retórica",
      "text": "hook tipo pregunta aquí (máx 20 palabras)",
      "why": "por qué este hook detiene el scroll (1 frase)"
    },
    {
      "id": "in_medias_res",
      "type": "in_medias_res",
      "type_label": "In medias res",
      "text": "hook comenzando en plena acción/crisis (máx 20 palabras)",
      "why": "por qué este hook detiene el scroll (1 frase)"
    },
    {
      "id": "shocking_fact",
      "type": "shocking_fact",
      "type_label": "Dato impactante",
      "text": "hook con revelación o hecho sorprendente (máx 20 palabras)",
      "why": "por qué este hook detiene el scroll (1 frase)"
    }
  ]
}`;
}

async function generateHooksWithAI(input: z.infer<typeof BodySchema>): Promise<HookVariant[]> {
  // Mock mode
  if (process.env.FORCE_MOCK_AI === "true" || !process.env.OPENAI_API_KEY) {
    await new Promise(r => setTimeout(r, 600));
    return [
      {
        id: "question",
        type: "question",
        type_label: "Pregunta retórica",
        text: `¿Y si todo lo que sabes sobre ${input.topic} es una mentira cuidadosamente construida?`,
        why: "Activa el instinto de resolver: el cerebro necesita saber la respuesta",
      },
      {
        id: "in_medias_res",
        type: "in_medias_res",
        type_label: "In medias res",
        text: `Cuando lo descubrí, ya era demasiado tarde para ${input.topic}.`,
        why: "Crea urgencia inmediata: el espectador ya está dentro del momento de crisis",
      },
      {
        id: "shocking_fact",
        type: "shocking_fact",
        type_label: "Dato impactante",
        text: `El 97% de las personas ignora esto sobre ${input.topic}. Tú eres del 3% que lo verá.`,
        why: "La exclusividad y el número concreto generan FOMO y curiosidad",
      },
    ];
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    messages: [
      { role: "system", content: HOOK_SYSTEM },
      { role: "user", content: buildHookPrompt(input) },
    ],
    temperature: 0.9,
    max_tokens: 600,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { hooks?: HookVariant[] };

  if (!parsed.hooks || !Array.isArray(parsed.hooks)) {
    throw new Error("Hook generation returned invalid format");
  }

  return parsed.hooks;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`hooks:${ip}`, { limit: 60, windowSecs: 3600 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const session = await getServerSession(authOptions);
    const isMock = process.env.FORCE_MOCK_AI === "true";
    if (!session?.user && !isMock) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const hooks = await generateHooksWithAI(parsed.data);

    return NextResponse.json({ success: true, hooks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("[API /generate/hooks]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
