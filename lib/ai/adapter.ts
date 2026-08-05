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
  // Claude preferred: better creative writing, larger context, no extra package needed
  if (process.env.ANTHROPIC_API_KEY) {
    return new ClaudeAdapter();
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIAdapter();
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
        temperature: 0.9,
        max_tokens: Number(process.env.OPENAI_MAX_TOKENS ?? 16000),
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

// ── Claude (Anthropic) Adapter ────────────────────────────────────────────────
// Uses Anthropic Messages API via fetch — no extra SDK needed.
// Set ANTHROPIC_API_KEY in Vercel to activate. Claude excels at emotional,
// structured creative writing — ideal for micro-drama scripts.

class ClaudeAdapter implements AIAdapter {
  readonly providerName = "anthropic";
  private readonly model: string;

  constructor() {
    this.model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  }

  async generateStory(
    _input: StoryInput,
    systemPrompt: string,
    userPrompt: string
  ): Promise<AIAdapterResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        // Reel pacing means 12-18 scenes, each with a ~150-word English image_prompt
        // plus animation direction. 8096 truncated the JSON mid-object → parse errors.
        max_tokens: Number(process.env.ANTHROPIC_MAX_TOKENS ?? 32000),
        system: systemPrompt + "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, no text before or after the JSON object.",
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return {
        success: false,
        error: `Anthropic API error ${response.status}: ${err}`,
        provider: this.providerName,
        model: this.model,
      };
    }

    const json = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const rawResponse = json.content[0]?.type === "text" ? json.content[0].text ?? "" : "";
    const tokensUsed = (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0);
    const costUsd = (tokensUsed / 1_000_000) * 3.0;

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

    const sceneDurSec = Math.ceil(
      (input.duration_target === "30s" ? 30
        : input.duration_target === "60s" ? 60
        : input.duration_target === "3-5min" ? 240
        : 900) / sceneCount
    );

    // Per-scene dramatic templates so mock videos feel like real micro-dramas
    const MOCK_NARRATIONS = [
      `Nadie sabe lo que realmente pasó esa noche. Solo quedó una sombra en la pared y el silencio.`,
      `Ella abrió el cajón y encontró algo que cambió todo. Sus manos temblaban sin control.`,
      `Habían prometido que jamás volverían. Pero ahí estaban, de nuevo, en la puerta.`,
      `El mensaje decía solo tres palabras. Tres palabras que lo arruinaban todo.`,
      `Mintió durante años. Y cuando la verdad salió, fue peor de lo que imaginaba.`,
      `Se miraron en silencio. Los dos sabían lo que vendría después.`,
      `El reloj marcaba las 3 de la madrugada. Esa hora en que los secretos salen solos.`,
      `No era la primera vez que desaparecía. Pero esta vez algo era diferente.`,
      `Le dijeron que era una coincidencia. Pero las coincidencias no duran tres años.`,
      `El final nunca fue lo que esperabas. ¿O sí lo sabías desde el principio?`,
    ];

    const scenes = Array.from({ length: sceneCount }, (_, i) => ({
      scene_number: i + 1,
      narration_text: MOCK_NARRATIONS[i % MOCK_NARRATIONS.length]!,
      duration_seconds: sceneDurSec,
      image_prompt: `${input.visual_style} style, cinematic dramatic scene ${i + 1}, ${input.niche} atmosphere, moody lighting with deep shadows, emotional tension, ultra detailed, 8k, ${input.tone} tone`,
      animation_prompt: `${["Slow push in revealing the subject", "Gentle dolly left with depth of field", "Static wide with subtle camera shake", "Slow tilt up from detail to face", "Smooth pan right following the action"][i % 5]}, cinematic motion, ${input.tone} mood`,
      emotion: (["tension", "mystery", "hope", "fear", "wonder"] as const)[i % 5] ?? "tension",
      camera_move: (["slow push in", "static wide", "dolly left", "tilt up", "pan right"] as const)[i % 5] ?? "static wide",
    }));

    const mockData: StoryOutput = {
      meta: {
        title: `${input.topic} — La Historia Que Nadie Te Contó`,
        niche: input.niche,
        tone: input.tone,
        duration_target: input.duration_target,
        language: input.language,
        visual_style: input.visual_style,
      },
      story: {
        hook: `¿Qué pasaría si todo lo que creías sobre ${input.topic} fuera una mentira?`,
        full_narrative: `Una historia que nadie se atrevió a contar. Sobre ${input.topic}. El principio parece simple, pero nada es lo que parece. Cada escena revela una capa más oscura. Al final, la única pregunta que queda es: ¿tú habrías hecho lo mismo?`,
        cta: "Comenta PARTE 2 para saber qué pasó",
      },
      scenes,
      seo: {
        title: `${input.topic} — La Historia Que Nadie Te Contó`,
        description: `Descubre la verdad detrás de ${input.topic}. Una historia de ${input.tone} que te dejará sin palabras. #${input.niche} #historias #viral`,
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
        thumbnail_concept: `Imagen dramática relacionada con ${input.topic}, expresión de sorpresa o miedo, texto impactante superpuesto.`,
        thumbnail_prompt: `${input.visual_style} style, dramatic close-up face expressing shock/fear, dark moody background, ${input.topic} theme, cinematic lighting, high contrast.`,
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
