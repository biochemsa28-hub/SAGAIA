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
  /** UNA línea: la imagen del primer segundo. Es lo que se ve en la tarjeta.
   *
   *  Sin este campo la tarjeta mostraba la premisa entera, y al pedir premisas
   *  ricas —las nuevas promedian 388 caracteres— eso son seis renglones de
   *  texto de 11px donde antes había uno. Una tarjeta que hay que leer no se
   *  elige: se saltea.
   *
   *  Opcional a propósito: las respuestas viejas no lo traen y la interfaz cae
   *  a la premisa, como antes. */
  gancho?: string;
  /** La premisa completa. NO se acorta: va al campo "topic" y es lo que el
   *  guionista recibe, y ahí cuanta más textura mejor. Lo que sobra en una
   *  tarjeta es justo lo que le falta a un guion. */
  premise: string;
}

const LANG: Record<string, string> = {
  es: "español latinoamericano natural",
  en: "English",
  pt: "português brasileiro",
};

// What FEELING each tone must evoke — so suggestions hit the emotion the user picked.
// Faltaban "chisme" y "confesion": el sistema ofrece 11 tonos y esta tabla cubría
// 9, así que dos de ellos caían a un texto genérico y devolvían ideas sin sabor.
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
  chisme:        "COMPLICIDAD: el secreto que alguien cuenta bajando la voz y vos no podés dejar de escuchar.",
  confesion:     "INTIMIDAD incómoda: alguien admite en voz alta algo que jamás debió decir.",
};

// ── ÁNGULOS NARRATIVOS ───────────────────────────────────────────────────────
//
// El motivo real de que las ideas se sintieran siempre iguales: el prompt era
// IDÉNTICO en cada llamada. Mismo nicho y mismo tono producen el mismo pedido, y
// un modelo con el mismo pedido vuelve al mismo puñado de situaciones — de ahí
// "dos rivales atrapados en un ascensor" una y otra vez.
//
// La variedad no se pide ("sé creativo" no mueve nada): se FUERZA. Cada llamada
// sortea tres ángulos distintos de esta lista, así que dos clics seguidos parten
// de premisas estructuralmente diferentes aunque el nicho y el tono no cambien.
const ANGULOS: string[] = [
  "EL TESTIGO: alguien ve algo que no debía ver, y el otro se da cuenta de que lo vieron.",
  "LA CUENTA REGRESIVA: algo va a ocurrir en pocos minutos y no se puede detener.",
  "EL REGRESO: alguien vuelve después de años, y vuelve cambiado de una forma que asusta.",
  "LA PRUEBA FÍSICA: un objeto pequeño —un ticket, una foto, un pelo— que destruye una versión de la realidad.",
  "LA IDENTIDAD OCULTA: uno de los dos no es quien dice ser, y el otro está a punto de descubrirlo.",
  "EL QUE SABE Y CALLA: un personaje tiene información que el otro no, y el espectador está del lado del que sabe.",
  "EL ERROR IRREVERSIBLE: un segundo de decisión que ya no se puede deshacer.",
  "LA DEUDA VIEJA: alguien viene a cobrar algo que pasó hace mucho.",
  "EL ÚLTIMO DÍA: una despedida que uno de los dos todavía no sabe que es una despedida.",
  "EL INTERCAMBIO: dos vidas que se cruzan por un error que nadie cometió a propósito.",
  "LA HERENCIA ENVENENADA: recibir algo deseado que trae adentro la destrucción.",
  "EL ESPEJO: alguien encuentra a otra persona viviendo exactamente la vida que le tocaba.",
  "EL FAVOR: alguien pide algo pequeño que obliga a una traición grande.",
  "LA REAPARICIÓN: alguien a quien todos daban por perdido aparece en el peor momento.",
];

// Cómo se VE el primer segundo. Es lo único que decide si alguien deja de
// scrollear, y el prompt viejo no lo mencionaba ni una vez: pedía una historia,
// no una imagen. Por eso devolvía situaciones ("atrapados en un ascensor") en
// lugar de ganchos.
const FORMAS_DE_GANCHO: string[] = [
  "una persona congelada mirando algo que está fuera de cuadro",
  "unas manos haciendo algo que claramente no deberían estar haciendo",
  "un objeto en primerísimo plano que no encaja con el lugar",
  "una cara que cambia mientras lee o escucha algo",
  "dos personas en el mismo cuadro a una distancia imposible de explicar",
  "alguien entrando a un lugar donde ya hay algo esperando",
];

