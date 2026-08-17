import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUserId } from "@/lib/internal-auth";
import { getProjectDetail, updateProjectStatus, upsertAsset, getUserById } from "@/lib/db/repository";
import { submitAssembly, checkAssembly } from "@/services/shotstack/assembler";
import { generateStorySfx, generateSceneSfx } from "@/services/elevenlabs/sfx-generator";
import { generateStoryMusic } from "@/services/elevenlabs/music-generator";
import { initDb } from "@/lib/db";
import { z } from "zod";
import { sendVideoReadyEmail } from "@/lib/email/resend";
import { captureServer } from "@/lib/analytics/posthog";
import { resolveProjectTier } from "@/lib/config";
import { CHARS_PER_SECOND } from "@/services/video/narrative-blocks";

export const runtime = "nodejs";
// A real run of this route took over a minute rendering 6 blocks locally with FFmpeg; the previous ceiling would have killed it
// mid-flight on a serverless host with the fal spend already committed. These are
// sized from measurement, not from a default.
export const maxDuration = 300;

const Schema = z.object({
  project_id: z.string().uuid(),
  action: z.enum(["submit", "check"]).default("submit"),
  render_id: z.string().optional(),
  add_subtitles: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    // Either a browser session, or the job worker carrying the internal secret —
    // production has to keep running after the user closes the tab.
    const body: unknown = await req.json().catch(() => null);
    const userId = await resolveRequestUserId(req, body);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    await initDb();

    // ── CHECK status of existing render ──────────────────────────────────────
    if (parsed.data.action === "check" && parsed.data.render_id) {
      // FFmpeg renders synchronously at submit → already done + saved to R2.
      if (parsed.data.render_id === "ffmpeg-local") {
        const d = await getProjectDetail(parsed.data.project_id, userId).catch(() => null);
        const fv = d?.assets?.find((a) => a.asset_type === "final_video");
        return NextResponse.json({ success: true, status: "done", url: fv?.public_url ?? null });
      }
      const status = await checkAssembly(parsed.data.render_id);

      if (status.status === "done" && status.url) {
        // Re-host the Shotstack output to durable R2 — its S3 URL is TEMPORARY and
        // expires, which is why finished videos "disappeared". Now you own it forever.
        const { rehostToR2 } = await import("@/services/storage");
        const durableUrl = await rehostToR2(status.url, "finals", "mp4", "video/mp4");
        await upsertAsset({
          projectId: parsed.data.project_id,
          assetType: "final_video",
          publicUrl: durableUrl,
          mimeType: "video/mp4",
        });
        await updateProjectStatus(parsed.data.project_id, "ready");

        // 💰 Log the Shotstack render cost.
        try {
          const { COST } = await import("@/lib/costs");
          const { createApiLog } = await import("@/lib/db/repository");
          await createApiLog({
            userId: userId, projectId: parsed.data.project_id,
            provider: "shotstack", endpoint: "/api/assemble", model: "render",
            // The local FFmpeg path costs nothing — logging Shotstack's price for
            // it would inflate every measured video cost, which is what the whole
            // pricing model now hangs on.
            costUsd: (process.env.RENDER_ENGINE ?? "").toLowerCase() === "ffmpeg"
              ? COST.ffmpeg_render()
              : COST.shotstack_render(),
            statusCode: 200,
          });
        } catch { /* never break on logging */ }

        captureServer(userId, "video_ready", { project_id: parsed.data.project_id });

        // Send "video ready" email — fire and forget, never block the response
        const detail = await getProjectDetail(parsed.data.project_id, userId).catch(() => null);
        // Look the address up instead of reading it off the session: when the job
        // worker finishes this there IS no session, and that's precisely the case
        // where the email matters most — the user closed the tab an hour ago.
        const owner = await getUserById(userId).catch(() => null);
        if (detail && owner?.email) {
          sendVideoReadyEmail({
            to: owner.email,
            userName: owner.name ?? "Creador",
            projectTitle: detail.project.title,
            projectId: parsed.data.project_id,
            videoUrl: durableUrl,
          }).catch((err) => console.error("[email] video-ready failed:", err));
        }
        return NextResponse.json({ success: true, ...status, url: durableUrl });
      }

      return NextResponse.json({ success: true, ...status });
    }

    // ── SUBMIT new assembly ───────────────────────────────────────────────────
    const detail = await getProjectDetail(parsed.data.project_id, userId);
    if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

    // Effective tier = project's choice, clamped to the owner's plan.
    const user = await getUserById(userId).catch(() => null);
    const tier = resolveProjectTier(detail.project.animation_tier, user?.plan ?? "free");
    const videoAssets = detail.assets?.filter((a) => a.asset_type === "video") ?? [];
    const imageAssets = detail.assets?.filter((a) => a.asset_type === "image") ?? [];

    // HYBRID-AWARE: decide per SCENE, not for the whole video. A scene uses its real
    // animated clip when one exists, otherwise Ken Burns over its still. That's what
    // lets the hook be animated while the rest stays free.
    const videoBySceneId = new Map(videoAssets.filter((a) => a.scene_id).map((a) => [a.scene_id, a]));
    const hasAnyClip = videoAssets.length > 0;
    // Legacy path (clips for every scene, matched positionally) only when no clip
    // carries a scene_id — otherwise we always match strictly by scene.
    const clipsHaveSceneIds = videoBySceneId.size > 0;
    const useImages = !hasAnyClip;

    if (!imageAssets.length && !hasAnyClip) {
      return NextResponse.json({ error: "Genera las imágenes primero" }, { status: 422 });
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
      // Hybrid: this scene's OWN clip if it has one; positional only for legacy
      // projects whose clips predate scene_id tagging.
      const video = clipsHaveSceneIds ? videoBySceneId.get(scene.id) : (videoAssets[idx] ?? videoAssets[0]);
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

      // Extra camera setups saved by the images step (metadata.shots) — the edit
      // cuts between them inside this scene instead of holding one frame.
      let shots: string[] | undefined;
      if (image?.metadata) {
        try {
          const m = JSON.parse(image.metadata) as { shots?: unknown };
          if (Array.isArray(m.shots) && m.shots.every((u) => typeof u === "string")) {
            shots = m.shots as string[];
          }
        } catch { /* ignore malformed metadata */ }
      }

      // Per-scene choice: real clip when this scene has one, else its still image.
      const clipUrl = video?.public_url || undefined;
      return {
        sceneNumber: scene.scene_number,
        videoUrl: clipUrl,
        imageUrl: clipUrl ? undefined : (image?.public_url ?? ""),
        audioUrl: audio?.public_url ?? undefined,
        narrationText: scene.narration_text,
        location: (scene as { location?: string | null }).location ?? null,
        // Real spoken length keeps clip + voice + subtitles all in sync.
        // +0.35s tail so the clip doesn't cut the instant the voice ends.
        durationSeconds: audioDuration ? Math.min(maxDur, Math.max(2, audioDuration + 0.35)) : (scene.duration_seconds || 5),
        wordTimings,
        emotion: scene.emotion ?? undefined,
        shots,
        // El pico físico del guion: el montaje lo subraya (punch-in, ralentí).
        isPeak: Boolean((scene as { is_peak?: number | boolean }).is_peak),
      };
    });

    // ── COLLAPSE NARRATIVE BLOCKS ────────────────────────────────────────────
    // One clip can cover several scenes. Its asset carries the list; the lead
    // scene absorbs the others' narration (played end to end over the block) and
    // they drop out of the timeline. Without this the block's clip would play
    // once and the scenes it already covers would render AGAIN as stills — the
    // story would stutter and repeat.
    const sceneNumberById = new Map(detail.scenes.map((sc) => [sc.id, sc.scene_number]));
    const blockMembers = new Map<number, number[]>();
    // Clips whose characters speak for themselves: their own track is the audio,
    // and their transcript is the caption source.
    const nativeAudio = new Map<number, { wordTimings?: Array<{ word: string; start: number; end: number }> }>();
    for (const a of videoAssets) {
      if (!a.metadata) continue;
      try {
        const m = JSON.parse(a.metadata) as {
          block?: number[];
          native_audio?: boolean;
          wordTimings?: Array<{ word: string; start: number; end: number }>;
        };
        const lead = sceneNumberById.get(a.scene_id ?? "");
        if (!lead) continue;
        if (Array.isArray(m.block) && m.block.length > 1) blockMembers.set(lead, m.block);
        if (m.native_audio) nativeAudio.set(lead, { wordTimings: m.wordTimings });
      } catch { /* metadata without a block */ }
    }

    const absorbed = new Set<number>();
    for (const [lead, members] of blockMembers) {
      for (const n of members) if (n !== lead) absorbed.add(n);
    }

    // Alcanza con que haya UNA de las dos cosas. Si todos los bloques fueran de una
    // escena, blockMembers queda vacío, este map no corría, y las transcripciones se
    // perdían enteras aunque existieran — el peor caso del bug de abajo.
    const timeline = (blockMembers.size || nativeAudio.size)
      ? scenes
          .filter((sc) => !absorbed.has(sc.sceneNumber))
          .map((sc) => {
            const members = blockMembers.get(sc.sceneNumber);
            if (!members) {
              // UNA ESCENA TAMBIÉN PUEDE TENER TRANSCRIPCIÓN.
              //
              // Un bloque de una sola escena no escribe metadata `block` (eso pide
              // length > 1), así que caía acá y se devolvía sin tocar — tirando los
              // wordTimings que Whisper SÍ había producido. Medido: seis escenas con
              // "[nativo] … (18 palabras)" y el montaje reportando "sin tiempos
              // medidos" en todas, con los subtítulos repartidos a mano y un cartel
              // de dos palabras sostenido quince segundos.
              //
              // El clip ya trae la voz, así que el audioUrl se descarta igual que en
              // el camino de bloques: dejarlo puesto doblaría un narrador encima.
              const solo = nativeAudio.get(sc.sceneNumber);
              return solo
                ? {
                    ...sc,
                    audioUrl: undefined,
                    audioUrls: undefined as string[] | undefined,
                    durationSeconds: undefined,
                    wordTimings: solo.wordTimings ?? sc.wordTimings,
                  }
                : sc;
            }
            const covered = members
              .map((n) => scenes.find((x) => x.sceneNumber === n))
              .filter((x): x is typeof sc => Boolean(x));
            // Word timings shift by however much narration precedes them, or the
            // burned captions of scenes 2..N would all start at zero.
            let offset = 0;
            const merged: Array<{ word: string; start: number; end: number }> = [];
            for (const c of covered) {
              for (const w of c.wordTimings ?? []) {
                merged.push({ word: w.word, start: w.start + offset, end: w.end + offset });
              }
              offset += c.durationSeconds ?? 0;
            }
            const native = nativeAudio.get(sc.sceneNumber);
            if (native) {
              // The clip already carries the performance. Handing the assembler an
              // audioUrl here would dub a narrator back over the characters — the
              // exact thing this pipeline exists to stop.
              return {
                ...sc,
                audioUrl: undefined,
                audioUrls: undefined as string[] | undefined,
                durationSeconds: undefined,        // let the clip's own length rule
                wordTimings: native.wordTimings ?? undefined,
                shots: undefined as string[] | undefined,
              };
            }
            return {
              ...sc,
              audioUrls: covered.map((c) => c.audioUrl).filter((u): u is string => Boolean(u)),
              durationSeconds: covered.reduce((n, c) => n + (c.durationSeconds ?? 0), 0),
              wordTimings: merged.length ? merged : sc.wordTimings,
              // El respaldo de subtítulos tiene que cubrir el bloque ENTERO: un clip
              // que apila cuatro escenas y solo lleva el texto de la primera
              // subtitularía el 25% de lo que se escucha.
              narrationText: covered.map((c) => c.narrationText).filter(Boolean).join(" "),
              // A block already cuts between camera setups inside itself; the
              // still-image shot list would fight it.
              shots: undefined as string[] | undefined,
            };
          })
      : scenes;

    if (blockMembers.size) {
      console.log(
        `[blocks] montaje: ${scenes.length} escenas → ${timeline.length} segmentos` +
        ` · ${nativeAudio.size} con transcripción · ${timeline.filter((s) => s.wordTimings?.length).length} con tiempos aplicados`,
      );
    }

    // Free-tier videos carry a watermark (viral marketing + upgrade nudge).
    // Any paid plan removes it.
    const watermark = (user?.plan ?? "free") === "free";

    // Auto-generate SFX (whoosh + niche-flavoured impact) via ElevenLabs unless
    // disabled. Cached per process; never blocks the render if it fails.
    let sfxWhooshUrl: string | null = null;
    let sfxImpactUrl: string | null = null;
    // El ruido propio de cada escena, indexado por POSICIÓN en la línea de tiempo:
    // los bloques absorben escenas, así que scene_number ya no es correlativo con el
    // orden en que se ven, y usarlo como índice pondría la puerta en otra escena.
    let sceneSfx: Array<{ sceneIndex: number; url: string }> = [];
    if ((process.env.AUTO_SFX ?? "on").toLowerCase() !== "off") {
      try {
        const sfx = await generateStorySfx(detail.project.niche);
        sfxWhooshUrl = sfx.whoosh;
        sfxImpactUrl = sfx.impact;
      } catch { /* render continues without SFX */ }

      try {
        const porNumero = new Map(
          (detail.scenes ?? []).map((sc) => [sc.scene_number, (sc as { sfx_prompt?: string | null }).sfx_prompt]),
        );
        const pedidos = timeline.map((s, i) => ({
          scene_number: i,                                    // índice de línea de tiempo
          sfx_prompt: porNumero.get(s.sceneNumber) ?? null,
        }));
        const generados = await generateSceneSfx(pedidos);
        sceneSfx = generados.map((g) => ({ sceneIndex: g.scene_number, url: g.url }));
      } catch { /* el video se arma igual sin los sonidos de escena */ }
    }

    // Auto-generate an ORIGINAL background score (ElevenLabs Music) matching the
    // niche + the story's music_mood. Off → AUTO_MUSIC=off. Never blocks the render.
    let musicUrl: string | null = null;
    try {
      // La duración NO puede salir solo de durationSeconds: en las escenas de audio
      // nativo viaja sin valor a propósito —manda el clip, no una estimación— así
      // que la suma daba 0 y caía al respaldo de 30. Medido: se pedían 30 segundos
      // de música para un video de 75, y los últimos 22 quedaban casi mudos, con
      // los 7 finales en silencio absoluto. Justo el clímax.
      //
      // Cuando falta el dato se estima desde el texto hablado, con la misma
      // constante que usa el resto del sistema.
      const totalDur = Math.max(
        30,
        timeline.reduce((n, s) => {
          if (s.durationSeconds) return n + s.durationSeconds;
          const chars = (s.narrationText ?? "").trim().length;
          return n + (chars ? chars / CHARS_PER_SECOND : 6);
        }, 0),
      );
      console.log(`[music] pidiendo ${Math.round(totalDur)}s de música`);
      musicUrl = await generateStoryMusic(detail.project.niche, detail.story?.music_mood ?? null, totalDur);
    } catch { /* render continues without music */ }

    // ── RENDER ENGINE: local FFmpeg ($0, no Shotstack) — RENDER_ENGINE=ffmpeg ──
    // Renders synchronously on the server and stores straight to R2. No polling.
    if ((process.env.RENDER_ENGINE ?? "").toLowerCase() === "ffmpeg") {
      const { assembleWithFfmpeg } = await import("@/services/ffmpeg/assembler");
      const ff = await assembleWithFfmpeg({
        scenes: timeline.map((s, i) => ({
          imageUrl: s.imageUrl || undefined,
          videoUrl: s.videoUrl || undefined,
          audioUrl: s.audioUrl,
          audioUrls: (s as { audioUrls?: string[] }).audioUrls,
          durationSeconds: s.durationSeconds,
          wordTimings: parsed.data.add_subtitles ? s.wordTimings : undefined,
          // El texto del guion viaja como respaldo: si Whisper no devolvió tiempos,
          // el ensamblador reparte estas palabras en la duración de la escena antes
          // que dejar el video sin un solo subtítulo.
          narrationText: parsed.data.add_subtitles ? s.narrationText : undefined,
          // Se compara con la escena ANTERIOR de la línea de tiempo, no con el
          // número de escena: los bloques absorben escenas y los números dejan de
          // ser correlativos con el orden en que se ven.
          newLocation: i > 0 && Boolean(s.location) && Boolean(timeline[i - 1]?.location)
            && s.location !== timeline[i - 1]?.location,
          emotion: s.emotion,
          shots: s.shots,
          isPeak: (s as { isPeak?: boolean }).isPeak,
        })),
        musicUrl,
        cta: detail.story?.cta ?? null,
        watermark,
        niche: detail.project.niche,
        sfxWhooshUrl,
        sfxImpactUrl,
        sceneSfx,
      });
      await upsertAsset({
        projectId: parsed.data.project_id,
        assetType: "final_video",
        publicUrl: ff.url,
        mimeType: "video/mp4",
      });
      await updateProjectStatus(parsed.data.project_id, "ready");
      // "done" render_id so the client's check loop resolves immediately.
      return NextResponse.json({ success: true, render_id: "ffmpeg-local", status: "done", url: ff.url, engine: "ffmpeg" });
    }

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
