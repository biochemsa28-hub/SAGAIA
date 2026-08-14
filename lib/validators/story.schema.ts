import { z } from "zod";

// ── Input Schemas ────────────────────────────────────────────────────────────

export const StoryInputSchema = z.object({
  niche: z.string().min(2).max(100),
  sub_niche: z.string().max(100).optional(),
  topic: z.string().min(5).max(500),
  tone: z.enum([
    "horror",
    "romance",
    "mystery",
    "inspirational",
    "comedy",
    "thriller",
    "documentary",
    "fantasy",
    "drama",
    // Formatos que dominan el feed hispanohablante y que el guion trata distinto:
    // el chisme es confesional y cómplice, la confesión es íntima y sin redención.
    "chisme",
    "confesion",
  ]),
  duration_target: z.enum(["30s", "60s", "3-5min", "10-20min"]),
  language: z.enum(["es", "en", "pt"]).default("es"),
  visual_style: z
    .enum(["cinematic", "anime", "realistic", "cartoon", "vintage"])
    .default("cinematic"),
  target_platform: z
    .enum(["tiktok", "instagram", "youtube_shorts", "youtube_long"])
    .default("youtube_shorts"),
  // Lets the prompt skip fields the chosen tier will never use (e.g. the Ken Burns
  // tier never calls a video model, so animation_prompt would be generated and
  // thrown away — pure latency for nothing).
  animation_tier: z.enum(["kenburns", "cinematic", "talking"]).optional(),
  // Holds the user's notes PLUS the injected cast design + chosen hook, so the
  // ceiling must fit several character bios — not just a short note.
  additional_instructions: z.string().max(3000).optional(),
  // Content format: a narrative micro-series (default) or a UGC-style ADVERTISING
  // video (product pitch). Same pipeline, different script brain.
  format: z.enum(["story", "ad"]).default("story"),
  // "borrador" salta el modelo de video — el 82,5% del costo — para poder juzgar
  // la historia antes de pagar el render caro. Ausente = estreno.
  quality: z.enum(["borrador", "estreno"]).optional(),
});

export type StoryInput = z.infer<typeof StoryInputSchema>;

// ── Output Schemas (what AI must return) ─────────────────────────────────────

export const SceneSchema = z.object({
  scene_number: z.number().int().positive(),
  narration_text: z.string().min(10),
  // WHO speaks this scene's narration (a cast member's name). Optional so older
  // stories without attribution still validate.
  speaker: z.string().max(60).optional(),
  // The speaking character's voice archetype (from the cast). Drives the per-scene
  // ElevenLabs voice so each character sounds distinct.
  voice_profile: z.string().max(30).optional(),
  // EL SONIDO DE ESTA ESCENA — el ruido concreto que ocurre en ella (una puerta que
  // se abre, un vaso que se rompe, pasos que se acercan). En INGLÉS porque el
  // generador de audio está entrenado así. Opcional: una escena sin sonido propio
  // simplemente no lo lleva, y el video se arma igual.
  //
  // Esto es distinto de la música: la música sostiene el tono de TODA la historia,
  // el sfx marca UN instante. El golpe seco es lo que hace saltar al espectador —
  // la música sola nunca produce ese reflejo.
  sfx_prompt: z.string().max(120).optional(),
  // CÓMO SE VE quien habla, en inglés y en pocas palabras ("the woman in the red
  // dress", "the man in the white shirt"). El modelo de video no sabe quién es
  // "Valeria": un nombre no identifica a nadie en una imagen, así que ponía todas
  // las líneas del bloque en la boca del personaje que estuviera enfocado. Una
  // descripción visual sí lo distingue.
  //
  // Tiene que ser EL MISMO texto para el mismo personaje en todas sus escenas, o
  // deja de servir para identificarlo.
  speaker_look: z.string().max(80).optional(),
  // DÓNDE transcurre la escena, en inglés y en pocas palabras ("the master
  // bedroom", "the kitchen at night"). Dos escenas en el mismo lugar deben llevar
  // EL MISMO texto — es lo que permite saber si hubo cambio de escenario.
  //
  // Importa por una razón concreta: los clips se encadenan con el cuadro inicial
  // del siguiente para que se lean como una toma continua, y eso solo funciona
  // dentro de un mismo lugar. Encadenado a través de un cambio de locación, el
  // modelo intenta TRANSFORMAR una habitación en otra y el resultado es un morfeo
  // feo. Sabiendo la locación se puede encadenar cuando corresponde y cortar
  // limpio cuando no.
  location: z.string().max(80).optional(),
  // QUÉ SE MUEVE EN EL AMBIENTE, aparte del personaje y de la cámara. En inglés.
  // Lluvia en la ventana, una cortina, el humo de una taza, una lámpara que
  // parpadea, polvo en el haz de luz.
  //
  // Es un eje separado a propósito: el movimiento de cámara, lo que hace el
  // personaje y lo que hace el MUNDO son tres cosas distintas, y meterlas en un
  // solo texto hace que el modelo elija una y descarte las otras. Un plano donde
  // solo se mueve la cara se lee como una foto que habla; el mismo plano con la
  // lluvia corriendo por el vidrio detrás se lee como una toma.
  environment: z.string().max(100).optional(),
  duration_seconds: z.number().int().min(2).max(120),
  image_prompt: z
    .string()
    .min(20)
    .describe("Detailed prompt for image generation (Midjourney/SDXL)"),
  animation_prompt: z
    .string()
    .min(10)
    .describe("Motion prompt for video animation (Kling/Runway)"),
  // LA ACCIÓN FÍSICA ENTRE LOS PERSONAJES, EN ORDEN.
  //
  // Sin esto el clip es gente hablando: animation_prompt pide "qué hace el
  // personaje CON EL ENTORNO" —una cortina, el humo de una taza— y la dirección
  // de diálogo la monta como algo simultáneo a la línea. Así nadie se besa,
  // nadie se toca y nadie se mira: falta lo que ocurre ANTES de hablar y lo que
  // ocurre DESPUÉS, que es donde vive la escena.
  //
  // Formato: "antes | después". Ej: "they are kissing, she pulls back an inch to
  // speak | their eyes lock and neither looks away".
  physical_action: z.string().max(220).optional(),
  /** ESTA es la escena del pico físico del video.
   *
   *  Antes se deducía leyendo physical_action con una regex de categorías —
   *  besos, caídas, golpes, llanto—, o sea una ENUMERACIÓN de lo que un cuerpo
   *  puede hacer. Eso no se enumera: en un solo día de pruebas aparecieron seis
   *  agujeros (arrancar un velo, dejar caer una carpeta, incorporarse en un
   *  cajón, frenar en seco, la multitud que se da vuelta, la mancha visible) y
   *  cada uno era un video sin su momento.
   *
   *  El guionista ya sabe cuál es —la REGLA #2.8 le exige tener una—; solo le
   *  faltaba poder decirlo. */
  is_peak: z.boolean().optional(),
  emotion: z.string(),
  camera_move: z.string(),
});

