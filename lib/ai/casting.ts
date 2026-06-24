import { z } from "zod";

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
  name: z.string().min(1).max(60),
  role: z.string().max(40),                 // protagonista | antagonista | interés | etc.
  gender: z.enum(["male", "female", "neutral"]),
  age: z.enum(["child", "teen", "young", "adult", "elderly"]),
  kind: z.enum(["human", "animal", "monster", "other"]),
  personality: z.string().max(300),
  visual_description: z.string().min(10).max(600), // feeds nano-banana
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
}

// ─── Prompts ────────────────────────────────────────────────────────────────

export function buildCastingSystemPrompt(): string {
  return `Eres el director de casting de VYNAVO, experto en microdramas virales.

Tu trabajo: leer la premisa de una historia y diseñar el ELENCO MÍNIMO necesario para contarla con máxima intensidad emocional — los personajes con los que el espectador se va a OBSESIONAR y querer seguir viendo.

REGLAS:
- Diseña entre 1 y ${MAX_CAST} personajes. SOLO los que la historia realmente necesita (no rellenes).
- Cada personaje debe ser ESPECÍFICO y memorable: nombre real, edad concreta, un RASGO FÍSICO FIRMA inconfundible (una cicatriz, una mirada, un mechón blanco, una prenda que siempre lleva), y una CONTRADICCIÓN interna (lo que muestra vs lo que esconde). Nada genérico.
- Define para cada uno: género (male/female/neutral), edad (child/teen/young/adult/elderly), tipo (human/animal/monster/other).
- Asigna un "voice_profile" coherente con el personaje (de la lista permitida) para que después tenga su propia voz.
- "visual_description": descripción física rica y CONCRETA para generar su retrato (rostro, edad, cabello, vestuario, expresión, iluminación, ambiente), incluyendo el rasgo firma. 1-3 frases potentes y cinematográficas.
- Los personajes deben CONTRASTAR fuerte entre sí (visual, edad y emocionalmente) — que se distingan de un vistazo, nunca dos parecidos.
- Evita el arquetipo más obvio: dale a cada uno un giro que lo haga inesperado (el villano que da ternura, la víctima que esconde algo, el niño que sabe demasiado).
- Piensa en identificación + obsesión: que el espectador vea a alguien que reconoce Y quiera saber su secreto.

voice_profile permitidos: ${VOICE_PROFILES.join(", ")}.
(Para animal/monster usa "creature". "narrator" solo si la historia realmente necesita una voz narradora aparte.)

Devuelve ÚNICAMENTE JSON válido, sin markdown ni texto extra.`;
}

export function buildCastingUserPrompt(input: CastingInput): string {
  const max = Math.min(input.max_characters ?? MAX_CAST, MAX_CAST);
  return `Idioma: ${input.language === "en" ? "inglés" : input.language === "pt" ? "portugués" : "español latino"}.

━━━ PREMISA ━━━
NICHO: ${input.niche}${input.sub_niche ? ` › ${input.sub_niche}` : ""}
HISTORIA: ${input.topic}
TONO: ${input.tone}
ESTILO VISUAL: ${input.visual_style}
MÁXIMO DE PERSONAJES: ${max}

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
      "visual_description": "descripción física rica para su retrato (rostro, edad, cabello, vestuario, expresión, ambiente), estilo ${input.visual_style}",
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
          max_tokens: 2048,
          system: system + "\n\nResponde SOLO con el JSON.",
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) return { success: false, error: `Anthropic ${res.status}` };
      const j = await res.json() as { content: Array<{ type: string; text?: string }> };
      raw = j.content[0]?.text ?? "";
    } else {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4o",
        temperature: 0.9,
        max_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      });
      raw = completion.choices[0]?.message?.content ?? "";
    }

    const parsed = CastSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { success: false, error: "El elenco generado no tiene el formato esperado" };
    // Enforce the hard cap.
    return { success: true, cast: { cast: parsed.data.cast.slice(0, MAX_CAST) } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error generando el elenco" };
  }
}
