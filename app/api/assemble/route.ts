import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail, updateProjectStatus, upsertAsset, getUserById } from "@/lib/db/repository";
import { submitAssembly, checkAssembly } from "@/services/shotstack/assembler";
import { generateStorySfx } from "@/services/elevenlabs/sfx-generator";
import { generateStoryMusic } from "@/services/elevenlabs/music-generator";
import { initDb } from "@/lib/db";
import { z } from "zod";
import { sendVideoReadyEmail } from "@/lib/email/resend";
import { captureServer } from "@/lib/analytics/posthog";
import { resolveProjectTier } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 60;

const Schema = z.object({
  project_id: z.string().uuid(),
  action: z.enum(["submit", "check"]).default("submit"),
  render_id: z.string().optional(),
  add_subtitles: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    await initDb();

    // ── CHECK status of existing render ──────────────────────────────────────
    if (parsed.data.action === "check" && parsed.data.render_id) {
      const status = await checkAssembly(parsed.data.render_id);

      if (status.status === "done" && status.url) {
        await upsertAsset({
          projectId: parsed.data.project_id,
          assetType: "final_video",
          publicUrl: status.url,
          mimeType: "video/mp4",
        });
        await updateProjectStatus(parsed.data.project_id, "ready");

        captureServer(session.user.id, "video_ready", { project_id: parsed.data.project_id });

        // Send "video ready" email — fire and forget, never block the response
        const detail = await getProjectDetail(parsed.data.project_id, session.user.id).catch(() => null);
        if (detail && session.user.email) {
          sendVideoReadyEmail({
            to: session.user.email,
            userName: session.user.name ?? "Creador",
            projectTitle: detail.project.title,
            projectId: parsed.data.project_id,
            videoUrl: status.url,
          }).catch((err) => console.error("[email] video-ready failed:", err));
        }
      }

      return NextResponse.json({ success: true, ...status });
    }

    // ── SUBMIT new assembly ───────────────────────────────────────────────────
    const detail = await getProjectDetail(parsed.data.project_id, session.user.id);
    if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

    // Effective tier = project's choice, clamped to the owner's plan.
    const user = await getUserById(session.user.id).catch(() => null);
    const tier = resolveProjectTier(detail.project.animation_tier, user?.plan ?? "free");
    const videoAssets = detail.assets?.filter((a) => a.asset_type === "video") ?? [];
    const imageAssets = detail.assets?.filter((a) => a.asset_type === "image") ?? [];

    // Ken Burns tier animates the static images (no Kling clips needed).
    // Cinematic tier needs the Kling video clips. Fall back to images if no clips exist.
    const useImages = tier === "kenburns" || videoAssets.length === 0;

    if (useImages && !imageAssets.length) {
      return NextResponse.json({ error: "Genera las imágenes primero" }, { status: 422 });
    }
    if (!useImages && !videoAssets.length) {
      return NextResponse.json({ error: "Genera los videos animados primero" }, { status: 422 });
    }

    const audioAssets = detail.assets?.filter((a) => a.asset_type === "audio") ?? [];

    // Match audio + image to scene by scene_id (more robust than positional index)
    const audioBySceneId = new Map(audioAssets.filter((a) => a.scene_id).map((a) => [a.scene_id, a]));
    const imageBySceneId = new Map(imageAssets.filter((a) => a.scene_id).map((a) => [a.scene_id, a]));

    // Ken Burns has no clip ceiling; talking clips run the full narration length;
    // Seedance clips cap at ~10s.
    const maxDur = useImages ? 60 : tier === "talking" ? 30 : 10;

    // When assets carry scene_id (the normal case) we match STRICTLY by scene_id.
    // Positional fallback (assets[idx]) is only safe for legacy assets without a
    // scene_id — otherwise a single missing asset shifts everything and makes one
    // scene borrow another's audio (the narration "repeats"). Bug fix.
    const audioHasSceneIds = audioAssets.some((a) => a.scene_id);
    const imageHasSceneIds = imageAssets.some((a) => a.scene_id);

    // Build scene list — prefer real audio duration + word timings when available
    const scenes = detail.scenes.map((scene, idx) => {
      const video = videoAssets[idx] ?? videoAssets[0];
      const image = imageHasSceneIds ? imageBySceneId.get(scene.id) : imageAssets[idx];
      const audio = audioHasSceneIds ? audioBySceneId.get(scene.id) : audioAssets[idx];

      // Parse word timings + real audio length saved by the voice step
      let wordTimings: Array<{ word: string; start: number; end: number }> | undefined;
      let audioDuration: number | undefined;
      if (audio?.metadata) {
        try {
          const m = JSON.parse(audio.metadata) as {
            duration?: number;
            words?: Array<{ word: string; start: number; end: number }>;
          };
          if (Array.isArray(m.words) && m.words.length) wordTimings = m.words;
          if (typeof m.duration === "number" && m.duration > 0) audioDuration = m.duration;
        } catch { /* ignore malformed metadata */ }
      }

      return {
        sceneNumber: scene.scene_number,
        videoUrl: useImages ? undefined : (video?.public_url ?? ""),
        imageUrl: useImages ? (image?.public_url ?? "") : undefined,
        audioUrl: audio?.public_url ?? undefined,
        narrationText: scene.narration_text,
        // Real spoken length keeps clip + voice + subtitles all in sync.
        // +0.35s tail so the clip doesn't cut the instant the voice ends.
        durationSeconds: audioDuration ? Math.min(maxDur, Math.max(2, audioDuration + 0.35)) : (scene.duration_seconds || 5),
        wordTimings,
      };
    });

    // Free-tier videos carry a watermark (viral marketing + upgrade nudge).
    // Any paid plan removes it.
    const watermark = (user?.plan ?? "free") === "free";

    // Auto-generate SFX (whoosh + niche-flavoured impact) via ElevenLabs unless
    // disabled. Cached per process; never blocks the render if it fails.
    let sfxWhooshUrl: string | null = null;
    let sfxImpactUrl: string | null = null;
    if ((process.env.AUTO_SFX ?? "on").toLowerCase() !== "off") {
      try {
        const sfx = await generateStorySfx(detail.project.niche);
        sfxWhooshUrl = sfx.whoosh;
        sfxImpactUrl = sfx.impact;
      } catch { /* render continues without SFX */ }
    }

    // Auto-generate an ORIGINAL background score (ElevenLabs Music) matching the
    // niche + the story's music_mood. Off → AUTO_MUSIC=off. Never blocks the render.
    let musicUrl: string | null = null;
    try {
      const totalDur = scenes.reduce((n, s) => n + (s.durationSeconds ?? 0), 0) || 30;
      musicUrl = await generateStoryMusic(detail.project.niche, detail.story?.music_mood ?? null, totalDur);
    } catch { /* render continues without music */ }

    const result = await submitAssembly({
      scenes,
      title: detail.project.title,
      addSubtitles: parsed.data.add_subtitles,
      niche: detail.project.niche,
      musicMood: detail.story?.music_mood ?? null,
      musicUrl,
      cta: detail.story?.cta ?? null,
      watermark,
      sfxWhooshUrl,
      sfxImpactUrl,
      clipsHaveAudio: tier === "talking",
    });

    return NextResponse.json({
      success: true,
      render_id: result.renderId,
      status: result.status,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /assemble]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const hasKey = Boolean(process.env.CREATOMATE_API_KEY);
  return NextResponse.json({ status: "ok", provider: "shotstack", has_key: hasKey });
}