export type Scene = z.infer<typeof SceneSchema>;

export const SEOSchema = z.object({
  // Floors kept lenient so one short array never fails an expensive generation.
  // The prompt still asks for ambitious counts (15-25 hashtags) for virality.
  title: z.string().min(8).max(160),
  description: z.string().min(20).max(600),
  hashtags: z.array(z.string()).min(3).max(40),
  tags: z.array(z.string()).min(3).max(30),
  thumbnail_concept: z.string().min(10),
  thumbnail_prompt: z
    .string()
    .min(10)
    .describe("Image generation prompt for thumbnail"),
});

export type SEO = z.infer<typeof SEOSchema>;

export const ProductionNotesSchema = z.object({
  total_duration_seconds: z.number().int().positive(),
  scene_count: z.number().int().positive(),
  voice_style: z.string(),
  music_mood: z.string(),
});

export const StoryOutputSchema = z.object({
  project_id: z.string().uuid().optional(), // filled after DB save
  meta: z.object({
    title: z.string().min(5).max(150),
    niche: z.string(),
    tone: z.string(),
    duration_target: z.string(),
    language: z.string(),
    visual_style: z.string(),
  }),
  story: z.object({
    hook: z.string().min(10).describe("Opening hook sentence (first 3 seconds)"),
    full_narrative: z.string().min(100),
    cta: z.string().min(10).describe("Call to action for end of video"),
  }),
  scenes: z.array(SceneSchema).min(3).max(50),
  seo: SEOSchema,
  production_notes: ProductionNotesSchema,
});

export type StoryOutput = z.infer<typeof StoryOutputSchema>;

// ── Validation Utilities ──────────────────────────────────────────────────────

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  raw?: string;
}

/**
 * Attempts to parse and validate AI JSON output.
 * Tries to repair common JSON issues before failing.
 */
export function validateStoryOutput(
  raw: string
): ValidationResult<StoryOutput> {
  // Step 1: Extract JSON if wrapped in markdown code blocks
  let cleaned = raw.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    cleaned = jsonMatch[1].trim();
  }

  // Step 2: Try parsing as-is
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Step 3: Attempt basic repair (trailing commas only)
    // NOTE: Do NOT replace single quotes globally — apostrophes in text values would be corrupted
    const repaired = cleaned
      .replace(/,\s*([}\]])/g, "$1"); // trailing commas

    try {
      parsed = JSON.parse(repaired);
    } catch {
      // Step 3b: last resort — slice out the outermost {...} block. Models sometimes
      // wrap the JSON in prose, or emit a stray token before/after the object.
      const start = repaired.indexOf("{");
      const end = repaired.lastIndexOf("}");
      let recovered: unknown = null;
      if (start >= 0 && end > start) {
        try { recovered = JSON.parse(repaired.slice(start, end + 1)); } catch { /* truly broken */ }
      }
      if (recovered === null) {
        // Truncation is the usual culprit (response hit max_tokens mid-object) —
        // say so, because "parse failed" alone sends you hunting in the wrong place.
        const looksTruncated = !repaired.trimEnd().endsWith("}");
        return {
          success: false,
          error: looksTruncated
            ? "La historia llegó incompleta (respuesta truncada). Intenta de nuevo o reduce la duración."
            : "JSON parse failed after repair attempt",
          raw,
        };
      }
      parsed = recovered;
    }
  }

  // Step 4: Validate with Zod
  const result = StoryOutputSchema.safeParse(parsed);
  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; "),
    raw,
  };
}
