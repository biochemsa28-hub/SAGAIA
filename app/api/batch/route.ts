import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { storyGeneratorService } from "@/services/openai/story-generator";
import {
  getUserById, deductCredit,
  createProject, saveGenerationResult, updateProjectStatus,
} from "@/lib/db/repository";
import { initDb } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

interface BatchItem {
  idea: string;
  niche: string;
  tone: string;
  language?: string;
  duration_target?: string;
  visual_style?: string;
  platform?: string;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await initDb();
    const body = (await req.json()) as { items: BatchItem[] };
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "Se requiere al menos 1 item" }, { status: 400 });
    }
    if (body.items.length > 10) {
      return NextResponse.json({ error: "Máximo 10 proyectos por lote" }, { status: 400 });
    }

    const user = await getUserById(session.user.id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const validItems = body.items.filter((it) => it.idea?.trim().length > 5);
    if (user.credits < validItems.length) {
      return NextResponse.json({
        error: `No tienes suficientes créditos. Necesitas ${validItems.length}, tienes ${user.credits}.`,
        credits_needed: validItems.length,
        credits_available: user.credits,
      }, { status: 402 });
    }

    const results: Array<{
      index: number;
      idea: string;
      status: "created" | "error";
      project_id?: string;
      title?: string;
      error?: string;
    }> = [];

    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i]!;
      try {
        // Deduct credit
        const { ok, remaining } = await deductCredit(session.user.id);
        if (!ok) {
          results.push({ index: i, idea: item.idea, status: "error", error: `Sin créditos (quedan ${remaining})` });
          break;
        }

        // Create project
        const projectId = await createProject({
          userId: session.user.id,
          title: item.idea.slice(0, 60),
          niche: item.niche,
          topic: item.idea,
          tone: item.tone,
          durationTarget: item.duration_target ?? "60-90s",
          language: item.language ?? "es",
          visualStyle: item.visual_style ?? "cinematic",
          aiProvider: process.env.FORCE_MOCK_AI === "true" ? "mock" : "openai",
        });
        await updateProjectStatus(projectId, "generating");

        // Generate story
        const result = await storyGeneratorService.generate({
          niche: item.niche,
          topic: item.idea,
          tone: item.tone,
          language: item.language ?? "es",
          duration_target: item.duration_target ?? "60-90s",
          visual_style: item.visual_style ?? "cinematic",
        });

        if (!result.success || !result.data) {
          await updateProjectStatus(projectId, "failed", result.error);
          results.push({ index: i, idea: item.idea, status: "error", error: result.error ?? "Error al generar" });
          continue;
        }

        await saveGenerationResult({
          projectId,
          story: result.data,
          rawAiResponse: JSON.stringify(result.data),
          aiProvider: result.provider ?? "mock",
        });
        await updateProjectStatus(projectId, "ready");

        results.push({
          index: i,
          idea: item.idea,
          status: "created",
          project_id: projectId,
          title: item.idea.slice(0, 60),
        });
      } catch (err) {
        results.push({
          index: i,
          idea: item.idea,
          status: "error",
          error: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    const failed  = results.filter((r) => r.status === "error").length;

    return NextResponse.json({ ok: true, created, failed, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("[API /batch]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
