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
  ]),
  duration_target: z.enum(["30s", "60s", "3-5min", "10-20min"]),
  language: z.enum(["es", "en", "pt"]).default("es"),
  visual_style: z
    .enum(["cinematic", "anime", "realistic", "cartoon", "vintage"])
    .default("cinematic"),
  target_platform: z
    .enum(["tiktok", "instagram", "youtube_shorts", "youtube_long"])
    .default("youtube_shorts"),
  additional_instructions: z.string().max(500).optional(),
});

export type StoryInput = z.infer<typeof StoryInputSchema>;

// ── Output Schemas (what AI must return) ─────────────────────────────────────

export const SceneSchema = z.object({
  scene_number: z.number().int().positive(),
  narration_text: z.string().min(10),
  duration_seconds: z.number().int().min(2).max(120),
  image_prompt: z
    .string()
    .min(20)
    .describe("Detailed prompt for image generation (Midjourney/SDXL)"),
  animation_prompt: z
    .string()
    .min(10)
    .describe("Motion prompt for video animation (Kling/Runway)"),
  emotion: z.string(),
  camera_move: z.string(),
});

export type Scene = z.infer<typeof SceneSchema>;

export const SEOSchema = z.object({
  title: z.string().min(10).max(100),
  description: z.string().min(50).max(500),
  hashtags: z.array(z.string()).min(5).max(30),
  tags: z.array(z.string()).min(5).max(20),
  thumbnail_concept: z.string().min(20),
  thumbnail_prompt: z
    .string()
    .min(20)
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
      return {
        success: false,
        error: "JSON parse failed after repair attempt",
        raw,
      };
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
