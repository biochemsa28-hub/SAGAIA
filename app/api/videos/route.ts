import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUserId } from "@/lib/internal-auth";
import { getProjectDetail, updateProjectStatus, upsertAsset, getUserById, bumpDailyVideoCount, createApiLog } from "@/lib/db/repository";
import { submitVideoJobs, checkVideoJob } from "@/services/fal/video-generator";
import { submitLipsyncJobs, checkLipsyncJob } from "@/services/fal/lipsync-generator";
import { submitVideoLipsyncJobs, checkVideoLipsyncJob } from "@/services/fal/video-lipsync-generator";
import { initDb } from "@/lib/db";
import { generateShotSheet } from "@/services/fal/shot-grid";
import { planNarrativeBlocks, blockPanelFramings, type BlockScene } from "@/services/video/narrative-blocks";
import { buildDialogueDirection, transcribeClip } from "@/services/video/native-audio";
import { trimClipHead } from "@/services/ffmpeg/trim";
import { resolveProjectTier, PRO_PIPELINE, MAX_DAILY_VIDEOS, heroSceneNumbers, HOOK_BLOCK_ON, HOOK_BLOCK_SECONDS, HOOK_BLOCK_TRIM_SECONDS, SHOT_FRAMINGS, NARRATIVE_BLOCKS_ON, BLOCK_TARGET_SECONDS, NATIVE_AUDIO_ON, NATIVE_AUDIO_LANGUAGE, MAX_VIDEO_SECONDS, videoSecondsFor, maxBlocksFor } from "@/lib/config";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const SubmitSchema = z.object({
  project_id: z.string().uuid(),
  // "lipsync_submit" = PRO pipeline stage 2: video lip-sync over the Seedance clips.
  action: z.enum(["submit", "collect", "lipsync_submit"]).default("submit"),
  // PRO pipeline stage for collect ("motion" = Seedance, "lipsync" = video lip-sync).
  stage: z.enum(["motion", "lipsync"]).optional(),
  scene_number: z.number().int().positive().optional(), // regenerate a single scene
  jobs: z.array(z.object({
    scene_number: z.number(),
    request_id: z.string(),
  })).optional(),
  // For lipsync_submit: the completed Seedance motion clips to lip-sync.
  motion: z.array(z.object({
    scene_number: z.number(),
    video_url: z.string(),
  })).optional(),
});

