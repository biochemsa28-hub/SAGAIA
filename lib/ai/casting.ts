import { z } from "zod";
import { materialDeCasting, NOMBRES_QUEMADOS } from "@/lib/ai/name-bank";

// ─── Casting: design the CAST of a micro-story before producing it ──────────────
// ChatGPT reads the premise and returns up to 4 characters the story needs. Each
// carries a "voice_profile" archetype (used later to assign a real per-character
// voice) and a "visual_description" (used to generate nano-banana image options
// the user picks from).

export const MAX_CAST = 4;

// Voice archetypes — the bridge between a character and a real voice (Phase 3).
// Keep this list in sync with the voice library (services/elevenlabs voice map).
export const VOICE_PROFILES = [
  "male_young", "male_adult", "male_elderly", "male_villain",
  "female_young", "female_adult", "female_elderly",
  "child", "narrator", "creature",
] as const;
export type VoiceProfile = (typeof VOICE_PROFILES)[number];

export const CastMemberSchema = z.object({
  // Limits are generous AND self-healing: an over-long field gets trimmed instead of
  // failing the whole cast. A slightly verbose model reply must never 502 the user.
  name: z.string().min(1).max(80).transform((s) => s.slice(0, 80)),
  role: z.string().max(400).transform((s) => s.slice(0, 80)),   // protagonista | antagonista | etc.
  gender: z.enum(["male", "female", "neutral"]),
  age: z.enum(["child", "teen", "young", "adult", "elderly"]),
  kind: z.enum(["human", "animal", "monster", "other"]),
  personality: z.string().max(1200).transform((s) => s.slice(0, 600)),
  // Richer descriptions produce better portraits — the old 600 cap was what broke
  // casting once the prompt started asking for magnetism and styling detail.
  visual_description: z.string().min(10).max(2000).transform((s) => s.slice(0, 1200)),
  voice_profile: z.enum(VOICE_PROFILES),
});
export type CastMember = z.infer<typeof CastMemberSchema>;

export const CastSchema = z.object({
  cast: z.array(CastMemberSchema).min(1).max(MAX_CAST),
});
export type Cast = z.infer<typeof CastSchema>;

export interface CastingInput {
  niche: string;
  sub_niche?: string;
  topic: string;
  tone: string;
  language: string;
  visual_style: string;
  max_characters?: number;
  /** "consejo": la protagonista le habla a cámara al espectador; los demás solo si la premisa los nombra. */
  format?: "story" | "ad" | "consejo" | "escena";
}

// ─── Prompts ────────────────────────────────────────────────────────────────