const sortear = <T,>(lista: T[], n: number): T[] => {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  }
  return copia.slice(0, n);
};

function buildPrompt(input: z.infer<typeof BodySchema>): string {
  const lang = LANG[input.language] ?? LANG.es;
  const emotion = EMOTION_BRIEF[input.tone] ?? `la emoción "${input.tone}"`;
  const angulos = sortear(ANGULOS, 3);
  const ganchos = sortear(FORMAS_DE_GANCHO, 3);

  return `Eres VYNAVO, showrunner de microdramas verticales. Escribís para el feed: alguien con el pulgar apoyado, listo para irse.

NICHO: ${input.niche}${input.sub_niche ? ` (${input.sub_niche})` : ""}
EMOCIÓN A PROVOCAR: ${emotion}
IDIOMA: ${lang}

LO ÚNICO QUE IMPORTA SON LOS PRIMEROS 3 SEGUNDOS.
Ahí se decide si el video se ve o muere. Una idea que "va poniéndose buena" ya perdió. La premisa tiene que abrir con una IMAGEN que detenga el pulgar y una pregunta que obligue a quedarse para saber la respuesta.

Por eso cada premisa ARRANCA describiendo lo que se VE en el primer segundo, no el contexto. No "dos rivales quedan atrapados en un ascensor" —eso es una situación, no un gancho— sino "las puertas se cierran y él ve que ella todavía tiene puesto el anillo que le devolvió".

Escribí UNA idea por cada ángulo, en este orden:
1. ${angulos[0]}
2. ${angulos[1]}
3. ${angulos[2]}

Y que el primer cuadro de cada una sea, respectivamente: ${ganchos[0]}; ${ganchos[1]}; ${ganchos[2]}.

CADA IDEA TIENE QUE TENER UN MOMENTO FÍSICO. Algo que un cuerpo HACE y se puede fotografiar: un beso que se sostiene, una cachetada que llega, una mano que agarra una muñeca, alguien que se desploma, un objeto que se estrella. Si el momento más fuerte de tu idea es "él la mira con desprecio", no hay nada que filmar y no hay nada que compartir.

Y CADA IDEA NECESITA UNA RAZÓN PARA COMENTAR. Un video se distribuye por los comentarios, no por los likes: la plataforma lo empuja cuando la gente discute abajo. Así que la premisa tiene que dejar plantado ALGO de esto:
- que el espectador SEPA algo que el personaje no sabe, y quiera gritárselo ("¡date vuelta!", "¡no le firmes!"),
- o que haya dos lecturas posibles de lo mismo y la gente se pelee por cuál es,
- o un detalle chiquito en el cuadro que solo se entiende al volver a verlo.
Una historia que se entiende entera a la primera y no deja nada que decir se ve y se olvida.

Y TERMINA JUSTO ANTES. El corte va en el segundo en que la respuesta está por llegar, no después. Lo que el espectador completa en su cabeza pesa más que lo que le muestres, y es lo que lo hace volver por la Parte 2.

REGLAS:
- Concreta y cotidiana. Nombrá objetos y lugares reales, no conceptos.
- Nada de nombres propios: el elenco se elige después.
- Que las tres se sientan de historias DISTINTAS, no tres versiones de la misma.
- PROHIBIDO empezar con "Una mujer descubre que...", "Un hombre encuentra..." o cualquier fórmula de resumen. Empezá por la imagen.

Devuelve EXACTAMENTE este JSON, sin texto adicional:
{
  "suggestions": [
    { "emoji": "un emoji que capture la imagen del primer segundo", "title": "título corto que sea una PREGUNTA o una frase que deje colgando (máx 6 palabras)", "gancho": "UNA línea de máximo 90 caracteres: solo la imagen del primer segundo, sin explicar nada", "premise": "2 frases: la PRIMERA es lo que se ve en el primer segundo; la SEGUNDA abre la pregunta y adelanta el momento físico" },
    { "emoji": "...", "title": "...", "gancho": "...", "premise": "..." },
    { "emoji": "...", "title": "...", "gancho": "...", "premise": "..." }
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
        // Temperatura alta A PROPÓSITO: acá no queremos la respuesta más
        // probable, queremos la que nadie vio venir. Los ángulos sorteados dan la
        // variedad estructural; esto da la variedad de superficie.
        temperature: 1,
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
