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
  // "consejo": los ganchos son la primera línea A CÁMARA, en primera persona.
  format: z.enum(["story", "ad", "consejo"]).optional(),
  // Los nombres del reparto YA elegido. Sin esto el gancho inventaba nombres
  // ("Mariana", "Alejandro") que no existían en el elenco, y el guionista los
  // heredaba: la misma fuente de nombres fantasma que ya cerramos en el guion.
  cast_names: z.array(z.string().min(1).max(60)).max(4).optional(),
});

export interface HookVariant {
  id: string;
  type: "question" | "in_medias_res" | "shocking_fact";
  type_label: string;
  text: string;
  why: string; // brief explanation of why this hook works
}

const HOOK_SYSTEM = `Escribís la PRIMERA LÍNEA QUE DICE UN PERSONAJE en un microdrama vertical.

⚠️ LO MÁS IMPORTANTE: el hook NO es un texto publicitario ni una voz en off. Es
literalmente lo que el protagonista DICE EN VOZ ALTA en la primera escena, y así
se usa: se le entrega al guionista como el parlamento de la escena 1. Si escribís
un titular o una pregunta dirigida al espectador, el video arranca con alguien
leyendo un anuncio en lugar de viviendo una escena.

❌ "¿Qué harías si el monitor de tu bebé muestra a alguien cantándole?"
   → le habla al espectador, no a nadie de la historia
❌ "A las 3 AM, un monitor desenchufado mostró algo imposible."
   → narrado en tercera persona, suena a documental
✅ "Tomás. Tomás, despertate. Hay alguien en el cuarto de la nena."
   → un personaje, hablándole a otro, dentro del momento

TRES ÁNGULOS (uno por hook, los tres SIEMPRE en forma de diálogo hablado):
1. EN CRISIS: la línea arranca con la situación ya ocurriendo. El personaje
   reacciona a algo que el espectador todavía no vio.
2. A OTRO PERSONAJE: le habla a alguien —lo nombra, lo interpela, le reclama—
   y en esa frase se entiende qué pasó.
3. LO QUE ADMITE: el personaje dice en voz alta algo que le cuesta, y eso solo
   abre la pregunta de por qué.

REGLAS:
- Máximo 20 palabras
- ES DIÁLOGO: alguien lo dice, con su voz, a alguien o a sí mismo
- NO reveles el giro de la historia — el hook abre la pregunta, no la contesta
- Ultra específico al tema: nombres, objetos, horas concretas
- Sin puntos suspensivos al inicio, sin "En este video..."
- Escribí en el idioma solicitado`;

function buildHookPrompt(input: z.infer<typeof BodySchema>): string {
  const langMap: Record<string, string> = {
    es: "español latinoamericano",
    en: "English",
    pt: "português brasileiro",
  };

  return `Escribí las 3 primeras líneas posibles para este microdrama. Cada una es
lo que un PERSONAJE DICE EN VOZ ALTA en la escena 1 — no un titular, no una voz
en off, no una pregunta al espectador.

TEMA: ${input.topic}
NICHO: ${input.niche}
TONO: ${input.tone}
IDIOMA: ${langMap[input.language] ?? "español latinoamericano"}
${input.cast_names?.length ? `REPARTO (los ÚNICOS nombres que existen — si nombrás a alguien, es uno de estos, y si no hace falta nombrar, no nombres): ${input.cast_names.join(", ")}` : "SIN REPARTO TODAVÍA: no inventes nombres propios — decí \"mi esposo\", \"mi jefe\", \"mi hermana\"."}
${input.format === "consejo" ? `
⚠️ FORMATO CONSEJO — cambia todo lo de arriba: los tres ganchos son lo que la PROTAGONISTA le dice A CÁMARA al espectador, en primera persona, como a una amiga: la situación concreta que la trajo hasta acá, en presente. NUNCA el título del consejo ("hoy te cuento cómo superar…", "5 señales de…" — PROHIBIDO), nunca dirigido a otro personaje. Los tres ángulos se adaptan: (1) EN CRISIS = algo concreto que le está pasando AHORA con este tema — un objeto, un gesto, una hora (no una emoción abstracta); (2) A OTRO PERSONAJE pasa a ser LO QUE ELLA SE DICE — la frase que se repite para engañarse, y en la misma línea admite que no le sirve; (3) LO QUE ADMITE = lo que le da vergüenza confesar de sí misma en este tema. Máximo 14 palabras cada uno. Los tres tienen que nacer de ESTE tema y de sus detalles — inventá las frases, no uses ninguna que ya hayas visto en instrucciones.` : ""}

Genera EXACTAMENTE este JSON (sin texto adicional):
{
  "hooks": [
    {
      "id": "question",
      "type": "question",
      "type_label": "${input.format === "consejo" ? "Lo que me pasa" : "En crisis"}",
      "text": "lo que el personaje DICE reaccionando a algo que ya está pasando (máx 20 palabras)",
      "why": "por qué esta línea detiene el scroll (1 frase)"
    },
    {
      "id": "in_medias_res",
      "type": "in_medias_res",
      "type_label": "${input.format === "consejo" ? "Lo que me digo" : "A otro personaje"}",
      "text": "lo que el personaje LE DICE a otro, nombrándolo o reclamándole (máx 20 palabras)",
      "why": "por qué esta línea detiene el scroll (1 frase)"
    },
    {
      "id": "shocking_fact",
      "type": "shocking_fact",
      "type_label": "${input.format === "consejo" ? "Lo que admito" : "Lo que admite"}",
      "text": "lo que el personaje ADMITE en voz alta y le cuesta decir (máx 20 palabras)",
      "why": "por qué esta línea detiene el scroll (1 frase)"
    }
  ]
}`;
}

async function generateHooksWithAI(input: z.infer<typeof BodySchema>): Promise<HookVariant[]> {
  // Mock mode
  if (process.env.FORCE_MOCK_AI === "true" || !process.env.OPENAI_API_KEY) {
    await new Promise(r => setTimeout(r, 600));
    return [
      // El respaldo también tiene que ser DIÁLOGO. El anterior traía "El 97% de
      // las personas ignora esto sobre X" — un anuncio de infoproducto que se le
      // entregaba al guionista como el parlamento de la escena 1.
      {
        id: "question",
        type: "question",
        type_label: "En crisis",
        text: `Esperá… esto no estaba así hace cinco minutos.`,
        why: "El personaje reacciona a algo que el espectador todavía no vio",
      },
      {
        id: "in_medias_res",
        type: "in_medias_res",
        type_label: "A otro personaje",
        text: `Mírame. Mírame y decime que no es verdad.`,
        why: "Le habla a alguien: hay una relación y un conflicto desde la primera palabra",
      },
      {
        id: "shocking_fact",
        type: "shocking_fact",
        type_label: "Lo que admite",
        text: `Nunca se lo dije a nadie. Ni siquiera a mi familia.`,
        why: "Admitir algo que cuesta abre la pregunta de qué es",
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