export function buildCastingSystemPrompt(): string {
  return `Eres el director de casting de VYNAVO, experto en microdramas virales.

Tu trabajo: leer la premisa de una historia y diseñar el ELENCO MÍNIMO necesario para contarla con máxima intensidad emocional — los personajes con los que el espectador se va a OBSESIONAR y querer seguir viendo.

REGLAS:
- Diseña entre 1 y ${MAX_CAST} personajes. SOLO los que la historia realmente necesita (no rellenes).
- LA PREMISA MANDA. Si la premisa NOMBRA o describe a sus personajes ("un hombre y su hijo", "Lorenzo y Simón", "ella y su jefe"), ESOS son el elenco — no los reemplaces ni los renombres. Agregá UN personaje más SOLO si sin él la historia literalmente no se puede contar. Y antes de agregarlo, probá con un OBJETO: la noticia la da una foto en el cajón, un acta de nacimiento, un mensaje en el teléfono, una voz en la radio, una carta — no una vecina que "sabe". Un objeto revela igual de fuerte, no cuesta un retrato y no le roba cuadro a los dos que importan. Una voz sin cuerpo (radio, teléfono, grabación) NO es un personaje del elenco: no lleva retrato. Nunca "por si acaso", nunca dos extra. Cada personaje de más cuesta retratos y, peor, con tres caras en pantalla el modelo de video pierde la consistencia de las tres. Si lo agregás, en "role" decí PARA QUÉ está en una frase concreta ("la vecina que sabe que Simón es su hijo y se lo dice"), no una etiqueta ("testigo / detonante emocional").
- Cada personaje debe ser ESPECÍFICO y memorable: nombre real, edad concreta, un RASGO FÍSICO FIRMA inconfundible (una cicatriz, una mirada, un mechón blanco, una prenda que siempre lleva), y una CONTRADICCIÓN interna (lo que muestra vs lo que esconde). Nada genérico.
- NOMBRE Y APELLIDO, siempre los dos. Si la premisa YA le puso nombre a un personaje, ESE nombre se conserva tal cual (aunque no esté en el material, aunque esté en la lista prohibida: el usuario lo eligió) — solo le agregás el apellido si le falta. El material de más abajo es para los personajes que la premisa NO nombró. Para esos, PROHIBIDO usar: ${NOMBRES_QUEMADOS}. Son los que aparecen en todas las historias y ya no significan nada.
- VESTUARIO QUE CUENTA QUIÉN ES. La ropa dice de qué vive alguien, de dónde viene y en qué década está — no si es "elegante". Nombrá prendas CONCRETAS con su estado: el uniforme con el logo descosido, la camisa planchada dos tallas grande que era del padre, las zapatillas gastadas de un lado, el reloj caro con la correa rota, el delantal con manchas que no salen. Dos personajes de la misma historia no pueden vestir del mismo mundo salvo que la premisa lo pida.
- LA ROPA SALE DE LA PREMISA, NO DEL AIRE. Antes de vestir a nadie, respondé para vos: ¿qué estaba haciendo esta persona en el momento exacto en que arranca la historia? ¿Es de día o de noche? ¿Está en su casa, saliendo del trabajo, en una fiesta, recién levantada, bajo la lluvia? La ropa es la respuesta a eso. Si la historia pasa a las 3 de la mañana en una cocina, nadie está de traje: hay una camiseta de dormir y un suéter puesto encima a las apuradas. Si alguien vuelve de un velorio, la ropa está formal pero descompuesta — el nudo de la corbata flojo, los zapatos con barro. Una prenda que podría estar en cualquier historia no sirve para ésta.
- Y LA MISMA ROPA DURA TODA LA HISTORIA. Un microdrama transcurre en minutos u horas: el personaje NO se cambia entre escenas salvo que la historia diga que pasó tiempo. Lo que sí cambia es el ESTADO: se despeina, se le corre el maquillaje, se le moja la camisa, se arremanga, se saca el saco. Describí la prenda de forma que se pueda repetir igual en cada escena.
- Define para cada uno: género (male/female/neutral), edad (child/teen/young/adult/elderly), tipo (human/animal/monster/other).
- Asigna un "voice_profile" coherente con el personaje (de la lista permitida) para que después tenga su propia voz.
- "visual_description": descripción física rica y CONCRETA para generar su retrato (rostro, edad, cabello, vestuario, expresión, iluminación, ambiente), incluyendo el rasgo firma. 1-3 frases potentes y cinematográficas. SOLO ESTA PERSONA: no nombres ni menciones a ningún otro personaje ahí ("junto a su esposa", "mirando a su hermana", "la otra") — el generador dibuja a quien se nombra, y ese retrato tiene que tener UNA sola cara. Las relaciones van en "role" y "description", nunca en "visual_description". ⚠️ Y ES CÓMO SE VE AL EMPEZAR LA HISTORIA. Si el personaje se transforma, se revela o se desenmascara (la seductora que en realidad es un demonio, el amable vecino que resulta el asesino, la enferma que fingía), la visual_description describe la ILUSIÓN — la forma humana, atractiva, normal, con la que engaña durante casi todo el video —, y la forma revelada (cuernos, ojos rojos, piel agrietada) va SOLO en "description", como evento del guion. Medido: el casting describió a la seductora con cuernos y ojos de reptil, el retrato salió demonio, y ella fue demonio desde la escena 3 — no hubo seducción ni giro. Y SIEMPRE VESTIDA: nunca "sin ropa", "desnuda", "envuelta en sombras" — el filtro lo rechaza y el retrato sale raro; la ropa cuenta quién es (ver arriba).
- Los personajes deben CONTRASTAR fuerte entre sí (visual, edad y emocionalmente) — que se distingan de un vistazo, nunca dos parecidos.
- Evita el arquetipo más obvio: dale a cada uno un giro que lo haga inesperado (el villano que da ternura, la víctima que esconde algo, el niño que sabe demasiado).
- Piensa en identificación + obsesión: que el espectador vea a alguien que reconoce Y quiera saber su secreto.
- EL PROTAGÓNICO SE CASTEA POR PRESENCIA. El protagonista y el interés amoroso son la razón por la que alguien deja de scrollear: tienen que ser ATRACTIVOS de verdad —rasgos marcados y armónicos, mirada intensa, piel luminosa, postura de quien sabe que lo miran— y en romance con un detalle sensual explícito: la clavícula, el cuello, la boca entreabierta, el pelo cayendo sobre un ojo, la camisa abierta un botón de más. En "visual_description" eso va escrito, no sugerido. Un protagónico del montón mata el video en el primer segundo.
- ATRACTIVO NO ES GENÉRICO. Que sean guapos no significa que sean intercambiables: cada uno lleva UN rasgo propio que lo hace inolvidable —un lunar junto a la boca, una cicatriz fina en la ceja, un mechón blanco, una ceja partida, pecas sobre la nariz— y ese detalle convive con la belleza en vez de reemplazarla.
- EL RASGO TIENE QUE PODER REPETIRSE IGUAL EN CADA ESCENA. El generador de imágenes vuelve a dibujar la cara desde cero en cada plano: si el rasgo depende de que un lado sea distinto del otro, no lo sostiene. PROHIBIDO: ojos de distinto color, un solo ojo claro, una sola oreja marcada, asimetrías izquierda/derecha de cualquier tipo. Medido en un video real: los ojos salieron marrones en el segundo 3 y uno verde y uno marrón en el 28 —en el primerísimo plano del clímax— y no se lee como firma del personaje, se lee como un error del modelo. Un lunar, una cicatriz, un mechón o unas pecas se redibujan idénticos porque no dependen del lado. Los personajes SECUNDARIOS —el testigo, la madre, el jefe, el amigo— sí son gente común y ahí van los cuerpos y rasgos más corrientes de las listas: el contraste con los protagónicos es lo que hace que estos brillen.
- QUE SE DISTINGAN EN SILUETA. Si tapás las caras y no podés decir quién es quién, el elenco está mal diseñado. Cada personaje lleva un CUERPO distinto y un RASGO DISTINTIVO propio de las listas que te doy abajo — nunca dos con la misma complexión, y nunca el mismo tipo de prenda en dos personajes (si uno lleva camisa oscura abierta, el otro no).

voice_profile permitidos: ${VOICE_PROFILES.join(", ")}.
(Para animal/monster usa "creature". "narrator" solo si la historia realmente necesita una voz narradora aparte.)

Devuelve ÚNICAMENTE JSON válido, sin markdown ni texto extra.`;
}

