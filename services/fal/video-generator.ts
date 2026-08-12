import { fal } from "@fal-ai/client";
import { writeFileSync, mkdirSync } from "fs";
import { join, isAbsolute, resolve } from "path";

export interface VideoJob {
  sceneNumber: number;
  requestId: string;
  status: "queued" | "done" | "failed";
  url?: string;
  error?: string;
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
// 1080p por defecto: el video que publicamos ES 1080×1920, así que generar a
// 720p garantizaba un escalado en el montaje sobre lo único que el espectador
// mira de cerca, la cara. Se puede bajar con VIDEO_RESOLUTION=720p cuando el
// presupuesto mande.
//
// Y se VALIDA: antes, un valor mal escrito ("1080", "HD", "1080P ") pasaba tal
// cual al modelo, que lo rechazaba o lo ignoraba, y el video salía en 720p sin
// que nada lo dijera. Un error de configuración que solo se nota mirando el
// resultado terminado es el peor tipo de error.
const RESOLUCIONES = new Set(["480p", "720p", "1080p"]);
const VIDEO_RESOLUTION = (() => {
  const pedida = (process.env.VIDEO_RESOLUTION ?? "1080p").trim().toLowerCase();
  if (RESOLUCIONES.has(pedida)) return pedida;
  console.warn(`[video] VIDEO_RESOLUTION="${process.env.VIDEO_RESOLUTION}" no es válida (480p|720p|1080p) — se usa 1080p`);
  return "1080p";
})();

// Cinematography prefix prepended to every animation_prompt so Seedance
// consistently generates film-quality motion even when the AI-generated prompt
// is brief. Acts as a "DP style card" for the whole project.
const CINEMATIC_PREFIX =
  "Professional cinematic shot. Camera moves with intention and emotional weight. " +
  "Characters interact naturally with their environment — touching surfaces, reacting to light, " +
  "breathing visibly. Hair and fabric move with physics. Fine details alive: " +
  "dust particles, flickering light, steam, rain. Motion is smooth and deliberate. ";

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
  }>;
}): Promise<VideoJob[]> {
  fal.config({ credentials: getApiKey() });

  // Google Veo 3 uses a different param shape (generate_audio, string duration) and
  // produces NATIVE synchronized audio — the premium "Cinema" engine. Detected by name.
  const isVeo3 = /veo3|veo-3|veo\/3/i.test(VIDEO_MODEL);

  // La resolución no aparecía en ningún log, así que llevábamos meses generando a
  // 720p para un video 1080×1920 sin que nada lo dijera. Una línea por lote.
  console.log(`[video] ${params.scenes.length} clip(s) a ${VIDEO_RESOLUTION} · modelo ${VIDEO_MODEL.split("/").pop()}`);

  const jobs: VideoJob[] = [];
  for (const scene of params.scenes) {
    try {
      // Seedance accepts a numeric duration (4–15s). Clamp to the scene length so
      // the clip covers the narration; Shotstack trims any excess.
      const duration = Math.min(15, Math.max(4, Math.round(scene.duration_seconds ?? 5)));
      const input: Record<string, unknown> = isVeo3
        ? {
            // Veo 3: cinematic motion + native ambient audio in one shot.
            prompt: CINEMATIC_PREFIX + scene.animation_prompt,
            image_url: scene.image_url,
            aspect_ratio: "9:16",
            generate_audio: true,
            resolution: VIDEO_RESOLUTION === "1080p" ? "1080p" : "720p",
            duration: "8s",                 // Veo 3 standard clip length
          }
        : {
            prompt: CINEMATIC_PREFIX + scene.animation_prompt,
            image_url: scene.image_url,
            resolution: VIDEO_RESOLUTION,
            aspect_ratio: "9:16",
            // Seedance takes duration as a STRING enum capped at 12 — sending a
            // number, or anything above 12, is a flat 422. HOOK_BLOCK_SECONDS was
            // set to 15 and would have rejected every clip.
            duration: String(Math.min(12, Math.max(4, duration))),
            // The image models already run with the checker off; leaving it ON here
            // meant every frame was generated uncensored and then sanitised by the
            // video pass. That inconsistency is what flattens dramatic beats —
            // grief, fear, violence-adjacent tension and intimacy all trip
            // conservative false positives even when nothing explicit is involved.
            enable_safety_checker: SAFETY_CHECKER_ON,
            ...(scene.end_image_url ? { end_image_url: scene.end_image_url } : {}),
            ...(scene.generate_audio !== undefined ? { generate_audio: scene.generate_audio } : {}),
          };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.queue.submit as any)(VIDEO_MODEL, { input }) as { request_id: string };

      jobs.push({
        sceneNumber: scene.scene_number,
        requestId: result.request_id,
        status: "queued",
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

export async function checkVideoJob(requestId: string): Promise<{
  status: "queued" | "in_progress" | "completed" | "failed";
  url?: string;
  error?: string;
}> {
  fal.config({ credentials: getApiKey() });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = await (fal.queue.status as any)(
      VIDEO_MODEL,
      { requestId, logs: false }
    ) as { status: string };

    if (status.status === "COMPLETED") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal.queue.result as any)(
        VIDEO_MODEL,
        { requestId }
      ) as Record<string, unknown>;

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
