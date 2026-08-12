// ─── Continuity gate ─────────────────────────────────────────────────────────
// Runs AFTER the images exist and BEFORE a single cent goes to a video model.
//
// The failure this exists to catch already happened here: the story AI drifted
// from the cast names, portrait matching found nothing, and every scene collapsed
// onto scene 1's image. The pipeline animated six copies of the same frame, paid
// for all of them, and the user found out by watching the finished video.
//
// Everything below is measured from the pixels with FFmpeg — no model call, no
// cost, a few hundred milliseconds. A gate that costs money to run is a gate
// nobody leaves on.

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

export type IssueSeverity = "blocking" | "warning";

export interface ContinuityIssue {
  severity: IssueSeverity;
  code: "duplicate_scenes" | "palette_outlier" | "black_frame" | "missing_image" | "face_drift";
  scenes: number[];
  message: string;
}

export interface ContinuityReport {
  ok: boolean;                  // false when anything BLOCKING was found
  issues: ContinuityIssue[];
  checked: number;
}

// ── Perceptual fingerprint ───────────────────────────────────────────────────
// 8x8 grayscale average hash. Crude on purpose: it is meant to answer "is this
// the same picture?", not "are these similar pictures". Two genuinely different
// scenes of the same character in the same set still land 15-25 bits apart.

async function fingerprint(dir: string, url: string, i: number): Promise<{ hash: bigint; mean: number; rgb: [number, number, number] } | null> {
  try {
    const src = join(dir, `s${i}.img`);
    const res = await fetch(url);
    if (!res.ok) return null;
    writeFileSync(src, Buffer.from(await res.arrayBuffer()));

    const grayPath = join(dir, `s${i}.gray`);
    await exec(FFMPEG, ["-v", "error", "-i", src, "-vf", "scale=8:8,format=gray", "-f", "rawvideo", "-y", grayPath]);
    const g = readFileSync(grayPath);
    if (g.length < 64) return null;

    let sum = 0;
    for (let p = 0; p < 64; p++) sum += g[p]!;
    const mean = sum / 64;
    let hash = 0n;
    for (let p = 0; p < 64; p++) if (g[p]! > mean) hash |= 1n << BigInt(p);

    // Average colour, for palette drift. One pixel is enough — it IS the average.
    const rgbPath = join(dir, `s${i}.rgb`);
    await exec(FFMPEG, ["-v", "error", "-i", src, "-vf", "scale=1:1,format=rgb24", "-f", "rawvideo", "-y", rgbPath]);
    const c = readFileSync(rgbPath);
    return { hash, mean, rgb: [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0] };
  } catch {
    return null;
  }
}

function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)] ?? 0;
};

// ── ¿ES LA MISMA PERSONA? ────────────────────────────────────────────────────
// La compuerta de píxeles detecta imágenes IGUALES. No detecta personas
// DISTINTAS — y ese es el defecto que más se nota al mirar un video: la
// protagonista cambia de cara a mitad de la historia.
//
// Un hash perceptual nunca va a resolverlo: dos fotos de dos mujeres distintas en
// el mismo cuarto están, en píxeles, tan lejos como dos fotos legítimas de la
// misma. Hace falta mirar las caras, y para eso hace falta un modelo que vea.
//
// Cuesta unos centavos por video contra los $0.65 de cada clip que se evita
// generar mal. Corre en UNA sola llamada con todas las anclas juntas: comparar de
// a pares multiplicaría el costo sin agregar información.
const FACE_GATE = (process.env.FACE_GATE ?? "warn").toLowerCase();

async function miniatura(dir: string, url: string, i: number): Promise<string | null> {
  try {
    const src = join(dir, `f${i}.img`);
    const res = await fetch(url);
    if (!res.ok) return null;
    writeFileSync(src, Buffer.from(await res.arrayBuffer()));
    // 384px de ancho alcanza para juzgar una cara y baja mucho el costo de tokens.
    const out = join(dir, `f${i}.jpg`);
    await exec(FFMPEG, ["-v", "error", "-i", src, "-vf", "scale=384:-2", "-q:v", "6", "-y", out]);
    return readFileSync(out).toString("base64");
  } catch { return null; }
}