export function buildCastingUserPrompt(input: CastingInput): string {
  const max = Math.min(input.max_characters ?? MAX_CAST, MAX_CAST);
  return `Idioma: ${input.language === "en" ? "inglés" : input.language === "pt" ? "portugués" : "español latino"}.

━━━ PREMISA ━━━
NICHO: ${input.niche}${input.sub_niche ? ` › ${input.sub_niche}` : ""}
HISTORIA: ${input.topic}${input.format === "consejo" ? `
FORMATO: CONSEJO EN PRIMERA PERSONA. La protagonista le habla A CÁMARA al espectador y cuenta lo que aprendió; su "role" lo dice ("la que te cuenta a cámara cómo se dio cuenta"). Los demás personajes SOLO si la premisa los nombra o los implica de forma inequívoca ("mi esposo", "mi jefe", "mi suegra"): son contra quienes se demuestra el consejo. Si la premisa es sobre ella misma ("cómo tener confianza en mí misma", "cómo manejar mi ansiedad") el elenco es UNA persona — nadie la salva, no inventes pareja ni antagonista.` : ""}
TONO: ${input.tone}
ESTILO VISUAL: ${input.visual_style}
MÁXIMO DE PERSONAJES: ${max}

${materialDeCasting()}
Diseña el elenco (1 a ${max} personajes). Devuelve este JSON exacto:

{
  "cast": [
    {
      "name": "nombre del personaje",
      "role": "protagonista | antagonista | interés amoroso | testigo | etc.",
      "gender": "male | female | neutral",
      "age": "child | teen | young | adult | elderly",
      "kind": "human | animal | monster | other",
      "personality": "1-2 frases: quién es, su contradicción, su deseo",
      "visual_description": "descripción física rica para su retrato (rostro, edad, cabello, VESTUARIO CONCRETO con prendas y su estado, expresión, ambiente), estilo ${input.visual_style}",
      "voice_profile": "uno de: ${VOICE_PROFILES.join(" | ")}"
    }
  ]
}`;
}

