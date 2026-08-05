import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUserId } from "@/lib/internal-auth";
import { getProjectDetail, updateProjectStatus, upsertAsset } from "@/lib/db/repository";
import { generateProjectVoice } from "@/services/elevenlabs/voice-generator";
import { initDb } from "@/lib/db";
import { z } from "zod";
import { NATIVE_AUDIO_ON } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120; // voice generation takes time

const BodySchema = z.object({
  project_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    // Either a browser session, or the job worker carrying the internal secret —
    // production has to keep running after the user closes the tab.
    const body: unknown = await req.json().catch(() => null);
    const userId = await resolveRequestUserId(req, body);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "project_id requerido" }, { status: 400 });

    await initDb();

    // With native character audio the clips speak for themselves. Short-circuit
    // HERE rather than in each caller: the browser "new story" flow, the project
    // screen and the job worker all hit this route, and one of them forgetting
    // would silently pay ElevenLabs for a track that gets discarded downstream.
    if (NATIVE_AUDIO_ON) {
      return NextResponse.json({
        success: true, skipped: true, reason: "native_audio",
        total: 0, succeeded: 0, failed: 0,
      });
    }
    const detail = await getProjectDetail(parsed.data.project_id, userId);
    if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    if (!detail.story) return NextResponse.json({ error: "El proyecto no tiene historia generada" }, { status: 422 });

    await updateProjectStatus(parsed.data.project_id, "voice_pending");

    // Skip scenes that ALREADY have audio → don't re-spend ElevenLabs on a retry.
    const sceneNumById = new Map(detail.scenes.map((s) => [s.id, s.scene_number]));
    const existingAudio = new Set<number>(
      (detail.assets ?? [])
        .filter((a) => a.asset_type === "audio" && a.public_url && a.scene_id)
        .map((a) => sceneNumById.get(a.scene_id!))
        .filter((n): n is number => typeof n === "number")
    );
    const scenesToVoice = detail.scenes.filter((s) => !existingAudio.has(s.scene_number));

    // All scenes already voiced → nothing to spend.
    if (!scenesToVoice.length) {
      return NextResponse.json({ success: true, total: 0, succeeded: 0, failed: 0, skipped_all: true });
    }

    const results = await generateProjectVoice({
      projectId: parsed.data.project_id,
      niche: detail.project.niche,
      tone: detail.project.tone,
      scenes: scenesToVoice.map((s) => ({
        scene_number: s.scene_number,
        narration_text: s.narration_text,
        emotion: s.emotion,
        voice_profile: s.voice_profile,
        speaker: s.speaker,
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
            // Use File with .mp3 name so fal.ai storage returns a .mp3 URL
            // (Blob upload results in .mpeg extension which Shotstack rejects)
            const file = new File(
              [audioBuffer],
              `scene_${r.sceneNumber}.mp3`,
              { type: "audio/mpeg" }
            );
            const { fal } = await import("@fal-ai/client");
            fal.config({ credentials: process.env.FAL_API_KEY });
            // Retry the upload once — a transient failure here previously left a
            // scene with no audio asset, misaligning the final render.
            let uploaded: string;
            try {
              uploaded = await fal.storage.upload(file) as string;
            } catch {
              await new Promise((res) => setTimeout(res, 1000));
              uploaded = await fal.storage.upload(file) as string;
            }
            // Persist word timings + real audio duration so the assembler can
            // build perfectly-synced karaoke subtitles and match clip length.
            const meta =
              r.wordTimings || r.audioDurationSec
                ? JSON.stringify({ duration: r.audioDurationSec, words: r.wordTimings })
                : undefined;
            await upsertAsset({
              projectId: parsed.data.project_id,
              sceneNumber: r.sceneNumber,
              assetType: "audio",
              publicUrl: uploaded,
              filePath: r.filePath,
              mimeType: "audio/mpeg",
              metadata: meta,
            });
          } catch (e) {
            console.error("[voice upload]", e instanceof Error ? e.message : e);
          }
        })
    );

    // ElevenLabs spend was the one step that never reached api_logs, so every
    // "measured" cost per video was silently missing the voice. With the pricing
    // model now derived from that measurement, an unlogged step is a mispriced plan.
    try {
      const { estimateVoice } = await import("@/lib/costs");
      const { createApiLog } = await import("@/lib/db/repository");
      const chars = scenesToVoice.reduce((n: number, sc) => n + (sc.narration_text?.length ?? 0), 0);
      if (chars > 0) {
        await createApiLog({
          userId, projectId: parsed.data.project_id,
          provider: "elevenlabs", endpoint: "/api/voice", model: "tts",
          costUsd: estimateVoice(chars), statusCode: 200,
        });
      }
    } catch { /* nunca romper la producción por el registro */ }

    await updateProjectStatus(
      parsed.data.project_id,
      failed.length === 0 ? "voice_done" : failed.length < results.length ? "voice_done" : "failed",
      failed.length > 0 ? `Falló en ${failed.length} escenas` : undefined
    );

    return NextResponse.json({
      // Only a real success if at least ONE scene got voiced — otherwise the flow
      // must STOP here (not proceed to lip-sync with no audio).
      success: succeeded.length > 0,
      error: succeeded.length === 0 ? "No se pudo generar la voz de ninguna escena." : undefined,
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
