// ─── Production job worker ───────────────────────────────────────────────────
// Production used to be a promise floating inside the HTTP request that started
// it. If the Node process restarted mid-render — a deploy, a crash, a laptop
// closing — the video the user had already been charged for vanished with no row
// anywhere saying it had ever existed.
//
// Now every production is a `jobs` row. The worker claims rows atomically, stamps
// a heartbeat while it works, and re-queues anything whose heartbeat went cold.
// Restart the server mid-render and the job comes back on its own.
//
// Deliberately in-process rather than a separate service: this runs on one VPS
// with one Node process, and the claim is atomic at the database, so adding a
// second process later needs no code change.

import {
  claimNextJob, heartbeatJob, completeJob, failJob, requeueStaleJobs,
  countProcessingJobs, updateProjectStatus, refundCreditForProject,
  type DbJob,
} from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { internalHeaders, internalSecret } from "@/lib/internal-auth";
import { MAX_CONCURRENT_JOBS, JOB_POLL_MS, JOB_STALE_SECONDS, APP_BASE_URL, CONTINUITY_GATE_ON, NATIVE_AUDIO_ON, ANCHOR_IMAGES_ONLY } from "@/lib/config";
import { checkContinuity, ContinuityError } from "@/services/quality/continuity";
import { getProjectDetail } from "@/lib/db/repository";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// How often to ask fal whether the clips are done. 6s meant up to six seconds of
// dead air per round; 3s halves the tail latency of every video for a handful of
// extra status calls, which are free.
const POLL_CLIP_MS = Math.max(2000, Number(process.env.POLL_CLIP_MS ?? 3000) || 3000);

let started = false;
let running = 0;

export type JobStage = "voice_images" | "continuity" | "animation" | "render" | "done";

// ── The pipeline, unchanged in behaviour — but it now reports where it is ─────

