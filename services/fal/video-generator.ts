import { fal } from "@fal-ai/client";
import { logPayload } from "./log-payload";
import { writeFileSync, mkdirSync } from "fs";
import { join, isAbsolute, resolve } from "path";
import {
  registrarProveedor, encolarClip, consultarClip, resumenDeProveedores,
  type TipoDePlano, type EstadoDeClip,
} from "@/services/video/router";
import { costoClipSeedance, costoClipReferencias } from "@/lib/costs";

export interface VideoJob {
  sceneNumber: number;
  requestId: string;
  status: "queued" | "done" | "failed";
  url?: string;
  error?: string;
  /** Con qué modelo se encoló — collect necesita preguntarle al MISMO. */
  model?: string;
}

export interface VideoGenerationResult {
  success: boolean;
  filePath?: string;
  url?: string;
  durationMs?: number;
  fileSizeBytes?: number;
  error?: string;
  mock?: boolean;
}

export interface SceneVideoResult extends VideoGenerationResult {
  sceneNumber: number;
}

function getStorageDir(): string {
  if (process.env.VERCEL) return "/tmp/storage";
  const raw = process.env.STORAGE_PATH ?? "./storage";
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

function getApiKey(): string {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY not set");
  return key;
}

// Premium animation model — Seedance Pro by default (sharp motion, native 9:16,
// 720p). Override via VIDEO_MODEL (e.g. a Seedance lite/2.0 variant or Kling).
// v1.5, not v1 pro. Tested side by side on the same storyboard sheet: v1 pro
// animated the grid AS a grid for four seconds and then invented an unrelated
// scene; v1.5 cut between the panels as full-frame shots, keeping the character.
// That difference is what makes the hook block possible.
// Off by default to match the image pipeline. Set FAL_SAFETY_CHECKER=on to restore
// the provider's filter — worth doing if a downstream platform starts rejecting
// uploads, since their moderation is stricter than fal's either way.
const SAFETY_CHECKER_ON = (process.env.FAL_SAFETY_CHECKER ?? "off").toLowerCase() === "on";

const VIDEO_MODEL = process.env.VIDEO_MODEL ?? "fal-ai/bytedance/seedance/v1.5/pro/image-to-video";
// 720p por defecto. Seedance cobra por (alto × ancho × fps × segundos), así que
// 1080p cuesta 2.25× por el mismo clip: a 1080p un video de 30s se comía el 77%
// del precio de venta. En un feed vertical de teléfono, esa diferencia se ve
// mucho menos que la diferencia entre publicar y no poder pagarlo. Se sube con
// VIDEO_RESOLUTION=1080p cuando el margen lo permita.
//
// Y se VALIDA: antes, un valor mal escrito ("1080", "HD", "1080P ") pasaba tal
// cual al modelo, que lo rechazaba o lo ignoraba, y el video salía en 720p sin
// que nada lo dijera. Un error de configuración que solo se nota mirando el
// resultado terminado es el peor tipo de error.
// El endpoint de referencias: hasta 30 imágenes vía @Image1..N, cortes propios y
// 1080p. Se usa SOLO en los picos de contacto físico — cuesta más por segundo.
const REFERENCE_VIDEO_MODEL = process.env.REFERENCE_VIDEO_MODEL ?? "bytedance/seedance-2.0/reference-to-video";

const RESOLUCIONES = new Set(["480p", "720p", "1080p"]);
const VIDEO_RESOLUTION = (() => {
  const pedida = (process.env.VIDEO_RESOLUTION ?? "720p").trim().toLowerCase();
  if (RESOLUCIONES.has(pedida)) return pedida;
  console.warn(`[video] VIDEO_RESOLUTION="${process.env.VIDEO_RESOLUTION}" no es válida (480p|720p|1080p) — se usa 720p`);
  return "720p";
})();

// Cinematography prefix prepended to every animation_prompt so Seedance
// consistently generates film-quality motion even when the AI-generated prompt
// is brief. Acts as a "DP style card" for the whole project.
const CINEMATIC_PREFIX =
  "Professional cinematic shot. Camera moves with intention and emotional weight. " +
  "Characters interact naturally with their environment — touching surfaces, reacting to light, " +
  "breathing visibly. Hair and fabric move with physics. Fine details alive: " +
  "dust particles, flickering light, steam, rain. Motion is smooth and deliberate. ";

// ─── Los dos proveedores de fal, registrados en el router ────────────────────
// Son dos COLAS distintas del mismo proveedor, y siempre lo fueron: preguntar el
// estado de un clip de referencias en la cola de image-to-video es un 404. Antes
// eso se manejaba con un `if` a mano; ahora cada cola se declara una vez, con lo
// que sirve, lo que cuesta y cómo se le pregunta.

const falListo = () => Boolean(getApiKey());

// Consultar es idéntico en las dos colas salvo por el modelo.
async function consultarEnFal(modelo: string, requestId: string): Promise<EstadoDeClip> {
  fal.config({ credentials: getApiKey() });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = await (fal.queue.status as any)(modelo, { requestId, logs: false }) as { status: string };
    if (status.status === "COMPLETED") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.queue.result as any)(modelo, { requestId }) as Record<string, unknown>;
      const data = (result?.["data"] ?? result) as Record<string, unknown>;
      const video = data?.["video"] as { url: string } | undefined;
      return { status: "completed", url: video?.url };
    }
    if (status.status === "FAILED") return { status: "failed", error: "Video job failed" };
    if (status.status === "IN_PROGRESS") return { status: "in_progress" };
    return { status: "queued" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

// Planos normales: Seedance 1.5 image-to-video. Barato y probado — es el caballo
// de tiro del video entero.
registrarProveedor({
  nombre: "fal-seedance",
  modelo: VIDEO_MODEL,
  sirvePara: ["borrador", "normal"],
  disponible: falListo,
  costoPorSegundo: (resolucion) => costoClipSeedance({ segundos: 1, resolucion, conAudio: true }),
  async enviar(p) {
    fal.config({ credentials: getApiKey() });
    const isVeo3 = /veo3|veo-3|veo\/3/i.test(VIDEO_MODEL);
    const duracion = String(Math.min(12, Math.max(4, Math.round(p.segundos))));
    const input: Record<string, unknown> = isVeo3
      ? {
          prompt: CINEMATIC_PREFIX + p.prompt,
          image_url: p.imageUrl,
          aspect_ratio: "9:16",
          generate_audio: true,
          resolution: p.resolucion === "1080p" ? "1080p" : "720p",
          duration: "8s",
        }
      : {
          prompt: CINEMATIC_PREFIX + p.prompt,
          image_url: p.imageUrl,
          resolution: p.resolucion,
          aspect_ratio: "9:16",
          // Seedance toma la duración como cadena y rechaza cualquier cosa por
          // encima de 12 con un 422 seco.
          duration: duracion,
          enable_safety_checker: SAFETY_CHECKER_ON,
          ...(p.endImageUrl ? { end_image_url: p.endImageUrl } : {}),
          ...(p.generarAudio !== undefined ? { generate_audio: p.generarAudio } : {}),
        };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logPayload("clip·image-to-video", VIDEO_MODEL, input as Record<string, unknown>);
    const r = await (fal.queue.submit as any)(VIDEO_MODEL, { input }) as { request_id: string };
    return r.request_id;
  },
  consultar: (requestId) => consultarEnFal(VIDEO_MODEL, requestId),
});

// Picos de contacto: Seedance 2.0 reference-to-video. Cuesta ~6x por segundo y
// es el único que cierra un beso — image-to-video interpola desde una foto que
// no lo contiene y siempre deja el centímetro. Se paga solo donde no puede
// fallar.
registrarProveedor({
  nombre: "fal-referencias",
  modelo: REFERENCE_VIDEO_MODEL,
  sirvePara: ["pico"],
  disponible: falListo,
  costoPorSegundo: () => costoClipReferencias(1),
  async enviar(p) {
    fal.config({ credentials: getApiKey() });
    const refs = (p.referenceImageUrls ?? []).slice(0, 4);
    if (!refs.length) throw new Error("un pico sin imágenes de referencia no puede generarse por referencias");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (fal.queue.submit as any)(REFERENCE_VIDEO_MODEL, {
      input: {
        prompt: p.prompt,
        image_urls: refs,
        resolution: p.resolucion === "480p" ? "480p" : p.resolucion, // 2.0 acepta 1080p
        duration: String(Math.min(12, Math.max(4, Math.round(p.segundos)))),
        aspect_ratio: "9:16",
        ...(p.generarAudio !== undefined ? { generate_audio: p.generarAudio } : {}),
      },
    }) as { request_id: string };
    console.log(`[video] escena ${p.escena}: contacto físico → reference-to-video (${refs.length} refs)`);
    return r.request_id;
  },
  consultar: (requestId) => consultarEnFal(REFERENCE_VIDEO_MODEL, requestId),
});

// ── AQUÍ ENTRA EL PROVEEDOR SIGUIENTE ────────────────────────────────────────
// BytePlus ModelArk vende el MISMO Seedance 2.0 a ~$0.151/s contra los ~$0.30/s
// que paga esta cuenta: la mitad, por el mismo modelo. Agregarlo es un
// registrarProveedor() más, con sirvePara ["pico"], y ponerlo primero con
// VIDEO_PROVIDER_ORDER="byteplus-referencias,fal-referencias".
//
// NO ESTÁ ESCRITO TODAVÍA, A PROPÓSITO. Su documentación se renderiza con
// JavaScript y no pude leer el contrato real de la API —ni el formato del cuerpo
// ni la forma de la respuesta—, y un cliente escrito de memoria contra una API
// que no vi es la clase de código que parece terminado y falla en producción.
// Requiere el paquete prepago de $30,10 y UNA prueba real; con las respuestas de
// verdad a la vista, son unas 40 líneas.

// ─── Submit jobs to fal queue (returns immediately) ───────────────────────────

export async function submitVideoJobs(params: {
  scenes: Array<{
    scene_number: number;
    animation_prompt: string;
    image_url: string;
    duration_seconds?: number;
    /** Pins the clip's LAST frame. A narrative block ends on the image the next
     *  block begins with, so consecutive generations chain instead of jumping. */
    end_image_url?: string;
    /** Native character speech instead of a silent clip we dub over. */
    generate_audio?: boolean;
    /** PICO DE CONTACTO (beso, abrazo). Con referencias, el clip se genera con
     *  reference-to-video: image-to-video interpola entre dos cuadros y NUNCA
     *  cierra un beso — medido tres veces, siempre deja el centímetro. El
     *  endpoint de referencias sí lo cerró en la prueba: labios juntos ~4s. */
    reference_image_urls?: string[];
  }>;
}): Promise<VideoJob[]> {
  // La resolución no aparecía en ningún log, así que llevábamos meses generando a
  // 720p para un video 1080×1920 sin que nada lo dijera. Una línea por lote.
  console.log(`[video] ${params.scenes.length} clip(s) a ${VIDEO_RESOLUTION} · proveedores: ${resumenDeProveedores()}`);

  const jobs: VideoJob[] = [];
  for (const scene of params.scenes) {
    try {
      // Seedance accepts a numeric duration (4–15s). Clamp to the scene length so
      // the clip covers the narration; Shotstack trims any excess.
      const duration = Math.min(15, Math.max(4, Math.round(scene.duration_seconds ?? 5)));

      // Traer imágenes de referencia ES la definición de un pico: sin ellas no
      // hay nada que el endpoint de referencias pueda ejecutar.
      const tipo: TipoDePlano = scene.reference_image_urls?.length ? "pico" : "normal";
      const { requestId, handle } = await encolarClip(tipo, {
        prompt: scene.animation_prompt,
        imageUrl: scene.image_url,
        endImageUrl: scene.end_image_url,
        referenceImageUrls: scene.reference_image_urls,
        segundos: duration,
        resolucion: VIDEO_RESOLUTION,
        generarAudio: scene.generate_audio,
        escena: scene.scene_number,
      });

      // El handle lleva el proveedor pegado: preguntarle el estado a otro es un
      // 404, y un 404 acá mata el video por tiempo de espera.
      jobs.push({
        sceneNumber: scene.scene_number,
        requestId,
        status: "queued",
        model: handle,
      });
    } catch (err) {
      jobs.push({
        sceneNumber: scene.scene_number,
        requestId: "",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return jobs;
}

// ─── Check status of a submitted job ─────────────────────────────────────────

export async function checkVideoJob(requestId: string, model?: string): Promise<EstadoDeClip> {
  // Se le pregunta a QUIEN encoló. El handle lo dice; si viene vacío —jobs de
  // antes del router— se cae al proveedor de planos normales, que es lo que
  // aquellos trabajos usaban.
  return consultarClip(requestId, model ?? armarHandleDelNormal());
}

function armarHandleDelNormal(): string {
  return `fal-seedance::${VIDEO_MODEL}`;
}

// ─── Download and save a completed video ─────────────────────────────────────

export async function downloadVideo(params: {
  url: string;
  projectId: string;
  sceneNumber: number;
}): Promise<{ filePath: string; fileSizeBytes: number }> {
  const response = await fetch(params.url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const dir = join(getStorageDir(), "videos", params.projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${params.sceneNumber}.mp4`);
  writeFileSync(filePath, buffer);

  return { filePath, fileSizeBytes: buffer.length };
}
