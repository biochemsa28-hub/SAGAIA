import { v4 as uuidv4 } from "uuid";
import { StoryInputSchema, type StoryInput, type StoryOutput } from "@/lib/validators/story.schema";
import { createAIAdapter, type AIAdapterResult } from "@/lib/ai/adapter";
import { buildSystemPrompt, buildUserPrompt, buildAdSystemPrompt, buildAdUserPrompt } from "@/lib/ai/prompts";
import { validateStoryOutput } from "@/lib/validators/story.schema";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerateStoryResult {
  success: boolean;
  data?: StoryOutput & { project_id: string };
  error?: string;
  validation_error?: string;
  provider: string;
  model: string;
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
  retried: boolean;
}

// ── Error humanizer ─────────────────────────────────────────────────────────
// Turns raw OpenAI / validation errors into a clear, actionable Spanish message
function humanizeError(raw?: string): string {
  if (!raw) return "No se pudo generar la historia. Intenta de nuevo.";
  const e = raw.toLowerCase();
  // Provider-agnostic: works whether the engine is Claude (anthropic) or OpenAI.
  const isAnthropic = e.includes("anthropic") || e.includes("claude");
  const provider = isAnthropic ? "Claude" : "OpenAI";

  if (e.includes("insufficient_quota") || e.includes("exceeded your current quota") || e.includes("billing") || e.includes("credit balance"))
    return `La cuenta de ${provider} no tiene saldo. Recarga crédito para continuar.`;
  if (e.includes("invalid_api_key") || e.includes("incorrect api key") || e.includes("authentication") || (e.includes("401") && e.includes("api")))
    return `La clave de ${provider} es inválida. Revisa la configuración.`;
  if (e.includes("rate limit") || e.includes("429"))
    return `${provider} está saturado (rate limit). Espera unos segundos e intenta de nuevo.`;
  if (e.includes("model") && (e.includes("does not exist") || e.includes("not found")))
    return `El modelo de ${provider} configurado no existe. Revisa la configuración.`;
  if (e.includes("timeout") || e.includes("etimedout") || e.includes("econnreset"))
    return `${provider} tardó demasiado en responder. Intenta de nuevo.`;
  // Validation failures (AI returned malformed/incomplete JSON)
  if (e.includes(":") && (e.includes("required") || e.includes("expected") || e.includes("invalid") || e.includes("min") || e.includes("max")))
    return `La IA devolvió una historia incompleta (${raw.slice(0, 120)}). Intenta de nuevo.`;

  return `No se pudo generar la historia: ${raw.slice(0, 140)}`;
}

// ── Main Service ──────────────────────────────────────────────────────────────

export class StoryGeneratorService {
  private readonly adapter = createAIAdapter();

  async generate(rawInput: unknown): Promise<GenerateStoryResult> {
    const start = Date.now();

    // 1. Validate input
    const inputParse = StoryInputSchema.safeParse(rawInput);
    if (!inputParse.success) {
      return this.errorResult(
        `Invalid input: ${inputParse.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        start
      );
    }
    const input: StoryInput = inputParse.data;

    // 2. Build prompts — ad format uses the UGC ad brain, else the drama brain.
    const isAd = input.format === "ad";
    const systemPrompt = isAd ? buildAdSystemPrompt() : buildSystemPrompt();
    const userPrompt = isAd ? buildAdUserPrompt(input) : buildUserPrompt(input);

    // 3. First attempt
    console.log(`[StoryGenerator] Generating with ${this.adapter.providerName}...`);
    let result: AIAdapterResult = await this.adapter.generateStory(
      input,
      systemPrompt,
      userPrompt
    );
    let retried = false;

    // 4. Retry once if validation failed but we got a raw response
    if (!result.success && result.rawResponse) {
      console.warn("[StoryGenerator] First attempt failed validation, retrying...");
      retried = true;

      // Try to repair the raw response before retrying
      const repairAttempt = validateStoryOutput(result.rawResponse);
      if (repairAttempt.success) {
        console.log("[StoryGenerator] JSON repair succeeded.");
        result = {
          ...result,
          success: true,
          data: repairAttempt.data,
        };
      } else {
        // Full retry
        result = await this.adapter.generateStory(input, systemPrompt, userPrompt);
      }
    }

    // 5. If still failed, return error with the REAL cause surfaced
    if (!result.success || !result.data) {
      const durationMs = Date.now() - start;
      console.error("[StoryGenerator] Generation failed:", result.error);
      return {
        success: false,
        error: humanizeError(result.error),
        validation_error: result.error,
        provider: result.provider,
        model: result.model,
        tokensUsed: result.tokensUsed ?? 0,
        costUsd: result.costUsd ?? 0,
        durationMs,
        retried,
      };
    }

    // 6. Assign project ID
    const projectId = uuidv4();
    const finalData = { ...result.data, project_id: projectId };

    const durationMs = Date.now() - start;
    console.log(
      `[StoryGenerator] Success. Provider: ${result.provider}, Tokens: ${result.tokensUsed ?? 0}, Time: ${durationMs}ms`
    );

    return {
      success: true,
      data: finalData,
      provider: result.provider,
      model: result.model,
      tokensUsed: result.tokensUsed ?? 0,
      costUsd: result.costUsd ?? 0,
      durationMs,
      retried,
    };
  }

  private errorResult(error: string, start: number): GenerateStoryResult {
    return {
      success: false,
      error,
      provider: this.adapter.providerName,
      model: "unknown",
      tokensUsed: 0,
      costUsd: 0,
      durationMs: Date.now() - start,
      retried: false,
    };
  }
}

// Singleton for API routes
export const storyGeneratorService = new StoryGeneratorService();