async function runPipeline(job: DbJob, mark: (s: JobStage) => Promise<void>): Promise<void> {
  const base = APP_BASE_URL;
  const post = (path: string, body: object) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...internalHeaders() },
      // The worker has no cookie; it states whose work this is and proves it with
      // the internal secret. resolveRequestUserId ignores user_id without it.
      body: JSON.stringify({ ...body, user_id: job.user_id }),
    });

  await mark("voice_images");
  // With native character audio the clips speak for themselves, so the narration
  // step is not just unnecessary — paying for it and then discarding it is how the
  // "sounds narrated" problem survived so long.
  // Se llama SIEMPRE a /api/voice y es esa ruta la que decide si corresponde.
  // Antes el worker decidía con la variable global, y un borrador —que no genera
  // clips y por lo tanto no tiene audio nativo— salía mudo. La decisión depende
  // del proyecto, así que vive donde el proyecto se conoce.
  const [voiceRes, imgRes] = await Promise.all([
    post("/api/voice", { project_id: job.project_id }),
    post("/api/images", { project_id: job.project_id }),
  ]);
  if (voiceRes && !(await voiceRes.json() as { success?: boolean }).success) throw new Error("Falló la voz");
  if (!(await imgRes.json() as { success?: boolean }).success) throw new Error("Fallaron las imágenes");

  // ── CONTINUITY GATE ────────────────────────────────────────────────────────
  // The last free moment. Everything past this line costs money per scene, so a
  // broken set of images has to be caught HERE — not in the finished video the
  // user already paid for.
  if (CONTINUITY_GATE_ON) {
    await mark("continuity");

    // El portero mira los cuadros que SÍ pensábamos hacer. Con ANCHOR_IMAGES_ONLY
    // el pipeline dibuja solo los que un clip consume; revisar todas las escenas
    // reporta esos huecos deliberados como faltantes y bloquea una producción sana.
    const revisar = async () => {
      const detail = await getProjectDetail(job.project_id, job.user_id);
      if (!detail?.scenes?.length) return null;
      const imageBySceneId = new Map(
        (detail.assets ?? [])
          .filter((a) => a.asset_type === "image" && a.scene_id && a.public_url)
          .map((a) => [a.scene_id, a.public_url]),
      );
      return detail.scenes
        .map((s) => ({ scene_number: s.scene_number, image_url: imageBySceneId.get(s.id) ?? null }))
        .filter((s) => (ANCHOR_IMAGES_ONLY ? s.image_url !== null : true));
    };

    const primeras = await revisar();
    if (primeras) {
      let report = await checkContinuity(primeras);

      // ── QUE SE CORRIJA SOLO ──────────────────────────────────────────────
      //
      // Hasta ahora el portero sabía describir el defecto con precisión —"la
      // chica cambia: en las escenas 2 y 4 aparece otra persona"— y hacía una de
      // dos cosas malas: dejarlo pasar, y animar un video donde el protagonista
      // tiene dos caras; o bloquear, y devolverle el dinero a alguien que se
      // queda sin video. Ninguna de las dos arregla nada.
      //
      // Pero el informe NOMBRA las escenas, y una imagen suelta se vuelve a
      // dibujar por centavos. Redibujar cuesta ~$0.06 por escena y salva un video
      // de $6 — es lo que hace un director cuando ve mal el vestuario en dos
      // tomas: repite esas dos, no la película.
      //
      // UNA sola ronda y un tope de escenas: si redibujar no lo arregla, el
      // problema no es el dibujo, y reintentar solo quema dinero en silencio.
      const TOPE = Math.max(0, Number(process.env.CONTINUITY_REDRAW_MAX ?? 4) || 0);
      const sospechosas = [...new Set(report.issues.flatMap((i) => i.scenes))].slice(0, TOPE);

      if (sospechosas.length && TOPE > 0) {
        for (const i of report.issues) console.warn(`[continuity] ${i.severity} ${i.code}: ${i.message}`);
        console.log(`[continuity] redibujando escena(s) ${sospechosas.join(", ")} antes de animar — ~$${(sospechosas.length * 0.06).toFixed(2)}`);

        const redibujadas = await Promise.all(sospechosas.map(async (n) => {
          try {
            const r = await post("/api/images", { project_id: job.project_id, scene_number: n });
            const j = await r.json() as { success?: boolean; locked?: boolean; error?: string };
            // Una escena aprobada por el usuario NO se toca: su decisión manda
            // sobre la del portero.
            if (j.locked) console.log(`[continuity] escena ${n} aprobada por el usuario — se respeta`);
            return Boolean(j.success);
          } catch { return false; }
        }));

        if (redibujadas.some(Boolean)) {
          const segundas = await revisar();
          if (segundas) {
            const antes = report.issues.length;
            report = await checkContinuity(segundas);
            console.log(
              `[continuity] tras redibujar: ${report.issues.length} problema(s) contra ${antes} — ` +
              `${report.ok ? "se puede animar" : "sigue bloqueado"}`,
            );
          }
        }
      }

      for (const i of report.issues) console.warn(`[continuity] ${i.severity} ${i.code}: ${i.message}`);
      if (!report.ok) throw new ContinuityError(report);
      console.log(`[continuity] ${report.checked} escenas revisadas, sin bloqueos`);
    }
  }

  await mark("animation");
  // ── ENCADENADO REAL: UN BLOQUE POR VEZ ─────────────────────────────────
  // Con chain:true la ruta encola solo el primer bloque pendiente; cuando el
  // clip está, collect guarda su último cuadro para el siguiente y la
  // siguiente llamada a submit lo usa como arranque. Se repite hasta que la
  // ruta no devuelve jobs (todos los bloques tienen clip). Tope de 40 vueltas
  // por seguridad; el pipeline "pro" (lip-sync) sigue por el camino de antes.
  let sub = await (await post("/api/videos", { project_id: job.project_id, action: "submit", chain: true })).json() as
    { action?: string; pipeline?: string; jobs?: Array<{ scene_number: number; request_id: string; model?: string }> };
  if (sub.action !== "skipped" && sub.pipeline !== "pro") {
    let vueltas = 0;
    while (sub.jobs?.length && vueltas < 40) {
      vueltas++;
      const vozMal: number[] = [];
      await pollStage(post, job, sub.jobs, undefined, vozMal);
      if (vozMal.length) {
        for (const n of vozMal.slice(0, 2)) {
          console.log(`[voz] escena ${n}: la voz se apartó del guion — se pide de nuevo una vez`);
          const re = await (await post("/api/videos", { project_id: job.project_id, action: "submit", scene_number: n })).json() as { jobs?: Array<{ scene_number: number; request_id: string; model?: string }> };
          if (re.jobs?.length) await pollStage(post, job, re.jobs, undefined);
        }
      }
      await heartbeatJob(job.id);
      sub = await (await post("/api/videos", { project_id: job.project_id, action: "submit", chain: true })).json() as typeof sub;
      if (sub.action === "skipped") break;
    }
    if (vueltas) console.log(`[chain] animación completa en ${vueltas} vuelta(s)`);
  } else if (sub.action !== "skipped") {
    const vozMal: number[] = [];
    const motionUrls = await pollStage(post, job, sub.jobs ?? [], sub.pipeline === "pro" ? "motion" : undefined, vozMal);
    // ── LA VOZ QUE NO DIJO EL GUION SE VUELVE A PEDIR, UNA VEZ ──────────────
    // collect compara la transcripción de cada clip con el guion (ver [voz] en
    // /api/videos). Medido: "no me toques" salió como "mi tokeks" en el pico
    // emocional y nadie lo atrapó. Un clip de 6s cuesta ~$0.31; un video con
    // el clímax en un idioma inventado no vale nada. Tope de 2 clips por video
    // y un solo reintento — si vuelve mal, se monta igual y queda en el log.
    if (vozMal.length && sub.pipeline !== "pro") {
      const aRepetir = vozMal.slice(0, 2);
      console.log(`[voz] ${aRepetir.length} clip(s) con la voz apartada del guion (escenas ${aRepetir.join(", ")}) — se piden de nuevo una vez`);
      for (const n of aRepetir) {
        const re = await (await post("/api/videos", { project_id: job.project_id, action: "submit", scene_number: n })).json() as
          { jobs?: Array<{ scene_number: number; request_id: string; model?: string }> };
        if (re.jobs?.length) await pollStage(post, job, re.jobs, undefined);
      }
    }
    if (sub.pipeline === "pro") {
      const ls = await (await post("/api/videos", { project_id: job.project_id, action: "lipsync_submit", motion: motionUrls })).json() as
        { jobs?: Array<{ scene_number: number; request_id: string; model?: string }> };
      await pollStage(post, job, ls.jobs ?? [], "lipsync");
    }
  }

  await mark("render");
  // La respuesta cruda, no solo el JSON parseado: cuando /api/assemble contesta
  // algo inesperado (502 del proxy, HTML de error, body vacio) el `.json()`
  // directo descartaba la unica evidencia y el job moria con nuestro texto de
  // relleno, que no dice absolutamente nada sobre la causa.
  const resFinal = await post("/api/assemble", { project_id: job.project_id, action: "submit", add_subtitles: true });
  const rawFinal = await resFinal.text();
  let subFinal: { render_id?: string; error?: string } = {};
  try {
    subFinal = JSON.parse(rawFinal) as { render_id?: string; error?: string };
  } catch {
    throw new Error(`Montaje: respuesta no-JSON (HTTP ${resFinal.status}): ${rawFinal.slice(0, 300)}`);
  }
  if (!subFinal.render_id) {
    throw new Error(subFinal.error || `Montaje sin render_id (HTTP ${resFinal.status}): ${rawFinal.slice(0, 300)}`);
  }
  for (let i = 0; i < 96; i++) {
    await sleep(5000);
    await heartbeatJob(job.id);
    const chk = await (await post("/api/assemble", { project_id: job.project_id, action: "check", render_id: subFinal.render_id })).json() as { status: string };
    if (chk.status === "done") return;
    if (chk.status === "failed") throw new Error("El render final falló");
  }
  throw new Error("El montaje final tardó demasiado");
}

