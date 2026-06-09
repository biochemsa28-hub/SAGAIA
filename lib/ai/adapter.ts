import type { StoryInput, StoryOutput } from "@/lib/validators/story.schema";
import { validateStoryOutput } from "@/lib/validators/story.schema";

// ── Adapter Interface ─────────────────────────────────────────────────────────

export interface AIAdapter {
  generateStory(
    input: StoryInput,
    systemPrompt: string,
    userPrompt: string
  ): Promise<AIAdapterResult>;
  readonly providerName: string;
}

export interface AIAdapterResult {
  success: boolean;
  data?: StoryOutput;
  rawResponse?: string;
  tokensUsed?: number;
  costUsd?: number;
  error?: string;
  provider: string;
  model: string;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAIAdapter(): AIAdapter {
  if (process.env.FORCE_MOCK_AI === "true") {
    return new MockAIAdapter();
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIAdapter();
  }
  if (process.env.ANTHROPIC_API_KEY) {
    // Future: return new ClaudeAdapter();
    console.warn("[AI Adapter] Anthropic key found but adapter not yet implemented. Using mock.");
    return new MockAIAdapter();
  }
  console.warn("[AI Adapter] No API key found. Using mock adapter.");
  return new MockAIAdapter();
}

// ── OpenAI Adapter ────────────────────────────────────────────────────────────

class OpenAIAdapter implements AIAdapter {
  readonly providerName = "openai";
  private readonly model: string;

  constructor() {
    this.model = process.env.OPENAI_MODEL ?? "gpt-4o";
  }

  async generateStory(
    _input: StoryInput,
    systemPrompt: string,
    userPrompt: string
  ): Promise<AIAdapterResult> {
    // Dynamic import so build doesn't fail without openai package
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    try {
      const completion = await client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: Number(process.env.OPENAI_MAX_TOKENS ?? 4096),
        response_format: { type: "json_object" },
      });

      const rawResponse = completion.choices[0]?.message?.content ?? "";
      const tokensUsed = completion.usage?.total_tokens ?? 0;
      // Rough cost estimate for gpt-4o
      const costUsd = (tokensUsed / 1_000_000) * 5.0;

      const validation = validateStoryOutput(rawResponse);
      if (!validation.success) {
        return {
          success: false,
          rawResponse,
          error: validation.error,
          tokensUsed,
          costUsd,
          provider: this.providerName,
          model: this.model,
        };
      }

      return {
        success: true,
        data: validation.data,
        rawResponse,
        tokensUsed,
        costUsd,
        provider: this.providerName,
        model: this.model,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message,
        provider: this.providerName,
        model: this.model,
      };
    }
  }
}

// ── Mock Adapter ──────────────────────────────────────────────────────────────

export class MockAIAdapter implements AIAdapter {
  readonly providerName = "mock";

  async generateStory(
    input: StoryInput,
    _systemPrompt: string,
    _userPrompt: string
  ): Promise<AIAdapterResult> {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 800));

    const sceneCount = input.duration_target === "30s" ? 4
      : input.duration_target === "60s" ? 6
      : input.duration_target === "3-5min" ? 10
      : 20;

    const scenes = Array.from({ length: sceneCount }, (_, i) => ({
      scene_number: i + 1,
      narration_text: `[MOCK] Escena ${i + 1}: La historia de "${input.topic}" continúa. ${
        i === 0
          ? "El gancho inicial atrapa la atención del espectador."
          : `La tensión aumenta en esta escena del tema ${input.niche}.`
      }`,
      duration_seconds: Math.ceil(
        (input.duration_target === "30s" ? 30
          : input.duration_target === "60s" ? 60
          : input.duration_target === "3-5min" ? 240
          : 900) / sceneCount
      ),
      image_prompt: `[MOCK] ${input.visual_style} style, dramatic lighting, scene ${i + 1} of ${input.topic}. Cinematic composition, 8k resolution, detailed environment, emotional atmosphere matching ${input.tone} tone.`,
      animation_prompt: `[MOCK] Slow ${i % 2 === 0 ? "push in" : "dolly left"}, subtle atmospheric movement, ${input.tone} mood, smooth 24fps.`,
      emotion: ["tension", "mystery", "hope", "fear", "wonder"][i % 5] ?? "tension",
      camera_move: ["slow push in", "static wide", "dolly left", "tilt up", "pan right"][i % 5] ?? "static wide",
    }));

    const mockData: StoryOutput = {
      meta: {
        title: `[MOCK] ${input.topic} — Historia ${input.tone}`,
        niche: input.niche,
        tone: input.tone,
        duration_target: input.duration_target,
        language: input.language,
        visual_style: input.visual_style,
      },
      story: {
        hook: `[MOCK] ¿Qué pasaría si todo lo que creías sobre ${input.topic} fuera una mentira?`,
        full_narrative: `[MOCK] Historia completa sobre: ${input.topic}. Tono: ${input.tone}. Esta es una historia de ejemplo generada por el adaptador mock. En producción, aquí irá la narrativa completa generada por OpenAI o Claude.`,
        cta: "[MOCK] Síguenos para más historias como esta. ¿Te sorprendió el final? Cuéntanos en los comentarios.",
      },
      scenes,
      seo: {
        title: `[MOCK] ${input.topic} — La Historia Que Nadie Te Contó`,
        description: `[MOCK] Descubre la verdad detrás de ${input.topic}. Una historia de ${input.tone} que te dejará sin palabras. #${input.niche} #historias #viral`,
        hashtags: [
          `#${input.niche}`,
          `#${input.tone}`,
          "#historias",
          "#viral",
          "#storytelling",
          "#contenido",
          "#youtube",
          "#shorts",
          "#microhistorias",
          "#drama",
        ],
        tags: [input.niche, input.tone, input.topic, "microhistorias", "storytelling"],
        thumbnail_concept: `[MOCK] Imagen dramática relacionada con ${input.topic}, expresión de sorpresa o miedo, texto impactante superpuesto.`,
        thumbnail_prompt: `[MOCK] ${input.visual_style} style, dramatic close-up face expressing shock/fear, dark moody background, ${input.topic} theme, cinematic lighting, high contrast.`,
      },
      production_notes: {
        total_duration_seconds:
          input.duration_target === "30s" ? 30
            : input.duration_target === "60s" ? 60
            : input.duration_target === "3-5min" ? 240
            : 900,
        scene_count: sceneCount,
        voice_style: "dramatic and engaging",
        music_mood: "tense and atmospheric",
      },
    };

    return {
      success: true,
      data: mockData,
      rawResponse: JSON.stringify(mockData),
      tokensUsed: 0,
      costUsd: 0,
      provider: this.providerName,
      model: "mock-v1",
    };
  }
}
