import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUserId } from "@/lib/internal-auth";
import { getProjectDetail, updateProjectStatus, upsertAsset, getUserById, bumpDailyVideoCount, createApiLog, getProjectCast } from "@/lib/db/repository";
import { submitVideoJobs, checkVideoJob } from "@/services/fal/video-generator";
import { submitLipsyncJobs, checkLipsyncJob } from "@/services/fal/lipsync-generator";
import { submitVideoLipsyncJobs, checkVideoLipsyncJob } from "@/services/fal/video-lipsync-generator";
import { initDb } from "@/lib/db";
import { generateShotSheet } from "@/services/fal/shot-grid";
import { planNarrativeBlocks, blockPanelFramings, CHARS_PER_SECOND, type BlockScene } from "@/services/video/narrative-blocks";
import { buildDialogueDirection, transcribeClip } from "@/services/video/native-audio";
import { trimClipHead } from "@/services/ffmpeg/trim";
import { resolveProjectTier, PRO_PIPELINE, MAX_DAILY_VIDEOS, heroSceneNumbers, HOOK_BLOCK_ON, HOOK_BLOCK_SECONDS, HOOK_BLOCK_TRIM_SECONDS, SHOT_FRAMINGS, NARRATIVE_BLOCKS_ON, BLOCK_TARGET_SECONDS, NATIVE_AUDIO_ON, NATIVE_AUDIO_LANGUAGE, MAX_VIDEO_SECONDS, videoSecondsFor, esBorrador, CLIP_BUDGET } from "@/lib/config";
import { ACCION_CLAVE } from "@/lib/ai/accion-clave";
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
    // El modelo que encoló el clip: reference-to-video y image-to-video tienen
    // colas separadas, y preguntar en la equivocada es un 404.
    model: z.string().optional(),
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

      // ── BORRADOR: acá se corta el 82,5% del costo ──────────────────────────
      // Este endpoint es el ÚNICO que gasta en modelo de video, y los clips son
      // ~$2,89 cada uno contra $0,04 que cuesta el guion. Un borrador sale por
      // este return sin llamar a nadie: el worker ya sabe seguir con "skipped"
      // —era el camino para cuando no hay nada que animar— así que el resto del
      // pipeline (imágenes, voz, montaje Ken Burns) corre sin cambios.
      if (esBorrador(detail.project.quality)) {
        console.log(`[videos] proyecto ${parsed.data.project_id.slice(0, 8)} es BORRADOR — sin animación, $0 en modelo de video`);
        return NextResponse.json({ success: true, action: "skipped", reason: "borrador", total: 0, jobs: [] });
      }

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
        // ── EL TOPE SE CUENTA EN SEGUNDOS, NO EN BLOQUES ───────────────────
        //
        // maxBlocksFor() divide los segundos pedidos entre BLOCK_TARGET_SECONDS
        // (10s), o sea que ASUME que cada bloque dura 10 segundos. No los dura:
        // un bloque son 2 escenas y una escena de diálogo dura ~2,5s, así que un
        // bloque real dura ~5s. Medido en un video de produccion: 6 bloques
        // permitidos × 5s = 25s de animacion en un video de 39s, y los ultimos
        // 14 segundos salieron como imagenes fijas con zoom. El final de la
        // historia —el cliffhanger, lo que decide si comentan— quedaba sin animar
        // justo por esta cuenta.
        //
        // Se acumulan los segundos REALES de cada bloque hasta llegar al tope.
        // Lo que se recorta ahora es lo que de verdad sobra.
        const topeSegundos = videoSecondsFor(detail.project.duration_target);
        const blocks: typeof conImagen = [];
        let segAcumulados = 0;
        for (const b of conImagen) {
          if (segAcumulados >= topeSegundos) break;
          blocks.push(b);
          segAcumulados += b.seconds;
        }
        if (conImagen.length > blocks.length) {
          console.warn(
            `[blocks] recortado a ${blocks.length}/${conImagen.length} bloques: ${segAcumulados.toFixed(1)}s cubren el tope de ${topeSegundos}s. ` +
            "Lo que no entra debería ser la Parte 2, no una historia cortada.",
          );
        } else {
          console.log(`[blocks] ${blocks.length} bloques = ${segAcumulados.toFixed(1)}s animados (tope ${topeSegundos}s)`);
        }
        console.log(`[blocks] ${detail.scenes.length} escenas → ${blocks.length} bloques (${blocks.reduce((n, b) => n + b.scenes.length, 0)} escenas cubiertas)`);

        // ── PRESUPUESTO DE CLIPS ───────────────────────────────────────────
        // Animar es el 82,5% del costo, y no todos los planos lo necesitan: el
        // gancho, el quiebre y el cliffhanger sí; un establecimiento no. Con
        // presupuesto activo se animan solo los bloques que contienen un beat
        // héroe y el resto lo resuelve el montaje con Ken Burns.
        //
        // Con audio nativo NO se aplica: ahí la voz viene dentro del clip, así
        // que un bloque sin clip quedaría mudo. Se dice en voz alta porque es
        // justo el tipo de cosa que se descubre mirando el video terminado.
        let paraAnimar = blocks;
        if (CLIP_BUDGET > 0) {
          if (NATIVE_AUDIO_ON) {
            console.warn(
              `[blocks] CLIP_BUDGET=${CLIP_BUDGET} IGNORADO: con audio nativo la voz vive dentro del clip y ` +
              "los bloques sin animar quedarían mudos. Para usarlo, poné NATIVE_AUDIO=off (la voz pasa a " +
              "ElevenLabs, con una voz distinta por personaje).",
            );
          } else {
            const total = detail.scenes.length;
            const heroes = new Set(heroSceneNumbers(total));
            const elegidos = blocks.filter((b) => b.scenes.some((n) => heroes.has(n)));
            // PRIORIDAD, no orden de aparición. Si sobran candidatos para el
            // presupuesto, recortar por el final descartaba el CLIFFHANGER —el
            // plano que decide si comentan "Parte 2"— para conservar un beat del
            // medio. El gancho abre, el cliffhanger cierra: esos dos primero, y
            // los del medio con lo que quede.
            const rango = (b: typeof blocks[number]) =>
              b.scenes.includes(1) ? 0 : b.scenes.includes(total) ? 1 : 2;
            const ordenados = [...elegidos].sort((a, b) => rango(a) - rango(b) || a.leadScene - b.leadScene);
            // Si los beats héroe no caen en ningún bloque —guiones muy cortos—,
            // se anima al menos el primero: quedarse sin un solo clip convierte
            // el video en una presentación de diapositivas.
            paraAnimar = (ordenados.length ? ordenados : blocks.slice(0, 1))
              .slice(0, CLIP_BUDGET)
              // Se reordena por escena: el encadenado usa el cuadro final de un
              // bloque como inicial del siguiente, y eso solo tiene sentido en el
              // orden en que se ven.
              .sort((a, b) => a.leadScene - b.leadScene);
            const ahorro = blocks.length - paraAnimar.length;
            console.log(
              `[blocks] presupuesto ${CLIP_BUDGET}: se animan ${paraAnimar.length}/${blocks.length} bloques ` +
              `(beats ${[...heroes].join(", ")}) — ${ahorro} bloque(s) van con Ken Burns, ~${(ahorro * 100 / Math.max(1, blocks.length)).toFixed(0)}% menos de gasto en video`,
            );
          }
        }

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

        // ── UN CLIP YA PAGADO NO SE VUELVE A PAGAR ───────────────────────────
        //
        // Esto costó dinero real. El trabajo se reintenta hasta 3 veces —por un
        // despliegue a mitad de producción, un contenedor que se detiene, un
        // fallo de red— y el pipeline se rehacía ENTERO desde cero. La ruta de
        // imágenes sí salta lo que ya existe; ésta no, así que cada reintento
        // volvía a comprar la animación completa. Medido en una producción real:
        // 3 bloques × 3 intentos = NUEVE clips pagados para un video de tres.
        //
        // Un clip ya generado está guardado como asset de video de su escena. Si
        // está, el bloque no se vuelve a encolar: se reusa. Un reintento ahora
        // cuesta lo que falta, no todo otra vez.
        const escenasConClip = new Set(
          (detail.assets ?? [])
            .filter((a) => a.asset_type === "video" && a.public_url && a.scene_id)
            .map((a) => detail.scenes.find((s) => s.id === a.scene_id)?.scene_number)
            .filter((n): n is number => typeof n === "number"),
        );
        if (escenasConClip.size && !parsed.data.scene_number) {
          const antes = paraAnimar.length;
          paraAnimar = paraAnimar.filter((b) => !escenasConClip.has(b.leadScene));
          if (paraAnimar.length < antes) {
            console.log(
              `[blocks] ${antes - paraAnimar.length} bloque(s) YA tienen clip y no se vuelven a pagar ` +
              `(escenas ${[...escenasConClip].join(", ")}) — quedan ${paraAnimar.length} por animar`,
            );
          }
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
          // ── LOS RETRATOS DEL ELENCO, QUE ES LO QUE EL ENDPOINT CARO NECESITA ──
          //
          // Medido en un video real: "contacto físico → reference-to-video
          // (1 refs)". UNA sola imagen. El endpoint de referencias existe para
          // recibir a los personajes por separado —@Image1, @Image2— y CONSTRUIR
          // la acción entre ellos; con una sola imagen no tiene con quién armar
          // nada y se comporta igual que image-to-video, cobrando seis veces más.
          //
          // El motivo: se le pasaban el primer y el último cuadro DEL BLOQUE, que
          // en un bloque de una escena son la misma imagen y quedaban en una. Y
          // aunque fueran dos, son dos fotos de la misma escena — no los
          // personajes. La prueba del beso que sí funcionó usaba los RETRATOS.
          const elenco = await getProjectCast(parsed.data.project_id).catch(() => []);
          const claveDeNombre = (n: string) =>
            n.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
          // ── EL ARTÍCULO NO ES EL NOMBRE ──────────────────────────────────
          //
          // Se toma el primer nombre para reconocer al personaje dentro del
          // texto de la escena, pero de "La Presencia" salía "La": dos letras,
          // por debajo del mínimo, y el personaje quedaba sin detectar. Medido
          // en una producción real —una historia de terror cuya antagonista se
          // llama justamente "La Presencia"—, y le pasa igual a "El Doctor" o
          // "La Niña", que son formas naturales de nombrar a un personaje.
          //
          // Sin detección, su retrato no viaja y el modelo le inventa la cara.
          const nombreUtil = (n: string) => {
            const partes = claveDeNombre(n).split(/\s+/).filter(Boolean);
            const sinArticulo = partes.filter((p) => !["el", "la", "los", "las", "un", "una", "lo"].includes(p));
            return (sinArticulo[0] ?? partes[0] ?? "");
          };
          const retratoPorNombre = new Map<string, string>();
          for (const c of elenco) {
            if (c.name && c.reference_image_url) retratoPorNombre.set(claveDeNombre(c.name), c.reference_image_url);
          }

          // ── MENORES: EL PICO NO SE DIBUJA ────────────────────────────────
          //
          // Medido: un proyecto cuyo elenco era una adulta y una nena recibió los
          // picos de drama, confesión y terror igual que cualquier otro, y tres
          // de cuatro cuadros salieron con la niña en escena — cachetada y
          // agarre de muñeca incluidos. El sistema no lo sabía porque la edad no
          // se guardaba; ahora sí.
          //
          // Las plataformas no penalizan ese video: penalizan la cuenta. Y no es
          // un error que se arregle después, porque para cuando se ve ya se
          // publicó.
          //
          // El bloque se anima igual, por image-to-video normal y sin cuadro
          // destino: la escena existe, la acción sale más suave, y nadie dibuja
          // a un menor en un pico de contacto o de violencia.
          const nombresMenores = new Set(
            elenco
              .filter((c) => ["child", "teen"].includes(String((c as { age?: string | null }).age ?? "").toLowerCase()))
              .map((c) => claveDeNombre(c.name ?? ""))
              .filter(Boolean),
          );
          if (nombresMenores.size) {
            console.log(`[pico] ${nombresMenores.size} personaje(s) menor(es) en el elenco — sus bloques no reciben cuadro destino`);
          }

          // Cuántos bloques ya se enrutaron a reference-to-video en este video.
          let rtvUsados = 0;
          // Y CUÁNTO SE LLEVA GASTADO. En dólares, que es la unidad en la que se
          // pierde plata — no en cantidad de bloques.
          let gastoProyectado = 0;
          // EL TECHO ESCALA CON LA DURACIÓN, porque el costo escala con la
          // duración y el precio de venta también.
          //
          // Estuvo plano en $3,50, y un número plano protege a un solo tamaño de
          // video. La cuenta que lo justificaba —un pico premium de 6s ($1,81)
          // más cuatro bloques normales ($1,24) = $3,05, y el segundo pico ya no
          // cabe— vale para 30 segundos. Para 90 no vale nada: la animación
          // barata sola son $4,68 y ya se pasó del techo sin haber usado el
          // endpoint caro para nada. El guardia no lo ve porque solo mira las
          // decisiones caras, así que un video largo pasaba entero por debajo.
          //
          // $0,1167 por segundo mantiene exactamente aquel cálculo a los 30s
          // ($3,50) y lo extiende con honestidad: 60s → $7,00, 90s → $10,50.
          // MAX_ANIMATION_SPEND_USD sigue existiendo como tope ABSOLUTO para
          // quien quiera uno fijo por encima de todo.
          const segundosPedidos = videoSecondsFor(detail.project.duration_target);
          const porSegundo = Math.max(0.02, Number(process.env.MAX_ANIMATION_SPEND_PER_SECOND ?? 0.1167) || 0.1167);
          const topeAbsoluto = Number(process.env.MAX_ANIMATION_SPEND_USD ?? 0) || Infinity;
          const PRESUPUESTO_ANIMACION = Math.max(0.5, Math.min(porSegundo * segundosPedidos, topeAbsoluto));
          console.log(
            `[gasto] presupuesto de animación: $${PRESUPUESTO_ANIMACION.toFixed(2)} para ${segundosPedidos}s` +
            (topeAbsoluto === Infinity ? "" : ` (tope absoluto $${topeAbsoluto.toFixed(2)})`),
          );
          const { costoClipReferencias, costoClipSeedance } = await import("@/lib/costs");

          // Los retratos de quienes actúan en un bloque. Se usa dos veces: para
          // dibujar el cuadro destino y para las referencias del endpoint caro.
          const retratosDe = (b: { scenes: number[] }) => [...new Set(
            b.scenes
              .map((n) => sceneByNumber.get(n)?.speaker)
              .filter((sp): sp is string => Boolean(sp))
              .map((sp) => retratoPorNombre.get(claveDeNombre(sp)))
              .filter((u): u is string => Boolean(u)),
          )];

          // ── EL PICO SE DIBUJA, NO SE COMPRA ──────────────────────────────
          //
          // Una acción que cambia el cuerpo no puede salir de una foto que no la
          // contiene: el clip interpola desde el cuadro inicial y se queda en el
          // "casi". Durante meses la única salida fue el endpoint de referencias
          // a ~6x por segundo.
          //
          // Ahora se dibuja el cuadro en el que la acción YA OCURRIÓ y se lo pasa
          // como último fotograma: el modelo barato no tiene que inventar el
          // beso, la cachetada o la caída — tiene que LLEGAR a un cuadro dado,
          // que es precisamente lo que sabe hacer.
          //
          // Verificado de punta a punta con un beso: $0.38 contra $2.42, con el
          // elenco intacto y 21% de cuadros quietos (por debajo del umbral).
          // Se apaga con PEAK_FRAMES=off.
          const PICOS_ON = (process.env.PEAK_FRAMES ?? "on").toLowerCase() !== "off";
          const destinoPorBloque = new Map<number, string>();
          if (PICOS_ON) {
            const picos = paraAnimar
              .map((b) => {
                // LA MARCA DEL GUIONISTA MANDA; la regex es el respaldo.
                //
                // ACCION_CLAVE enumera categorías de acción, y lo que un cuerpo
                // puede hacer no se enumera: se le encontraron seis agujeros en
                // un solo día de pruebas, y cada uno era un video sin su momento.
                // El guionista sabe cuál escena es su pico y ahora lo declara con
                // is_peak. Los guiones anteriores a ese campo siguen entrando por
                // la regex, que para eso queda.
                const marcada = b.scenes
                  .map((n) => sceneByNumber.get(n) as { physical_action?: string | null; is_peak?: number | boolean } | undefined)
                  .find((sc) => sc && Boolean(sc.is_peak));
                if (marcada?.physical_action) return { b, accion: marcada.physical_action };
                return {
                  b,
                  accion: b.scenes
                    .map((n) => (sceneByNumber.get(n) as { physical_action?: string | null } | undefined)?.physical_action ?? "")
                    .find((a) => ACCION_CLAVE.test(a)) ?? "",
                };
              })
              .filter((x) => x.accion)
              // Un bloque donde habla o aparece un menor no recibe cuadro
              // destino, sin importar cuán claro sea su pico.
              .filter(({ b }) => {
                const conMenor = b.scenes.some((n) => {
                  const sp = sceneByNumber.get(n)?.speaker;
                  return sp ? nombresMenores.has(claveDeNombre(sp)) : false;
                });
                if (conMenor) {
                  console.log(`[pico] bloque escena ${b.leadScene}: hay un menor en la escena — sin cuadro destino, va por image-to-video normal`);
                }
                return !conMenor;
              });

            if (picos.length) {
              const { generarCuadroDestino } = await import("@/services/video/peak-frame");
              const dibujados = await Promise.all(picos.map(async ({ b, accion }) => ({
                lead: b.leadScene,
                url: await generarCuadroDestino({
                  accionFisica: accion,
                  referencias: [...retratosDe(b), imgByScene.get(b.leadScene)].filter((u): u is string => Boolean(u)),
                  escena: b.leadScene,
                  // El registro visual del proyecto decide si el filtro acepta
                  // un pico íntimo — y que el cuadro salga en el mismo estilo
                  // que el resto del video.
                  estiloVisual: detail.project.visual_style,
                  // El tono decide la luz: terror no se ilumina como romance.
                  tono: detail.project.tone,
                }).catch(() => null),
              })));
              for (const d of dibujados) if (d.url) destinoPorBloque.set(d.lead, d.url);
              console.log(
                `[pico] ${destinoPorBloque.size}/${picos.length} cuadro(s) destino dibujados ` +
                `(~$${(destinoPorBloque.size * 0.06).toFixed(2)}) — el pico se anima con el modelo barato`,
              );
            }
          }

          blockJobs = paraAnimar.map((block, bi) => {
            const nextBlock = paraAnimar[bi + 1];
            // EL CUADRO FINAL ES DEL PROPIO BLOQUE, no del siguiente.
            //
            // Un bloque cubre varias líneas con una sola imagen, y las que no son la
            // primera quedaban sin cuadro propio: el modelo las inventaba desde un
            // momento que no era el suyo. Ese es el defecto que se ve — el subtítulo
            // dice una cosa y la imagen muestra otra.
            //
            // Anclando el final en la ÚLTIMA escena del bloque, el clip empieza y
            // termina en cuadros de sus propias líneas y solo interpola en el medio.
            // Se pierde el encadenado con el bloque siguiente, pero ese encadenado
            // solo servía cuando compartían locación, y la coherencia dentro del
            // clip pesa más que la costura entre clips.
            const propiaUltima = block.scenes.length > 1
              ? imgByScene.get(block.scenes[block.scenes.length - 1]!)
              : undefined;
            const endImage = propiaUltima
              ?? (nextBlock ? imgByScene.get(nextBlock.leadScene) : imgByScene.get(block.scenes[block.scenes.length - 1]!));
            const lines = block.scenes
              .map((n) => sceneByNumber.get(n))
              .filter(Boolean)
              .map((sc) => ({
                speaker: sc!.speaker,
                look: (sc as { speaker_look?: string | null }).speaker_look,
                text: sc!.narration_text ?? "",
                // La emoción y la acción DE ESTA escena. Antes solo viajaba la de la
                // primera del bloque, así que el clip entero se actuaba con una sola
                // emoción y mostraba una sola acción mientras se oían tres diálogos.
                emotion: sc!.emotion,
                action: sc!.animation_prompt,
                // Lo que hacen los cuerpos ANTES y DESPUÉS de la línea. Sin esto
                // el clip es gente hablando: la acción llegaba solo como algo
                // simultáneo al diálogo, así que nadie se besaba ni se miraba.
                physicalAction: (sc as { physical_action?: string | null }).physical_action,
                environment: (sc as { environment?: string | null }).environment,
              }));
            // ENCADENAR SOLO DENTRO DEL MISMO LUGAR.
            //
            // end_image_url hace que el clip termine en el cuadro donde arranca el
            // siguiente, y por eso el video se lee como una toma continua. Pero eso
            // solo funciona si los dos cuadros son el MISMO sitio: cruzando un
            // cambio de escenario, el modelo intenta transformar una habitación en
            // otra y sale un morfeo. Un corte limpio se ve muchísimo mejor que una
            // transformación imposible.
            const lugarDe = (n: number) =>
              ((sceneByNumber.get(n) as { location?: string | null } | undefined)?.location ?? "").trim().toLowerCase();
            const nextLead = blocks[bi + 1]?.leadScene;
            const mismoLugar = nextLead !== undefined && lugarDe(block.leadScene) === lugarDe(nextLead);
            // Sin dato de locación se mantiene el encadenado: es el comportamiento
            // que ya venía funcionando, y los guiones viejos no traen el campo.
            const hayDato = Boolean(lugarDe(block.leadScene)) && nextLead !== undefined && Boolean(lugarDe(nextLead));
            const encadenar = !hayDato || mismoLugar;
            if (hayDato && !mismoLugar) {
              console.log(`[blocks] escena ${block.leadScene}: cambia de escenario → corte limpio, sin encadenar`);
            }

            // ── ACCIÓN QUE CAMBIA EL CUERPO → reference-to-video ──────────────
            //
            // Igual que arriba: primero la marca del guion, después la regex.
            const esAccionClave =
              block.scenes.some((n) => Boolean((sceneByNumber.get(n) as { is_peak?: number | boolean } | undefined)?.is_peak)) ||
              lines.some((l) => ACCION_CLAVE.test(l.physicalAction ?? ""));
            // TECHO DE GASTO: referencias cuesta ~6x por segundo (medido: $0.30/s
            // contra $0.052/s a 720p). Sin tope, un guion muy físico enrutaría
            // todos los bloques y el margen desaparece en silencio. Los que
            // exceden el tope siguen por image-to-video — peor plano, video vivo.
            // APAGADO POR DEFECTO. Estuvo en 2 y costó dinero de verdad: dos
            // bloques premium por corrida, y con los reintentos re-comprando la
            // animación, una sola producción llegó a ~$19,70 para entregar un
            // video de ~$6,60. Hasta que el camino barato al beso esté probado
            // —el experimento vive en experimentos/beso-barato.mjs— el endpoint
            // de referencias no se enciende solo: hay que pedirlo con
            // RTV_MAX_BLOCKS=1. Un gasto de 6x por segundo no puede ser el
            // comportamiento por omisión de nadie.
            const RTV_MAX = Math.max(0, Number(process.env.RTV_MAX_BLOCKS ?? 0) || 0);
            // RTV_MODE=all: TODO el video por referencias, sin tope.
            //
            // Es la calidad del clip que el usuario aprobó, y la pidió sabiendo el
            // precio: un video de 30s pasa de ~$1,55 a ~$9,10 de animación, contra
            // $6,12 de venta. Se pierde dinero por video a propósito, así que vive
            // detrás de una variable y NO es el default: un cambio de una línea no
            // puede dejar a todos los usuarios produciendo a pérdida en silencio.
            const RTV_TODO = (process.env.RTV_MODE ?? "peaks").toLowerCase() === "all";

            // El material PRIMERO, la decisión después. Los retratos de quienes
            // actúan en este bloque, y al final el cuadro de la escena — que
            // aporta el set, la luz y el vestuario del momento exacto.
            const retratosDelBloque = [...new Set(
              lines.map((l) => (l.speaker ? retratoPorNombre.get(claveDeNombre(l.speaker)) : undefined))
                   .filter((u): u is string => Boolean(u)),
            )];
            const anclaDelBloque = imgByScene.get(block.leadScene) ?? block.referenceImageUrl;
            const refsPosibles = [...retratosDelBloque, anclaDelBloque]
              .filter((u): u is string => Boolean(u))
              .filter((u, i, a) => a.indexOf(u) === i);

            // CON MENOS DE DOS REFERENCIAS NO SE PAGA EL ENDPOINT CARO. No es una
            // preferencia: con una sola imagen hace exactamente lo mismo que el
            // barato y cuesta seis veces más. Es dinero tirado, en silencio.
            const hayMaterial = refsPosibles.length >= 2;

            // ── TECHO EN DÓLARES, NO EN CANTIDAD DE BLOQUES ──────────────────
            //
            // RTV_MAX_BLOCKS limita cuántos, no cuánto. Dos bloques de 12 segundos
            // son $7,26 de animación contra $6,12 de precio de venta: el tope se
            // respeta y el video igual sale a pérdida. Un límite que se cumple y
            // aun así te hace perder dinero no es un límite.
            //
            // Ahora se cuenta el gasto REAL proyectado y el bloque caro solo pasa
            // si cabe. El que no cabe sigue por image-to-video, que es peor plano
            // pero video vivo — y el log dice exactamente cuánto faltaba.
            const segundosDelBloque = Math.min(HOOK_BLOCK_SECONDS, Math.max(4, Math.ceil(block.seconds + 1)));
            const costoSiEsCaro = costoClipReferencias(segundosDelBloque);
            const costoSiEsNormal = costoClipSeedance({
              segundos: segundosDelBloque,
              resolucion: process.env.VIDEO_RESOLUTION ?? "720p",
              conAudio: NATIVE_AUDIO_ON,
            });
            const cabeEnPresupuesto = gastoProyectado + costoSiEsCaro <= PRESUPUESTO_ANIMACION;

            const quiereCaro = RTV_TODO || (esAccionClave && rtvUsados < RTV_MAX);
            const esContacto = quiereCaro && hayMaterial && cabeEnPresupuesto;
            gastoProyectado += esContacto ? costoSiEsCaro : costoSiEsNormal;

            if (quiereCaro && hayMaterial && !cabeEnPresupuesto) {
              console.warn(
                `[gasto] bloque escena ${block.leadScene}: el plano caro costaría $${costoSiEsCaro.toFixed(2)} y ` +
                `el presupuesto de animación es $${PRESUPUESTO_ANIMACION.toFixed(2)} (van $${gastoProyectado.toFixed(2)}) — va por image-to-video`,
              );
            }
            if (esAccionClave && !hayMaterial) {
              console.warn(
                `[video] bloque escena ${block.leadScene}: acción física clave, pero solo ${refsPosibles.length} referencia(s) ` +
                `(hablantes: ${lines.map((l) => l.speaker ?? "?").join(", ")}) — va por image-to-video en vez de pagar 6x por nada`,
              );
            } else if (esAccionClave && !esContacto) {
              console.warn(`[video] bloque escena ${block.leadScene}: acción física clave, pero RTV_MAX_BLOCKS=${RTV_MAX} agotado — va por image-to-video`);
            }
            if (esContacto) rtvUsados++;
            const refsContacto = esContacto ? refsPosibles : undefined;

            // El prompt de referencias nombra a las imágenes: sin el mapa @ImageN
            // el modelo no sabe qué es cada archivo. Y ahora SÍ son cosas
            // distintas —personajes y escenario—, así que se nombran distinto.
            const prefijoRefs = refsContacto?.length
              ? retratosDelBloque
                  .map((_, i) => `@Image${i + 1} is ${lines[i]?.speaker ?? "a character"}`)
                  .concat(`@Image${refsContacto.length} is the set, lighting and wardrobe of this exact moment`)
                  .join(". ") +
                ". Keep every face, outfit and location IDENTICAL to these references. " +
                "Put these characters together in one shot and perform the action between them. "
              : "";

            return {
              ...(refsContacto?.length ? { reference_image_urls: refsContacto } : {}),
              scene_number: block.leadScene,
              image_url: imgByScene.get(block.leadScene) ?? block.referenceImageUrl,
              // El cuadro propio del bloque no depende de `encadenar`: es su propia
              // última escena, así que la locación es correcta por construcción. La
              // comprobación de escenario solo aplica al encadenado con el bloque
              // siguiente, que es el caso donde el modelo tendría que transformar un
              // lugar en otro.
              // EL DESTINO DEL PICO MANDA sobre todo lo demás. El cuadro final
              // se usaba para cerrar el bloque en su propia última escena, o para
              // encadenar con el siguiente — las dos cosas son continuidad. Pero
              // cuando el bloque TIENE un pico físico, ese cuadro es lo único que
              // decide si la acción ocurre o se queda en amago, y eso pesa más
              // que cualquier costura.
              end_image_url: destinoPorBloque.get(block.leadScene)
                ?? (propiaUltima && propiaUltima !== imgByScene.get(block.leadScene)
                  ? propiaUltima
                  : (encadenar && endImage && endImage !== imgByScene.get(block.leadScene) ? endImage : undefined)),
              // La dirección de cámara sale del GUION, no de una frase fija.
              //
              // Antes decía "cinematic scene with natural camera movement AND CUTS
              // BETWEEN SHOTS": le estábamos pidiendo al modelo que cortara DENTRO
              // del clip. Por eso la escena cambiaba de lugar y de encuadre a los
              // dos segundos y no se sentía una toma seguida — el desorden se lo
              // pedíamos nosotros. Y al mismo tiempo se descartaba el
              // animation_prompt y el camera_move que la IA había escrito para esa
              // escena: dirección específica, generada y tirada a la basura.
              animation_prompt: (() => {
                const lead = sceneByNumber.get(block.leadScene);
                // Solo el MOVIMIENTO de cámara del líder: la acción de cada escena
                // viaja ahora pegada a su propia línea de diálogo. Meter acá el
                // animation_prompt del líder describía una acción que el clip iba a
                // mostrar mientras sonaban los diálogos de las escenas siguientes.
                const movimiento = (lead?.camera_move ?? "").trim();
                // CUANDO HAY CUADRO DESTINO, SE DICE QUE ES EL DESTINO.
                //
                // Pasarlo como último fotograma y no nombrarlo deja que el modelo
                // llegue ahí de casualidad, cuando quiera y como quiera — que es
                // exactamente cómo se producía el "casi": la acción a medias y el
                // resto del clip quieto. Nombrarlo convierte el cuadro en un
                // objetivo con tiempo: la acción OCURRE dentro del plano y se
                // sostiene hasta el final.
                const destino = destinoPorBloque.get(block.leadScene)
                  ? "The clip ENDS on the given final frame, and that action actually HAPPENS on camera: " +
                    "it begins around the middle of the shot, completes, and is still held on the last frame. " +
                    "Do not stop short of it and do not rush past it. " +
                    "Once it lands, the bodies stay in it while breath, hair and light keep moving. "
                  : "";

                return (
                  prefijoRefs +
                  destino +
                  // EL PROMPT DESCRIBE MOVIMIENTO, NO LA IMAGEN.
                  //
                  // La imagen inicial YA EXISTE: trae el encuadre, la paleta, la luz
                  // y el estilo, generados con la referencia del personaje. Volver a
                  // describir todo eso acá —"35mm anamorphic look, shallow depth of
                  // field, motivated practical lighting"— le daba al modelo una foto
                  // y a la vez una descripción de cómo debería verse una foto. Las
                  // dos compiten, y es parte de por qué a veces reinterpretaba el
                  // cuadro en lugar de animarlo.
                  //
                  // Queda SOLO lo que es movimiento y comportamiento. "Cámara con
                  // peso que arranca y frena" describe cómo se mueve, así que se
                  // queda; "anamórfico de 35mm" describe cómo se ve, así que se va.
                  "ONE CONTINUOUS SHOT, no cuts, no scene changes. " +
                  "Do not restyle or redraw the frame: keep the given image's look, palette and framing exactly. " +
                  "The subject stays in frame and well composed at all times. " +
                  "The camera has weight — it settles rather than drifts, starts and stops with intention, never floats. " +
                  // LA CÁMARA NUNCA SE QUEDA QUIETA. Al pasar la acción de cada
                  // escena a su propia línea, la dirección de cámara quedó reducida
                  // a una frase corta del guion — y una instrucción escueta produce
                  // planos fijos. El movimiento tiene que pedirse explícitamente, y
                  // tiene que RESPONDER a los beats: una cámara que se acerca en la
                  // revelación cuenta; una que flota, no.
                  `Camera: ${movimiento || "slow push in on the face"}. ` +
                  // UN MOVIMIENTO DE CÁMARA TERMINA.
                  //
                  // Esta línea decía "la cámara se mueve durante TODO el clip" y
                  // contradecía a la de arriba, que pide que se asiente. Medido en
                  // un video real: movimiento alto y constante durante los 27
                  // segundos, sin un solo instante de reposo. Eso se lee como un
                  // dron, no como una cámara operada — y en un clip de 9s es
                  // muchísimo recorrido.
                  //
                  // Un movimiento real ARRANCA, RECORRE y LLEGA. El reposo del
                  // final es lo que le da peso al plano y deja mirar la cara.
                  // …PERO LO QUE SE DETIENE ES LA CÁMARA, NO EL PLANO.
                  //
                  // "holding still on the face" pedía literalmente un tercio de
                  // clip quieto, y el modelo obedeció: medido sobre un video
                  // real, el 34% de los cuadros tenía MENOS movimiento que una
                  // foto fija con Ken Burns — casi exactamente ese tercio final.
                  // Le estábamos pagando a Seedance para que congelara.
                  //
                  // El clip que sí funcionó —el beso— mide 1% de cuadros
                  // quietos con la cámara igual de calmada: lo que no se detiene
                  // ahí es el SUJETO. Una cámara quieta sobre un cuadro muerto
                  // es una foto; sobre un cuerpo que respira es un primer plano.
                  "The camera move ARRIVES and SETTLES: it starts, travels, and comes to rest during the " +
                  "final third of the clip, then holds — but ONLY the camera stops. " +
                  "The shot never freezes: while the camera rests, breath keeps lifting the shoulders, " +
                  "eyes blink and search, hair and fabric keep settling, a hand tightens or lets go, " +
                  "and the light, flame, rain or dust behind them keeps living. " +
                  "A still camera on a frozen frame is a photograph, not a shot. " +
                  "Never a locked-off frame from the first instant, and never a camera still drifting on the last frame. " +
                  "The movement answers the beats: it eases while the character speaks and " +
                  "pushes in on the moment of revelation, then stops. " +
                  "Consistent character appearance and wardrobe throughout. " +
                  // Continuidad entre clips: cuando este bloque enlaza con el
                  // siguiente en el mismo lugar, el modelo tiene que entender que no
                  // arranca una escena nueva sino que sigue la misma.
                  (encadenar
                    ? "This shot CONTINUES the previous one: same room, same light, same wardrobe, " +
                      "the characters exactly where the last shot left them. Do not reset the scene. "
                    : "") +
                  // El clip recorre VARIAS escenas: la acción y la emoción de cada
                  // una van pegadas a su línea, más abajo. Acá solo queda la regla
                  // que las ordena — sin ella el modelo las mezcla todas a la vez.
                  "The clip covers several story beats IN ORDER: perform them one after " +
                  "another, never at the same time, and let the emotion change between them " +
                  "as the lines say. What the character DOES must match the line being " +
                  "spoken at that exact moment." +
                  // La duración real del clip: sin ella los tramos de tiempo
                  // serían inventados y el reparto no cerraría con el audio.
                  buildDialogueDirection(lines, Math.min(HOOK_BLOCK_SECONDS, Math.max(4, Math.ceil(block.seconds + 1))))
                );
              })(),
              duration_seconds: Math.min(HOOK_BLOCK_SECONDS, Math.max(4, Math.ceil(block.seconds + 1))),
              generate_audio: true,
            };
          });
        } else {
          // Sheets in parallel: waiting for each clip to chain off the previous one
          // would multiply wall-clock by the block count.
          const prepared = await Promise.all(paraAnimar.map(async (b) => {
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
          jobs: jobs.map((j) => ({ scene_number: j.sceneNumber, request_id: j.requestId, status: j.status, error: j.error, model: j.model })),
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
          // MISMA DIRECCIÓN QUE LA RUTA DE BLOQUES.
          //
          // Esta rama solo mandaba `animation_prompt`: sin diálogo citado, sin
          // dirección de actuación y sin generate_audio. Con NARRATIVE_BLOCKS
          // apagado —que es justamente el modo de máxima coherencia, un cuadro por
          // línea— los clips habrían salido MUDOS. El modo más caro del sistema era
          // también el peor, y eso no se veía hasta pagar el video entero.
          //
          // Acá cada clip cubre UNA escena, así que la imagen, la línea, la emoción
          // y la acción son todas del mismo momento: es el techo de coherencia que
          // los bloques no pueden alcanzar.
          const linea = [{
            speaker: scene.speaker,
            look: (scene as { speaker_look?: string | null }).speaker_look,
            text: scene.narration_text ?? "",
            emotion: scene.emotion,
            action: scene.animation_prompt,

            environment: (scene as { environment?: string | null }).environment,
            physicalAction: (scene as { physical_action?: string | null }).physical_action,
          }];
          const movimiento = (scene.camera_move ?? "").trim();
          return {
            scene_number: scene.scene_number,
            // Igual que la ruta de bloques: el prompt describe MOVIMIENTO, no la
            // imagen. La foto inicial ya trae encuadre, luz y estilo.
            animation_prompt:
              "ONE CONTINUOUS SHOT, no cuts, no scene changes. " +
              "Do not restyle or redraw the frame: keep the given image's look, palette and framing exactly. " +
              "The camera has weight — it settles rather than drifts, starts and stops with intention. " +
              `Camera: ${movimiento || "slow push in on the face"}. ` +
              // Igual que en la ruta de bloques: el movimiento LLEGA y se asienta,
              // y lo que se detiene es la CÁMARA, nunca el plano.
              "The camera move ARRIVES and SETTLES: it starts, travels, and comes to rest during the " +
              "final third of the clip, then holds — but ONLY the camera stops. " +
              "The shot never freezes: while the camera rests, breath keeps lifting the shoulders, " +
              "eyes blink and search, hair and fabric keep settling, and the light behind them keeps living. " +
              "A still camera on a frozen frame is a photograph, not a shot. " +
              "Consistent character appearance and wardrobe throughout." +
              (NATIVE_AUDIO_ON ? buildDialogueDirection(linea, effectiveDur) : ""),
            image_url: matched ?? fallback,
            duration_seconds: effectiveDur,
            generate_audio: NATIVE_AUDIO_ON,
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
          // El segundo argumento solo lo usa checkVideoJob; los demás checkers lo
          // ignoran sin romperse.
          const status = await (checkJob as (id: string, model?: string) => ReturnType<typeof checkVideoJob>)(job.request_id, job.model);
          return { scene_number: job.scene_number, request_id: job.request_id, ...status };
        })
      );

      // ── LO QUE SE PAGÓ CARO SE VERIFICA, EN EL MOMENTO ───────────────────
      // Medido en un video real: el único bloque premium volvió con el 51% de
      // sus cuadros quietos — el plano MÁS congelado del video era el único que
      // costó seis veces más. Nadie lo supo hasta que alguien miró el resultado
      // terminado. Medir el clip cuesta ~1 segundo y ffmpeg lee la URL directo,
      // así que la comprobación ocurre donde se hizo el gasto.
      try {
        const { esClipDePico } = await import("@/services/video/router");
        const premium = results.filter(
          (r) => r.status === "completed" && r.url &&
                 esClipDePico(parsed.data.jobs?.find((j) => j.scene_number === r.scene_number)?.model),
        );
        if (premium.length) {
          const { medirQuietud, PREMIUM_QUIETO_MAX } = await import("@/services/quality/auditor");
          await Promise.all(premium.map(async (r) => {
            const m = await medirQuietud(r.url!);
            if (!m) return;
            if (m.quietoPct > PREMIUM_QUIETO_MAX) {
              console.warn(
                `[gasto] escena ${r.scene_number}: se pagó el clip PREMIUM y volvió con ${m.quietoPct}% de cuadros ` +
                `quietos (${m.segundos.toFixed(1)}s) — el endpoint barato habría dado lo mismo por la sexta parte. ` +
                `Revisar las referencias y la acción física de este bloque.`,
              );
            } else {
              console.log(`[gasto] escena ${r.scene_number}: clip premium OK — ${m.quietoPct}% quieto en ${m.segundos.toFixed(1)}s`);
            }
          }));
        }
      } catch { /* verificar nunca puede costar un video */ }

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
          } else if (!NATIVE_AUDIO_ON) {
            // Sin audio nativo no hay clip que transcribir, y los tiempos de
            // palabra tienen que venir de la voz de ElevenLabs. Decirlo evita
            // buscar el problema en Whisper cuando Whisper ni se llamó.
            console.warn(`[nativo] escena ${r.scene_number}: NATIVE_AUDIO apagado — no se transcribe, los subtítulos dependen de la voz`);
          } else {
            console.warn(`[nativo] escena ${r.scene_number}: SIN transcripción — los subtítulos van a repartirse desde el guion (ver [transcribe] arriba)`);
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
          // Con la RESOLUCIÓN real el costo se calcula con la fórmula de fal en
          // vez de una tarifa plana que ya no describe nada: a 1080p un clip
          // cuesta 2,25 veces lo que cuesta a 720p.
          //
          // La duración exacta de cada clip no viaja hasta este punto —collect
          // solo recibe los identificadores—, así que se usa la duración típica
          // de un bloque. Es una aproximación, y la única de la cuenta: el resto
          // (píxeles, fps, tarifa) sale de la fórmula publicada.
          //
          // Y CADA CLIP SE FACTURA EN LA COLA DONDE DE VERDAD SE GENERÓ. Antes
          // esto adivinaba mirando si el nombre del modelo decía
          // "reference-to-video"; ahora el proveedor viaja en el handle y él
          // mismo dice cuánto cobra por segundo. Es la razón de ser del router:
          // sumar un proveedor nuevo no obliga a recordar que también hay que
          // tocar la cuenta.
          const segundosClip = Number(process.env.CLIP_SECONDS_AVG ?? 6) || 6;
          const resolucionClip = process.env.VIDEO_RESOLUTION ?? "720p";
          const { costoDeClip } = await import("@/services/video/router");
          const handlePorEscena = new Map(
            (parsed.data.jobs ?? []).map((j) => [j.scene_number, j.model] as const),
          );
          const completados = results.filter((r) => r.status === "completed");
          const porRouter = completados.reduce(
            (suma, r) => suma + costoDeClip(handlePorEscena.get(r.scene_number), segundosClip, resolucionClip), 0,
          );
          // Un cero del router significa que no reconoció el handle, no que el
          // clip fue gratis. Antes de registrar $0 —que se lee como "no gastamos"—
          // se vuelve a la estimación vieja y se avisa.
          const cost = porRouter > 0 && !isLipsyncStage
            ? porRouter
            : (() => {
                if (!isLipsyncStage) console.warn(`[video] el router no reconoció los handles — se factura con la estimación genérica`);
                return estimateVideos(doneCount, model, isLipsyncStage, {
                  segundos: segundosClip, resolucion: resolucionClip, conAudio: NATIVE_AUDIO_ON,
                });
              })();
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
