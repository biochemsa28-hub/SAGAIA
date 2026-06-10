import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail, updateProjectStatus, upsertAsset } from "@/lib/db/repository";
import { generateProjectVoice } from "@/services/elevenlabs/voice-generator";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120; // voice generation takes time

const BodySchema = z.object({
  project_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "project_id requerido" }, { status: 400 });

    await initDb();
    const detail = await getProjectDetail(parsed.data.project_id, session.user.id);
    if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    if (!detail.story) return NextResponse.json({ error: "El proyecto no tiene historia generada" }, { status: 422 });

    await updateProjectStatus(parsed.data.project_id, "voice_pending");

    const results = await generateProjectVoice({
      projectId: parsed.data.project_id,
      tone: detail.project.tone,
      scenes: detail.scenes.map((s) => ({
        scene_number: s.scene_number,
        narration_text: s.narration_text,
      })),
    });

    const failed = results.filter((r) => !r.success);
    const succeeded = results.filter((r) => r.success);

    // Upload audio files to fal.ai storage for public URLs
    await Promise.all(
      results
        .filter((r) => r.success && r.filePath && !r.mock)
        .map(async (r) => {
          try {
            const { readFileSync } = await import("fs");
            const audioBuffer = readFileSync(r.filePath!);
            const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
            const { fal } = await import("@fal-ai/client");
            fal.config({ credentials: process.env.FAL_API_KEY });
            const uploaded = await fal.storage.upload(blob) as string;
            await upsertAsset({
              projectId: parsed.data.project_id,
              sceneNumber: r.sceneNumber,
              assetType: "audio",
              publicUrl: uploaded,
              filePath: r.filePath,
              mimeType: "audio/mpeg",
            });
          } catch (e) {
            console.error("[voice upload]", e instanceof Error ? e.message : e);
          }
        })
    );

    await updateProjectStatus(
      parsed.data.project_id,
      failed.length === 0 ? "voice_done" : failed.length < results.length ? "voice_done" : "failed",
      failed.length > 0 ? `Falló en ${failed.length} escenas` : undefined
    );

    return NextResponse.json({
      success: true,
      total: results.length,
      succeeded: succeeded.length,
      failed: failed.length,
      mock: results[0]?.mock ?? false,
      voice: results[0]?.voiceName,
      scenes: results.map((r) => ({
        scene_number: r.sceneNumber,
        success: r.success,
        file_path: r.filePath,
        error: r.error,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /voice]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET() {
  const hasKey = Boolean(process.env.ELEVENLABS_API_KEY);
  const isMock = process.env.FORCE_MOCK_VOICE === "true" || !hasKey;
  return NextResponse.json({ status: "ok", mock_mode: isMock, has_key: hasKey });
}