// POST /api/videos — submit jobs OR collect results
export async function POST(req: NextRequest) {
  try {
    // Either a browser session, or the job worker carrying the internal secret —
    // production has to keep running after the user closes the tab.
    const body: unknown = await req.json().catch(() => null);
    const userId = await resolveRequestUserId(req, body);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = SubmitSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    await initDb();

    // ── ACTION: submit ────────────────────────────────────────────────────────
    if (parsed.data.action === "submit") {
      const detail = await getProjectDetail(parsed.data.project_id, userId);
      if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

      // Effective tier = project's choice, clamped to the owner's plan.
      const user = await getUserById(userId).catch(() => null);
      const tier = resolveProjectTier(detail.project.animation_tier, user?.plan ?? "free");
      if (!detail.scenes?.length) return NextResponse.json({ error: "Sin escenas" }, { status: 422 });

      // HYBRID: on the Ken Burns tier we normally spend nothing on a video model.
      // But when ANIMATE_HERO_SCENES > 0 we animate just the hero beats (the hook,
      // and optionally the closer) with real video and leave everything else free.
      const heroScenes = tier === "kenburns" ? heroSceneNumbers(detail.scenes.length) : [];
      if (tier === "kenburns" && heroScenes.length === 0) {
        return NextResponse.json({ success: true, action: "skipped", reason: "kenburns_tier", total: 0, jobs: [] });
      }

      // ── SPEND KILL-SWITCH ──────────────────────────────────────────────────
      // Cap total video productions per day so a bug/retry-loop/abuse can't drain
      // the fal balance. Only counts the initial submit (not single-scene regen or
      // the PRO lip-sync stage). Blocks BEFORE any paid fal call.
      if (!parsed.data.scene_number) {
        const todayCount = await bumpDailyVideoCount();
        if (todayCount > MAX_DAILY_VIDEOS) {
          console.warn(`[videos] daily cap hit: ${todayCount}/${MAX_DAILY_VIDEOS}`);
          return NextResponse.json(
            { error: "Límite diario de producción alcanzado (protección de gasto). Intenta mañana o sube MAX_DAILY_VIDEOS." },
            { status: 429 }
          );
        }
      }

      const imageAssets = detail.assets?.filter((a) => a.asset_type === "image") ?? [];
      if (!imageAssets.length) {
        return NextResponse.json({ error: "Genera las imágenes primero" }, { status: 422 });
      }

      // Map scene.id -> image asset (robust) with positional fallback (legacy)
      const imageBySceneId = new Map(
        imageAssets.filter((a) => a.scene_id).map((a) => [a.scene_id, a])
      );

      // ── TALKING tier ──────────────────────────────────────────────────────────
      if (tier === "talking") {
        const audioAssets = detail.assets?.filter((a) => a.asset_type === "audio") ?? [];
        if (!audioAssets.length) {
          return NextResponse.json({ error: "Genera la voz primero (lip-sync necesita el audio)" }, { status: 422 });
        }
        const audioBySceneId = new Map(audioAssets.filter((a) => a.scene_id).map((a) => [a.scene_id, a]));
        const sourceScenesT = parsed.data.scene_number
          ? detail.scenes.filter((s) => s.scene_number === parsed.data.scene_number)
          : detail.scenes;

        // ── PRO pipeline: stage 1 = Seedance cinematic motion on the scene image.
        // Stage 2 (video lip-sync) runs via the "lipsync_submit" action once these
        // motion clips finish — so the scene has real motion AND a synced mouth.
        if (PRO_PIPELINE) {
          // Match the clip length to the real voice duration so motion + lip-sync
          // stay in sync (fall back to the scene's planned duration).
          const audioDur = (sceneId: string): number | undefined => {
            const meta = audioBySceneId.get(sceneId)?.metadata;
            if (!meta) return undefined;
            try { const m = JSON.parse(meta) as { duration?: number }; return typeof m.duration === "number" ? m.duration : undefined; } catch { return undefined; }
          };
          const motionScenes = sourceScenesT
            .map((scene, idx) => ({
              scene_number: scene.scene_number,
              animation_prompt: scene.animation_prompt ?? "subtle cinematic camera movement, natural motion",
              image_url: imageBySceneId.get(scene.id)?.public_url ?? imageAssets[idx]?.public_url ?? "",
              duration_seconds: Math.max(scene.duration_seconds ?? 5, audioDur(scene.id) ?? 0),
            }))
            .filter((s) => s.image_url);
          const motionJobs = await submitVideoJobs({ scenes: motionScenes });
          return NextResponse.json({
            success: true,
            action: "submitted",
            tier: "talking",
            pipeline: "pro",
            stage: "motion",
            total: motionJobs.length,
            jobs: motionJobs.map((j) => ({ scene_number: j.sceneNumber, request_id: j.requestId, status: j.status, error: j.error })),
          });
        }

        // ── Standard: image + scene audio → talking clip (VEED Fabric).
        const lipScenes = sourceScenesT
          .map((scene, idx) => ({
            scene_number: scene.scene_number,
            image_url: imageBySceneId.get(scene.id)?.public_url ?? imageAssets[idx]?.public_url ?? "",
            audio_url: audioBySceneId.get(scene.id)?.public_url ?? "",
          }))
          .filter((s) => s.image_url && s.audio_url);
        const lipJobs = await submitLipsyncJobs({ scenes: lipScenes });
        return NextResponse.json({
          success: true,
          action: "submitted",
          tier: "talking",
          total: lipJobs.length,
          jobs: lipJobs.map((j) => ({ scene_number: j.sceneNumber, request_id: j.requestId, status: j.status, error: j.error })),
        });
      }

      // Map scene.id -> real audio duration (so Kling picks 10s when the voice
      // is longer than 5s, keeping clip + narration in sync).
      const audioDurBySceneId = new Map<string, number>();
      for (const a of detail.assets ?? []) {
        if (a.asset_type !== "audio" || !a.scene_id || !a.metadata) continue;
        try {
          const m = JSON.parse(a.metadata) as { duration?: number };
          if (typeof m.duration === "number" && m.duration > 0) audioDurBySceneId.set(a.scene_id, m.duration);
        } catch { /* ignore */ }
      }

      // ── NARRATIVE BLOCKS ───────────────────────────────────────────────────
      // One clip per GROUP of consecutive scenes. The plan is derived from the
      // scenes + their measured audio, so the collect step and the assembler can
      // recompute the identical grouping without threading state through the queue.
      const blockScenes: BlockScene[] = detail.scenes.map((sc) => ({
        scene_number: sc.scene_number,
        image_url: imageBySceneId.get(sc.id)?.public_url ?? null,
        image_prompt: sc.image_prompt,
        narration_text: sc.narration_text,
        audio_seconds: audioDurBySceneId.get(sc.id) ?? null,
        duration_seconds: sc.duration_seconds,
        // Sin esto el planificador no puede saber cuándo cambia la voz, y agrupa
        // parlamentos de dos personajes en un mismo clip.
        speaker: sc.speaker,
      }));

      if (NARRATIVE_BLOCKS_ON && !parsed.data.scene_number) {
        const planned = planNarrativeBlocks(blockScenes, BLOCK_TARGET_SECONDS);
        // Enforce the ceiling HERE, at the only place that spends money. A script
        // that came back longer than asked would otherwise bill a clip per extra
        // block — the single largest way this pipeline can overspend.
        // El planificador ya no filtra por imagen — agrupa todas las escenas para
        // que submit, collect y montaje coincidan. Pero ANIMAR sigue necesitando
        // un cuadro de partida, así que un bloque sin ninguna imagen se descarta
        // acá, en voz alta: es una generación que falló, no un bloque legítimo.
        const conImagen = planned.filter((b) => b.referenceImageUrl);
        if (conImagen.length < planned.length) {
          const perdidos = planned.filter((b) => !b.referenceImageUrl).map((b) => b.leadScene);
          console.warn(`[blocks] ${planned.length - conImagen.length} bloque(s) sin imagen, no se animan (escenas ${perdidos.join(", ")})`);
        }
        // El tope sale de la duración que el usuario ELIGIÓ, no de una variable
        // global: pedir 30s y pedir 60s tienen que producir cosas distintas.
        const topeSegundos = videoSecondsFor(detail.project.duration_target);
        const blocks = conImagen.slice(0, maxBlocksFor(detail.project.duration_target));
        if (conImagen.length > blocks.length) {
          console.warn(
            `[blocks] recortado a ${blocks.length} bloques (elegiste ${topeSegundos}s) — el guion pedía ${conImagen.length}. ` +
            "Lo que no entra debería ser la Parte 2, no una historia cortada: si pasa seguido, el guion se está pasando del presupuesto.",
          );
        }
        console.log(`[blocks] ${detail.scenes.length} escenas → ${blocks.length} bloques (${blocks.reduce((n, b) => n + b.scenes.length, 0)} escenas cubiertas)`);

        // Un bloque que pide más segundos de los que un clip puede durar termina
        // SIEMPRE en cuadro congelado o en bucle: no hay arreglo en el montaje,
        // porque el video que falta nunca se generó. Solo puede pasar cuando una
        // escena sola ya excede el máximo, y eso es un problema del guion — así que
        // se nombra la escena, que es lo accionable.
        const desbordados = blocks.filter((b) => b.overflow);
        if (desbordados.length) {
          console.warn(
            `[blocks] ${desbordados.length} bloque(s) con más diálogo del que entra en un clip de ${BLOCK_TARGET_SECONDS}s: ` +
            desbordados.map((b) => `escena ${b.leadScene} (${b.seconds.toFixed(1)}s)`).join(", ") +
            " — acortá esos parlamentos o repartilos en más escenas",
          );
        }

        const imgByScene = new Map(
          detail.scenes.map((sc) => [sc.scene_number, imageBySceneId.get(sc.id)?.public_url]),
        );
        const sceneByNumber = new Map(detail.scenes.map((sc) => [sc.scene_number, sc]));

        let blockJobs;
        if (NATIVE_AUDIO_ON) {
          // ── NATIVE AUDIO PATH ────────────────────────────────────────────────
          // No storyboard sheet. The clip runs from this block's first scene image
          // to the NEXT block's first image (end_image_url), so consecutive blocks
          // meet on the same frame and the video reads as one continuous take
          // rather than seven clips butted together. The dialogue is quoted in the
          // prompt, which is what makes the characters say the script instead of
          // improvising — verified against a transcript of the generated audio.
          blockJobs = blocks.map((block, bi) => {
            const nextBlock = blocks[bi + 1];
            const endImage = nextBlock ? imgByScene.get(nextBlock.leadScene) : imgByScene.get(block.scenes[block.scenes.length - 1]!);
            const lines = block.scenes
              .map((n) => sceneByNumber.get(n))
              .filter(Boolean)
              .map((sc) => ({ speaker: sc!.speaker, text: sc!.narration_text ?? "" }));
            return {
              scene_number: block.leadScene,
              image_url: imgByScene.get(block.leadScene) ?? block.referenceImageUrl,
              end_image_url: endImage && endImage !== imgByScene.get(block.leadScene) ? endImage : undefined,
              animation_prompt:
                "Cinematic scene with natural camera movement and cuts between shots, consistent characters and lighting." +
                buildDialogueDirection(lines),
              duration_seconds: Math.min(HOOK_BLOCK_SECONDS, Math.max(4, Math.ceil(block.seconds + 1))),
              generate_audio: true,
            };
          });
        } else {
          // Sheets in parallel: waiting for each clip to chain off the previous one
          // would multiply wall-clock by the block count.
          const prepared = await Promise.all(blocks.map(async (b) => {
            const sheet = await generateShotSheet({
              basePrompt: b.beats[0] ?? "",
              primaryImageUrl: b.referenceImageUrl,
              framings: blockPanelFramings(b),
              niche: detail.project.niche,
              visualStyle: detail.project.visual_style,
            }).catch(() => null);
            return { block: b, sheet };
          }));
          blockJobs = prepared.map(({ block, sheet }) => ({
            scene_number: block.leadScene,
            image_url: sheet ?? block.referenceImageUrl,
            end_image_url: undefined as string | undefined,
            animation_prompt: sheet
              ? "Play this storyboard as a continuous cinematic sequence. Cut between the four panels " +
                "in order: top-left, then top-right, then bottom-left, then bottom-right. Each panel is a " +
                "separate camera setup shown FULL FRAME, not a grid. Hard cuts between shots."
              : "cinematic camera movement, smooth motion",
            duration_seconds: HOOK_BLOCK_SECONDS,
            generate_audio: false,
          }));
        }

        const jobs = await submitVideoJobs({ scenes: blockJobs });
        return NextResponse.json({
          success: true,
          action: "submitted",
          mode: "blocks",
          total: jobs.length,
          jobs: jobs.map((j) => ({ scene_number: j.sceneNumber, request_id: j.requestId, status: j.status, error: j.error })),
        });
      }

      // Single-scene regeneration: only submit the requested scene.
      // Hybrid mode: only the hero scenes get paid animation.
      const sourceScenes = parsed.data.scene_number
        ? detail.scenes.filter((s) => s.scene_number === parsed.data.scene_number)
        : heroScenes.length
          ? detail.scenes.filter((s) => heroScenes.includes(s.scene_number))
          : detail.scenes;

      const scenes = sourceScenes
        .map((scene, idx) => {
          const matched = imageBySceneId.get(scene.id)?.public_url;
          const fallback = imageAssets[idx]?.public_url ?? imageAssets[0]?.public_url ?? "";
          const realAudio = audioDurBySceneId.get(scene.id);
          const effectiveDur = Math.max(scene.duration_seconds ?? 5, realAudio ?? 0);
          return {
            scene_number: scene.scene_number,
            animation_prompt: scene.animation_prompt ?? "cinematic camera movement, smooth motion",
            image_url: matched ?? fallback,
            duration_seconds: effectiveDur,
          };
        })
        .filter((s) => s.image_url);

      // ── TECHO DE GASTO ─────────────────────────────────────────────────────
      // La rama de bloques recorta por MAX_BLOCKS_PER_VIDEO; ésta no tenía NADA.
      // Con NARRATIVE_BLOCKS apagado se factura un clip por escena sin límite, así
      // que un guion que vuelve con 20 escenas cuesta 20 clips — la forma más
      // grande de sobregasto que tiene el pipeline, y la única rama donde el tope
      // de 60s no llegaba a aplicarse. Se corta por segundos acumulados, no por
      // cantidad, porque lo que se vende es duración.
      let acumulado = 0;
      const dentroDelTope = scenes.filter((s) => {
        if (acumulado >= MAX_VIDEO_SECONDS) return false;
        acumulado += s.duration_seconds ?? 5;
        return true;
      });
      if (dentroDelTope.length < scenes.length) {
        console.warn(`[escenas] recortado a ${dentroDelTope.length} de ${scenes.length} clips (tope ${MAX_VIDEO_SECONDS}s)`);
      }
      scenes.length = 0;
      scenes.push(...dentroDelTope);

      // ── HOOK BLOCK ─────────────────────────────────────────────────────────
      // For the hero beat, swap the single still for a 2x2 storyboard sheet and
      // ask the model to PLAY it: one call yields three real camera setups with
      // motion instead of one held frame. Any failure leaves the scene exactly as
      // it was — a normal animated still — so this can never make things worse.
      if (HOOK_BLOCK_ON && heroScenes.length) {
        await Promise.all(scenes.map(async (sc) => {
          if (!heroScenes.includes(sc.scene_number)) return;
          const scene = detail.scenes.find((x) => x.scene_number === sc.scene_number);
          try {
            // Reuse the sheet the images step already paid for on this same scene.
            // Without this the hero scene buys the identical sheet twice — once to
            // slice into shots, once to hand to the video model.
            let sheet: string | null = null;
            const imgAsset = scene ? imageBySceneId.get(scene.id) : undefined;
            if (imgAsset?.metadata) {
              try {
                const m = JSON.parse(imgAsset.metadata) as { sheet?: string };
                if (m.sheet) { sheet = m.sheet; console.log(`[hook-block] escena ${sc.scene_number}: hoja reutilizada`); }
              } catch { /* metadata vieja sin hoja */ }
            }
            sheet = sheet ?? await generateShotSheet({
              basePrompt: scene?.image_prompt ?? sc.animation_prompt,
              primaryImageUrl: sc.image_url,
              framings: SHOT_FRAMINGS.slice(1, 4),
              niche: detail.project.niche,
              visualStyle: detail.project.visual_style,
            });
            if (!sheet) return;
            sc.image_url = sheet;
            sc.animation_prompt =
              "Play this storyboard as a continuous cinematic sequence. Cut between the four panels " +
              "in order: top-left, then top-right, then bottom-left, then bottom-right. Each panel is a " +
              "separate camera setup shown FULL FRAME, not a grid. Hard cuts between shots. " +
              "Natural motion within each shot.";
            sc.duration_seconds = HOOK_BLOCK_SECONDS;
            console.log(`[hook-block] escena ${sc.scene_number}: storyboard → clip multishot`);
          } catch (e) {
            console.error("[hook-block]", e instanceof Error ? e.message.slice(0, 120) : e);
          }
        }));
      }

      const jobs = await submitVideoJobs({ scenes });

      return NextResponse.json({
        success: true,
        action: "submitted",
        total: jobs.length,
        jobs: jobs.map((j) => ({
          scene_number: j.sceneNumber,
          request_id: j.requestId,
          status: j.status,
          error: j.error,
        })),
      });
    }

    // ── ACTION: lipsync_submit (PRO pipeline stage 2) ──────────────────────────
    // Takes the finished Seedance motion clips + each scene's audio and applies
    // video lip-sync (sync.so) → the final talking clip WITH real motion.
    if (parsed.data.action === "lipsync_submit" && parsed.data.motion?.length) {
      const lsDetail = await getProjectDetail(parsed.data.project_id, userId);
      if (!lsDetail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
      const audioBySceneId = new Map(
        (lsDetail.assets ?? []).filter((a) => a.asset_type === "audio" && a.scene_id).map((a) => [a.scene_id, a])
      );
      const sceneAudio = new Map<number, string>();
      for (const s of lsDetail.scenes ?? []) {
        const url = audioBySceneId.get(s.id)?.public_url;
        if (url) sceneAudio.set(s.scene_number, url);
      }
      const lsScenes = parsed.data.motion
        .map((m) => ({ scene_number: m.scene_number, video_url: m.video_url, audio_url: sceneAudio.get(m.scene_number) ?? "" }))
        .filter((s) => s.video_url && s.audio_url);
      const lsJobs = await submitVideoLipsyncJobs({ scenes: lsScenes });
      return NextResponse.json({
        success: true,
        action: "submitted",
        pipeline: "pro",
        stage: "lipsync",
        total: lsJobs.length,
        jobs: lsJobs.map((j) => ({ scene_number: j.sceneNumber, request_id: j.requestId, status: j.status, error: j.error })),
      });
    }

    // ── ACTION: collect ───────────────────────────────────────────────────────
    if (parsed.data.action === "collect" && parsed.data.jobs?.length) {
      // Stage-aware checker: PRO motion → Seedance; PRO lipsync → video lip-sync;
      // otherwise talking → VEED image lip-sync; cinematic → Seedance.
      const collectDetail = await getProjectDetail(parsed.data.project_id, userId);
      const collectUser = await getUserById(userId).catch(() => null);
      const collectTier = resolveProjectTier(collectDetail?.project.animation_tier, collectUser?.plan ?? "free");
      const stage = parsed.data.stage;
      const checkJob = stage === "motion" ? checkVideoJob
        : stage === "lipsync" ? checkVideoLipsyncJob
        : collectTier === "talking" ? checkLipsyncJob : checkVideoJob;
      const results = await Promise.all(
        parsed.data.jobs.map(async (job) => {
          const status = await checkJob(job.request_id);
          return { scene_number: job.scene_number, request_id: job.request_id, ...status };
        })
      );

      // Stage "motion" clips are INTERMEDIATE (they still need lip-sync) — don't
      // save them as the scene's final video asset; just hand the URLs back.
      const saveAsset = stage !== "motion";
      const completed = saveAsset ? results.filter((r) => r.status === "completed" && r.url) : [];
      const { rehostToR2 } = await import("@/services/storage");
      await Promise.all(completed.map(async (r) => {
        try {
          // NOT downloaded separately any more: re-hosting already pulls the file,
          // so downloadVideo was a second full transfer of the same clip for a
          // filePath nothing reads on the R2 path.
          const filePath = undefined as string | undefined;
          // fal.media clip URLs are TEMPORARY → re-host to durable R2 so the paid
          // clip never expires and always shows up in the app.
          // A hook-block clip opens on the storyboard grid for ~2s before the
          // first real shot. Cut that head off locally (free) BEFORE it becomes
          // the durable asset — it sits exactly where retention is decided.
          let durableUrl: string;
          // Recompute the same grouping the submit step used — it is a pure
          // function of the scenes and their audio, so both sides agree without
          // any state travelling through the queue.
          let blockScenes: number[] | undefined;
          if (NARRATIVE_BLOCKS_ON && collectDetail?.scenes?.length) {
            const audioDur = new Map<string, number>();
            for (const a of collectDetail.assets ?? []) {
              if (a.asset_type !== "audio" || !a.scene_id || !a.metadata) continue;
              try {
                const m = JSON.parse(a.metadata) as { duration?: number };
                if (typeof m.duration === "number" && m.duration > 0) audioDur.set(a.scene_id, m.duration);
              } catch { /* ignore */ }
            }
            const imgBy = new Map(
              (collectDetail.assets ?? []).filter((a) => a.asset_type === "image" && a.scene_id).map((a) => [a.scene_id, a.public_url]),
            );
            const plan = planNarrativeBlocks(
              collectDetail.scenes.map((sc) => ({
                scene_number: sc.scene_number,
                image_url: imgBy.get(sc.id) ?? null,
                image_prompt: sc.image_prompt,
                narration_text: sc.narration_text,
                audio_seconds: audioDur.get(sc.id) ?? null,
                duration_seconds: sc.duration_seconds,
                speaker: sc.speaker,
              })),
              BLOCK_TARGET_SECONDS,
            );
            blockScenes = plan.find((b) => b.leadScene === r.scene_number)?.scenes;
          }

          // NEVER trim in native mode: there is no storyboard head to remove, so
          // the 5s cut would land on the opening dialogue and delete it. The trim
          // only exists for the sheet-based path.
          const isHookBlock = !NATIVE_AUDIO_ON && (HOOK_BLOCK_ON || NARRATIVE_BLOCKS_ON)
            && (blockScenes ? true : heroSceneNumbers(collectDetail?.scenes?.length ?? 0).includes(r.scene_number));
          const trimmed = isHookBlock ? await trimClipHead(r.url!, HOOK_BLOCK_TRIM_SECONDS) : null;
          if (trimmed) {
            const { uploadBuffer } = await import("@/services/storage");
            durableUrl = (await uploadBuffer({ buffer: trimmed, ext: "mp4", contentType: "video/mp4", folder: "clips" })).url;
            console.log(`[hook-block] escena ${r.scene_number}: recortados ${HOOK_BLOCK_TRIM_SECONDS}s de grilla`);
          } else {
            durableUrl = await rehostToR2(r.url!, "clips", "mp4", "video/mp4");
          }
          // Transcribe BEFORE saving so the words travel with the asset. A failure
          // here costs captions, never the video.
          const transcript = NATIVE_AUDIO_ON
            ? await transcribeClip(durableUrl, NATIVE_AUDIO_LANGUAGE).catch(() => null)
            : null;
          if (transcript) {
            console.log(`[nativo] escena ${r.scene_number}: "${transcript.text.slice(0, 70)}" (${transcript.words.length} palabras)`);
          }

          await upsertAsset({
            projectId: parsed.data.project_id,
            sceneNumber: r.scene_number,
            assetType: "video",
            publicUrl: durableUrl,
            filePath,
            mimeType: "video/mp4",
            // Everything the assembler needs about this clip: which scenes it
            // covers, and — when the characters speak for themselves — what they
            // actually said, with word timings. The captions describe the take
            // instead of dictating it, which is the only honest way to subtitle
            // audio the model improvised the delivery of.
            metadata: (blockScenes && blockScenes.length > 1) || transcript
              ? JSON.stringify({
                  ...(blockScenes && blockScenes.length > 1 ? { block: blockScenes } : {}),
                  ...(transcript ? { native_audio: true, text: transcript.text, wordTimings: transcript.words } : {}),
                })
              : undefined,
          });
        } catch (e) {
          console.error("[videos collect]", e);
        }
      }));

      // 💰 Log estimated video spend (the most expensive step) per completed clip.
      const doneCount = results.filter((r) => r.status === "completed").length;
      if (doneCount > 0) {
        try {
          const { estimateVideos } = await import("@/lib/costs");
          const isVeo3 = /veo3|veo-3|veo\/3/i.test(process.env.VIDEO_MODEL ?? "");
          const model: "seedance" | "veo3" = isVeo3 ? "veo3" : "seedance";
          const isLipsyncStage = stage === "lipsync";
          const cost = estimateVideos(doneCount, model, isLipsyncStage);
          await createApiLog({
            userId: userId, projectId: parsed.data.project_id,
            provider: "fal", endpoint: "/api/videos", model: isLipsyncStage ? "lipsync" : model,
            costUsd: cost, statusCode: 200,
          });
        } catch { /* never break on logging */ }
      }

      const allDone = results.every((r) => r.status === "completed" || r.status === "failed");
      if (allDone) {
        const anySuccess = results.some((r) => r.status === "completed");
        await updateProjectStatus(parsed.data.project_id, anySuccess ? "ready" : "images_done");
      }

      return NextResponse.json({
        success: true,
        action: "collect",
        all_done: allDone,
        scenes: results,
      });
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /videos]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const hasKey = Boolean(process.env.FAL_API_KEY);
  return NextResponse.json({ status: "ok", provider: process.env.VIDEO_MODEL ?? "seedance-pro", has_key: hasKey });
}