async function revisarCaras(
  dir: string,
  imagenes: Array<{ scene: number; url: string }>,
): Promise<{ scenes: number[]; message: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (FACE_GATE === "off" || !apiKey || imagenes.length < 2) return null;

  // Tope de gasto: con 8 miniaturas ya se ve si el reparto se sostiene.
  const lote = imagenes.slice(0, 8);
  const b64 = await Promise.all(lote.map((im, i) => miniatura(dir, im.url, i)));
  const utiles = lote
    .map((im, i) => ({ ...im, data: b64[i] }))
    .filter((x): x is { scene: number; url: string; data: string } => Boolean(x.data));
  if (utiles.length < 2) return null;

  const content: Array<Record<string, unknown>> = [];
  utiles.forEach((u, i) => {
    content.push({ type: "text", text: `Imagen ${i + 1} (escena ${u.scene}):` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: u.data } });
  });
  content.push({
    type: "text",
    text:
      "Estas imágenes son fotogramas de UN MISMO microdrama. Los personajes deben ser las mismas " +
      "personas en todas.\n\n" +
      "Decime si algún personaje CAMBIA DE PERSONA entre imágenes: otra cara, otra edad, otro color " +
      "o largo de pelo, otro tono de piel. Cambios de ropa, de peinado, de luz, de ángulo o de " +
      "expresión NO cuentan — solo si claramente es OTRO ser humano.\n\n" +
      "Ante la duda, respondé que es consistente: marcar de más obliga a regenerar un video que " +
      "estaba bien.\n\n" +
      'Respondé SOLO este JSON: {"consistente": true|false, "imagenes_raras": [números], "motivo": "una frase"}',
  });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 300,
        system: "Respondé SOLO con JSON válido, sin markdown.",
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) {
      console.warn("[caras] no se pudo revisar:", res.status, (await res.text()).slice(0, 120));
      return null;
    }
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "{}";
    const m = /\{[\s\S]*\}/.exec(raw);
    const veredicto = JSON.parse(m ? m[0] : "{}") as
      { consistente?: boolean; imagenes_raras?: number[]; motivo?: string };

    if (veredicto.consistente !== false) {
      console.log(`[caras] ${utiles.length} imágenes revisadas — el reparto se sostiene`);
      return null;
    }
    const escenas = (veredicto.imagenes_raras ?? [])
      .map((n) => utiles[n - 1]?.scene)
      .filter((n): n is number => typeof n === "number");
    return {
      scenes: escenas.length ? escenas : utiles.map((u) => u.scene),
      message:
        `Un personaje cambia de persona entre escenas${escenas.length ? ` (${escenas.join(", ")})` : ""}. ` +
        `${veredicto.motivo ?? ""} Animar así produce un video donde el protagonista tiene dos caras.`,
    };
  } catch (e) {
    console.warn("[caras] error:", e instanceof Error ? e.message.slice(0, 120) : e);
    return null;
  }
}

// ── The gate ─────────────────────────────────────────────────────────────────