async function pollStage(
  post: (p: string, b: object) => Promise<Response>,
  job: DbJob,
  initial: Array<{ scene_number: number; request_id: string; model?: string }>,
  stage?: "motion" | "lipsync",
  /** Se llena con las escenas cuyo clip completó pero la voz no dijo el guion. */
  vozMal?: number[],
) {
  let pending = initial.filter((j) => j.request_id);
  const urls: Array<{ scene_number: number; video_url: string }> = [];
  for (let i = 0; i < 200 && pending.length; i++) {
    await sleep(POLL_CLIP_MS);
    // Heartbeat inside the wait, not only between stages — animation can run for
    // minutes and a silent worker looks dead to the stale-job sweeper.
    await heartbeatJob(job.id);
    const col = await (await post("/api/videos", {
      project_id: job.project_id, action: "collect", stage,
      // El modelo viaja con el job: un clip de reference-to-video consultado en
      // la cola de image-to-video es un 404 y el video moriría por timeout.
      jobs: pending.map((j) => ({ scene_number: j.scene_number, request_id: j.request_id, model: j.model })),
    })).json() as { all_done: boolean; scenes: Array<{ scene_number: number; status: string; url?: string; voz_ok?: boolean }> };
    for (const s of col.scenes) if (s.status === "completed" && s.url) {
      urls.push({ scene_number: s.scene_number, video_url: s.url });
      if (s.voz_ok === false && vozMal && !vozMal.includes(s.scene_number)) vozMal.push(s.scene_number);
    }
    // RETURN, not break — see the note in the client flow. Breaking here would
    // have failed every queued job whose animation actually succeeded.
    if (col.all_done) return urls;
    pending = pending.filter((j) => {
      const s = col.scenes.find((x) => x.scene_number === j.scene_number);
      return s?.status !== "completed" && s?.status !== "failed";
    });
  }
  if (pending.length) throw new Error("La animación tardó demasiado");
  return urls;
}

