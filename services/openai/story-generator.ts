import { v4 as uuidv4 } from "uuid";
import { StoryInputSchema, type StoryInput, type StoryOutput } from "@/lib/validators/story.schema";
import { createAIAdapter, type AIAdapterResult } from "@/lib/ai/adapter";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/ai/prompts";
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

    // 2. Build prompts
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(input);

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

    // 5. If still failed, return error
    if (!result.success || !result.data) {
      const durationMs = Date.now() - start;
      console.error("[StoryGenerator] Generation failed:", result.error);
      return {
        success: false,
        error: "Story generation failed after retry",
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