export async function checkContinuity(
  scenes: Array<{ scene_number: number; image_url?: string | null }>,
): Promise<ContinuityReport> {
  const issues: ContinuityIssue[] = [];

  const missing = scenes.filter((s) => !s.image_url).map((s) => s.scene_number);
  if (missing.length) {
    issues.push({
      severity: "blocking",
      code: "missing_image",
      scenes: missing,
      message: `Faltan imágenes en ${missing.length} escena(s): ${missing.join(", ")}. Animar sin ellas produce un video incompleto.`,
    });
  }

  const withImages = scenes.filter((s) => s.image_url);
  if (withImages.length < 2) return { ok: !issues.some((i) => i.severity === "blocking"), issues, checked: withImages.length };

  const dir = join(tmpdir(), `vynavo_cont_${randomUUID()}`);
  try {
    mkdirSync(dir, { recursive: true });
    const prints = await Promise.all(
      withImages.map(async (s, i) => ({ scene: s.scene_number, fp: await fingerprint(dir, s.image_url!, i) })),
    );
    const usable = prints.filter((p) => p.fp);

    // 1. NEAR-DUPLICATES — the bug that burned money. Distinct scenes should never
    //    be pixel-twins; when they are, portrait matching collapsed.
    const DUPLICATE_BITS = 6;
    const dupes: number[] = [];
    for (let a = 0; a < usable.length; a++) {
      for (let b = a + 1; b < usable.length; b++) {
        if (hamming(usable[a]!.fp!.hash, usable[b]!.fp!.hash) <= DUPLICATE_BITS) {
          dupes.push(usable[a]!.scene, usable[b]!.scene);
        }
      }
    }
    if (dupes.length) {
      const uniq = [...new Set(dupes)].sort((x, y) => x - y);
      issues.push({
        severity: "blocking",
        code: "duplicate_scenes",
        scenes: uniq,
        message: `Las escenas ${uniq.join(", ")} tienen prácticamente la misma imagen. Suele significar que el reparto no coincidió con los personajes del guion y todas heredaron el mismo retrato.`,
      });
    }

    // 2. BLACK / EMPTY FRAMES — a failed generation that still returned a file.
    const dark = usable.filter((p) => p.fp!.mean < 8).map((p) => p.scene);
    if (dark.length) {
      issues.push({
        severity: "blocking",
        code: "black_frame",
        scenes: dark,
        message: `Escena(s) ${dark.join(", ")} salieron prácticamente en negro.`,
      });
    }

    // 3. PALETTE DRIFT — one scene lit or graded unlike every other. A warning,
    //    not a block: a deliberate flashback legitimately looks different.
    const dists = usable.map((p) => p.fp!.rgb);
    const medR = median(dists.map((c) => c[0]));
    const medG = median(dists.map((c) => c[1]));
    const medB = median(dists.map((c) => c[2]));
    const outliers = usable
      .filter((p) => {
        const [r, g, b] = p.fp!.rgb;
        return Math.hypot(r - medR, g - medG, b - medB) > 90;
      })
      .map((p) => p.scene);
    if (outliers.length && outliers.length < usable.length) {
      issues.push({
        severity: "warning",
        code: "palette_outlier",
        scenes: outliers,
        message: `Escena(s) ${outliers.join(", ")} tienen una paleta muy distinta al resto. Puede ser intencional.`,
      });
    }

    // Reading ZERO images is not a pass. It happened: every scene had a URL, but
    // R2_PUBLIC_URL had been misconfigured when those rows were written, so none
    // could be fetched — and the gate reported "sin bloqueos" on nothing at all,
    // letting the run proceed to a render that could never work.
    // 4. ¿ES LA MISMA PERSONA? Lo único de esta compuerta que no se puede resolver
    //    con píxeles, y el defecto que más se nota al mirar el video.
    //
    //    Arranca en "warn": bloquear de entrada haría que un falso positivo tire
    //    abajo un video que estaba bien, y todavía no tenemos medido cada cuánto
    //    se equivoca. Con FACE_GATE=block pasa a frenar antes de gastar en clips,
    //    que es para lo que existe.
    const caras = await revisarCaras(dir, withImages.map((s) => ({ scene: s.scene_number, url: s.image_url! })));
    if (caras) {
      issues.push({
        severity: FACE_GATE === "block" ? "blocking" : "warning",
        code: "face_drift",
        scenes: caras.scenes,
        message: caras.message,
      });
    }

    if (withImages.length > 0 && usable.length === 0) {
      issues.push({
        severity: "blocking",
        code: "missing_image",
        scenes: withImages.map((s) => s.scene_number),
        message: `Ninguna de las ${withImages.length} imágenes se pudo leer. Sus URLs guardadas son inválidas o inaccesibles — revisá R2_PUBLIC_URL y volvé a generarlas.`,
      });
    }

    return { ok: !issues.some((i) => i.severity === "blocking"), issues, checked: usable.length };
  } catch {
    // A gate that breaks must not block production — it would turn a diagnostic
    // into an outage. Fail open, loudly.
    console.error("[continuity] check failed — dejando pasar");
    return { ok: true, issues, checked: 0 };
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  }
}

// Thrown when the gate blocks. Distinct from a normal pipeline error because
// retrying is pointless: image generation is idempotent, so a second attempt
// finds the exact same broken frames and fails identically. The worker treats
// this as terminal immediately instead of burning three attempts.
export class ContinuityError extends Error {
  readonly issues: ContinuityIssue[];
  constructor(report: ContinuityReport) {
    const blocking = report.issues.filter((i) => i.severity === "blocking");
    super(blocking.map((i) => i.message).join(" · ") || "Falló la revisión de continuidad");
    this.name = "ContinuityError";
    this.issues = report.issues;
  }
}