// ── Job lifecycle ────────────────────────────────────────────────────────────

async function processJob(job: DbJob): Promise<void> {
  const mark = async (s: JobStage) => { await heartbeatJob(job.id, s); };
  try {
    await updateProjectStatus(job.project_id, "producing").catch(() => {});
    await runPipeline(job, mark);
    await completeJob(job.id, { project_id: job.project_id });
    console.log(`[worker] job ${job.id.slice(0, 8)} done`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A continuity block is terminal on the first try: image generation is
    // idempotent, so a retry re-reads the same broken frames and fails the same
    // way — extra attempts would only delay the refund.
    const { terminal } = await failJob(job.id, message, { terminal: err instanceof ContinuityError });
    console.error(`[worker] job ${job.id.slice(0, 8)} ${terminal ? "FAILED" : "will retry"}: ${message}`);
    if (terminal) {
      // Only refund once the job is really out of attempts — refunding on the
      // first hiccup would hand back credits for a video that then succeeds.
      await updateProjectStatus(job.project_id, "failed", message).catch(() => {});
      await refundCreditForProject(job.user_id, job.project_id).catch(() => {});
    }
  }
}

// SE LLENAN TODAS LAS RANURAS LIBRES, NO UNA POR SONDEO.
//
// Antes cada vuelta reclamaba como mucho un trabajo, así que arrancar cuatro en
// paralelo tardaba cuatro sondeos —doce segundos— aunque hubiera cuatro esperando
// desde hacía rato. Con la cola llena eso es capacidad ociosa por diseño.
async function tick(): Promise<void> {
  while (running < MAX_CONCURRENT_JOBS) {
    const job = await claimNextJob();
    if (!job) return;              // no queda nada en cola
    running++;
    void processJob(job).finally(() => { running--; });
  }
}

// Idempotent: Next re-imports modules on hot reload, and two loops would double
// every poll. Safe to call from anywhere.
export function startWorker(): void {
  if (started) return;
  started = true;

  void (async () => {
    await initDb().catch(() => {});
    if (!internalSecret()) {
      console.warn("[worker] INTERNAL_JOB_SECRET no configurado — el worker no puede autenticarse contra las rutas. Producción en background deshabilitada.");
      started = false;
      return;
    }
    // Anything left 'processing' by a process that is no longer alive.
    const revived = await requeueStaleJobs(JOB_STALE_SECONDS).catch(() => 0);
    if (revived) console.log(`[worker] ${revived} trabajo(s) huérfano(s) recuperados al arrancar`);
    console.log(`[worker] iniciado — hasta ${MAX_CONCURRENT_JOBS} trabajos en paralelo`);

    let sweeps = 0;
    for (;;) {
      try {
        await tick();
        // Sweep for cold heartbeats every ~2 minutes, not every poll.
        if (++sweeps % Math.max(1, Math.round(120_000 / JOB_POLL_MS)) === 0) {
          await requeueStaleJobs(JOB_STALE_SECONDS).catch(() => 0);
        }
      } catch (e) {
        console.error("[worker] tick error:", e instanceof Error ? e.message.slice(0, 160) : e);
      }
      await sleep(JOB_POLL_MS);
    }
  })();
}

export async function workerStats(): Promise<{ running: number; processing: number; started: boolean }> {
  return { running, processing: await countProcessingJobs().catch(() => 0), started };
}
