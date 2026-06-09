import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { storyGeneratorService } from "@/services/openai/story-generator";
import {
  createProject, saveGenerationResult, updateProjectStatus,
  deductCredit, createApiLog,
} from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  title: z.string().min(1),
  niche: z.string().min(1),
  sub_niche: z.string().optional(),
  topic: z.string().min(1),
  tone: z.string().min(1),
  duration_target: z.string().min(1),
  language: z.string().default("es"),
  visual_style: z.string().default("cinematic"),
  additional_instructions: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const session = await getServerSession(authOptions);
    const isMock = process.env.FORCE_MOCK_AI === "true";
    const userId = session?.user?.id ?? null;
    if (!userId && !isMock) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    await initDb();

    // ── Check & deduct credit ─────────────────────────────────────────────────
    if (userId) {
      const credit = await deductCredit(userId);
      if (!credit.ok) {
        return NextResponse.json(
          { error: "Sin créditos disponibles. Recarga tu cuenta para continuar.", credits: 0 },
          { status: 402 }
        );
      }
    }

    // ── Create project record ─────────────────────────────────────────────────
    let projectId: string | null = null;
    if (userId) {
      projectId = await createProject({
        userId,
        title: parsed.data.title,
        niche: parsed.data.niche,
        subNiche: parsed.data.sub_niche,
        topic: parsed.data.topic,
        tone: parsed.data.tone,
        durationTarget: parsed.data.duration_target,
        language: parsed.data.language,
        visualStyle: parsed.data.visual_style,
        aiProvider: isMock ? "mock" : "openai",
      });
      await updateProjectStatus(projectId, "generating");
    }

    // ── Generate ──────────────────────────────────────────────────────────────
    const result = await storyGeneratorService.generate(parsed.data);
    const durationMs = Date.now() - t0;

    if (!result.success) {
      if (projectId) await updateProjectStatus(projectId, "failed", result.error);
      // Log failed generation
      if (userId) {
        await createApiLog({
          userId, projectId: projectId ?? undefined,
          provider: result.provider ?? "unknown",
          endpoint: "/api/generate/story",
          model: result.model,
          durationMs,
          statusCode: 422,
          error: result.error,
        });
      }
      return NextResponse.json(
        { error: result.error, validation_error: result.validation_error, provider: result.provider },
        { status: 422 }
      );
    }

    // ── Save result + log ─────────────────────────────────────────────────────
    if (projectId && result.data) {
      await saveGenerationResult({
        projectId,
        story: result.data,
        rawAiResponse: JSON.stringify(result.data),
        aiProvider: result.provider ?? "mock",
      });
    }

    if (userId) {
      await createApiLog({
        userId, projectId: projectId ?? undefined,
        provider: result.provider ?? "mock",
        endpoint: "/api/generate/story",
        model: result.model,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
        durationMs,
        statusCode: 200,
      });
    }

    return NextResponse.json({
      success: true,
      project_id: projectId,
      data: result.data,
      meta: {
        provider: result.provider,
        model: result.model,
        tokens_used: result.tokensUsed,
        cost_usd: result.costUsd,
        duration_ms: durationMs,
        retried: result.retried,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /generate/story]", message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const isMock = process.env.FORCE_MOCK_AI === "true" || (!hasOpenAI && !hasAnthropic);
  return NextResponse.json({
    status: "ok",
    provider: isMock ? "mock" : hasOpenAI ? "openai" : "anthropic",
    mock_mode: isMock,
  });
}