// ─── Mock cast (when no AI key / FORCE_MOCK_AI) ─────────────────────────────────

function mockCast(input: CastingInput): Cast {
  return {
    cast: [
      {
        name: "Sofía",
        role: "protagonista",
        gender: "female", age: "adult", kind: "human",
        personality: "Mujer fuerte que descubre una verdad que la rompe; quiere respuestas.",
        visual_description: `Mujer de 35 años, cabello oscuro, mirada intensa y dolida, vestuario elegante, ${input.visual_style}, iluminación dramática`,
        voice_profile: "female_adult",
      },
      {
        name: "Daniel",
        role: "antagonista",
        gender: "male", age: "adult", kind: "human",
        personality: "Encantador pero esconde una doble vida; teme ser descubierto.",
        visual_description: `Hombre de 38 años, barba corta, traje, expresión culpable, ${input.visual_style}, sombras marcadas`,
        voice_profile: "male_adult",
      },
    ],
  };
}

// ─── Generate the cast via the configured AI provider ──────────────────────────

// Robustly pull a JSON object out of a model response: strips ```json fences and
// any surrounding prose, then falls back to the outermost {...} block. Models drift
// on formatting, and a bare JSON.parse turned that drift into hard failures.
function extractJson(raw: string): unknown | null {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(cleaned); } catch { /* try harder below */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* give up */ }
  }
  return null;
}

export async function generateCast(input: CastingInput): Promise<{ success: boolean; cast?: Cast; error?: string }> {
  if (process.env.FORCE_MOCK_AI === "true" || (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)) {
    return { success: true, cast: mockCast(input) };
  }

  const system = buildCastingSystemPrompt();
  const user = buildCastingUserPrompt(input);

  try {
    let raw = "";
    if (process.env.ANTHROPIC_API_KEY) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
          // 2048 truncated the JSON mid-object when the cast had 3 detailed members
          // → JSON.parse threw → intermittent 502s on the casting step.
          max_tokens: 4096,
          system: system + "\n\nResponde SOLO con el JSON, sin ```markdown ni texto extra.",
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("[casting] anthropic error", res.status, detail.slice(0, 200));
        return { success: false, error: `El diseñador de elenco no respondió (${res.status}). Intenta de nuevo.` };
      }
      const j = await res.json() as { content?: Array<{ type: string; text?: string }> };
      // Pick the TEXT block explicitly — content[0] isn't guaranteed to be text.
      raw = j.content?.find((c) => c.type === "text")?.text ?? "";
    } else {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4o",
        temperature: 0.9,
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      });
      raw = completion.choices[0]?.message?.content ?? "";
    }

    const json = extractJson(raw);
    if (!json) {
      console.error("[casting] unparseable response:", raw.slice(0, 200));
      return { success: false, error: "El elenco llegó incompleto. Intenta de nuevo." };
    }
    const parsed = CastSchema.safeParse(json);
    if (!parsed.success) {
      console.error("[casting] schema mismatch:", JSON.stringify(parsed.error.issues).slice(0, 200));
      return { success: false, error: "El elenco generado no tiene el formato esperado" };
    }
    // Enforce the hard cap.
    return { success: true, cast: { cast: parsed.data.cast.slice(0, MAX_CAST) } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error generando el elenco" };
  }
}
