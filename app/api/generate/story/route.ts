import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { storyGeneratorService } from "@/services/openai/story-generator";
import {
  createProject, saveGenerationResult, updateProjectStatus,
  deductCredits, createApiLog, setProjectCharacter, getUserById, setProjectCast,
} from "@/lib/db/repository";
import { resolveProjectTier, creditCostForTier } from "@/lib/config";
import { initDb } from "@/lib/db";
import { z } from "zod";
import { captureServer } from "@/lib/analytics/posthog";
import { rateLimit, getClientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  title: z.string().optional(),
  niche: z.string().min(1),
  sub_niche: z.string().optional(),
  topic: z.string().min(1),
  tone: z.string().min(1),
  duration_target: z.string().min(1),
  language: z.string().default("es"),
  visual_style: z.string().default("cinematic"),
  target_platform: z.string().optional(),
  additional_instructions: z.string().optional(),
  character_id: z.string().uuid().optional(), // reuse a saved recurring character
  animation_tier: z.enum(["kenburns", "cinematic", "talking"]).optional(),
  format: z.enum(["story", "ad"]).optional(), // "ad" = UGC advertising video
  reference_image_url: z.string().url().optional(), // user-uploaded product/creative image

  // The cast chosen on the "Elenco" screen: each character's name, voice archetype
  // and the portrait the user selected. Persisted so production gives each scene's
  // speaker the right face (per-scene image reference) and voice (Phase 4).
  cast: z.array(z.object({
    name: z.string().min(1).max(60),
    role: z.string().max(40).optional(),
    voice_profile: z.string().max(30).optional(),
    reference_image_url: z.string().url().optional(),
  })).max(4).optional(),
});

export async function POST(req: NextRequest) {
  // 20 story generations per user/IP per hour
  const ip = getClientIp(req);
  const rl = rateLimit(`generate:${ip}`, { limit: 20, windowSecs: 3600 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Límite de generaciones alcanzado. Espera antes de continuar." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

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

    // Resolve the animation tier the user chose, clamped to what their plan allows.
    // The tier determines how many NAVOS the video costs (premium tiers cost more).
    const user = userId ? await getUserById(userId).catch(() => null) : null;
    const animationTier = resolveProjectTier(parsed.data.animation_tier ?? null, user?.plan ?? "free");
    const creditCost = creditCostForTier(animationTier);

    // ── Check & deduct credits (tier-aware) ───────────────────────────────────
    if (userId) {
      const credit = await deductCredits(userId, creditCost);
      if (!credit.ok) {
        return NextResponse.json(
          { error: `Necesitas ${creditCost} NAVOS para este tipo de video. Recarga tu cuenta para continuar.`, credits: credit.remaining, required: creditCost },
          { status: 402 }
        );
      }
    }

    // ── Create project record ─────────────────────────────────────────────────
    const autoTitle = parsed.data.title ||
      `${parsed.data.niche} — ${parsed.data.topic.slice(0, 40)}`;

    let projectId: string | null = null;
    if (userId) {
      projectId = await createProject({
        userId,
        title: autoTitle,
        niche: parsed.data.niche,
        subNiche: parsed.data.sub_niche,
        topic: parsed.data.topic,
        tone: parsed.data.tone,
        durationTarget: parsed.data.duration_target,
        language: parsed.data.language,
        visualStyle: parsed.data.visual_style,
        aiProvider: isMock ? "mock" : "openai",
        animationTier,
        creditsSpent: creditCost,
        referenceImageUrl: parsed.data.reference_image_url ?? null,
      });
      await updateProjectStatus(projectId, "generating");
      // Link a saved recurring character so all scenes reuse its locked-in look.
      if (parsed.data.character_id) {
        await setProjectCharacter(projectId, userId, parsed.data.character_id).catch(() => {});
      }
      // Persist the chosen cast (name → portrait + voice) for per-scene production.
      if (parsed.data.cast?.length) {
        await setProjectCast(projectId, parsed.data.cast).catch(() => {});
      }
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

    if (userId) {
      captureServer(userId, "story_generated", {
        niche: parsed.data.niche,
        tone: parsed.data.tone,
        duration: parsed.data.duration_target,
        provider: result.provider,
        duration_ms: durationMs,
        project_id: projectId,
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
