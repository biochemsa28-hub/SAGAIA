// ─── Storyboard-grid shots ───────────────────────────────────────────────────
// Instead of asking the edit model for each alternate camera setup in its OWN
// call, we ask for ONE 2x2 storyboard sheet containing all of them and slice it
// locally with FFmpeg.
//
// Why this is better, measured on a real A/B (same scene, same framings):
//   · 1 fal call instead of 3        → $0.03 vs $0.09, 13s vs 30s
//   · The panels are composed TOGETHER in a single diffusion pass, so wardrobe,
//     lighting and colour grade are identical across shots. Separate calls each
//     start from scratch and drift — in the A/B the dress changed length between
//     shots and one frame grew an extra hand.
//   · The framings actually differ. Asked separately, the model kept returning
//     near-identical medium shots; asked as a sheet, it gave a true wide, a true
//     medium and a true insert.
// What it costs: each panel is ~1/2 the width of a full render, measured ~10%
// softer (blurdetect 8.24 → 9.08). That is why this is used ONLY for the extra
// cut-away shots — the scene's primary image stays a full-resolution render,
// because that's the frame the hero animation and most of the screen time use.
//
// Any failure (model returns an irregular sheet, FFmpeg missing, gutters not
// detectable) returns [] so the caller can fall back to the per-shot path.

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { fal } from "@fal-ai/client";
import { getStyleConfig } from "./style-presets";
import { uploadBuffer } from "@/services/storage";
import { SHOT_FRAMINGS } from "@/lib/config";

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

// Where each panel sits in reading order. The model is told the layout explicitly
// because a sheet we can't slice deterministically is worthless.
const PANEL_POSITIONS = ["Top-left", "Top-right", "Bottom-left", "Bottom-right"] as const;

// Panels the caller didn't ask for still need a UNIQUE description — repeating a
// framing to pad the sheet makes the model add rows (it read the repeat as "more
// shots wanted" and returned a 2x4). Drawn from the same coverage list production
// uses, so there is one source of truth for what a shot looks like.
function fourDistinctFramings(requested: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (f: string) => {
    const key = f.replace(/^,\s*/, "").trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };
  requested.forEach(add);
  SHOT_FRAMINGS.slice(1).forEach(add);
  add(", low-angle medium shot, the character seen from slightly below, same moment and lighting");
  add(", high-angle shot looking down on the character, same moment and lighting");
  return out.slice(0, 4);
}

// ── Gutter detection ─────────────────────────────────────────────────────────
// A gutter is a thin band that is much darker than the picture on either side of
// it. Absolute thresholds fail on horror scenes (the whole frame is dark), so we
// compare each row/column to its neighbours ~5px away instead.

function meanProfile(gray: Buffer, w: number, h: number): { rows: number[]; cols: number[] } {
  const rows = new Array<number>(h).fill(0);
  const cols = new Array<number>(w).fill(0);
  for (let y = 0; y < h; y++) {
    let s = 0;
    const off = y * w;
    for (let x = 0; x < w; x++) {
      const v = gray[off + x]!;
      s += v;
      cols[x] = cols[x]! + v;
    }
    rows[y] = s / w;
  }
  for (let x = 0; x < w; x++) cols[x] = cols[x]! / h;
  return { rows, cols };
}

// Contiguous runs that sit far below their surroundings — the gutters and the
// outer letterbox bars.
function dipRuns(p: number[]): Array<[number, number]> {
  const gap = 5;
  const isDip = (i: number) => {
    if (i < gap || i >= p.length - gap) return false;
    const neighbour = (p[i - gap]! + p[i + gap]!) / 2;
    return p[i]! < neighbour * 0.45;
  };
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i < p.length; i++) {
    if (isDip(i)) { if (start < 0) start = i; }
    else if (start >= 0) { runs.push([start, i - 1]); start = -1; }
  }
  if (start >= 0) runs.push([start, p.length - 1]);

  // A single gutter often reads as two runs, because its centre pixels sit right
  // between two panels and the relative test dips out for a few columns. Merge
  // anything closer together than 2% of the axis — real panels are never that
  // thin, so this can't glue two genuine gutters into one.
  const maxGap = Math.max(4, Math.round(p.length * 0.02));
  const merged: Array<[number, number]> = [];
  for (const run of runs) {
    const prev = merged[merged.length - 1];
    if (prev && run[0] - prev[1] <= maxGap) prev[1] = run[1];
    else merged.push([...run] as [number, number]);
  }
  return merged;
}

// The single interior gutter that splits the sheet in half.
//
// "Interior" and "single" both matter. The model sometimes returns a 4x4 sheet
// instead of a 2x2 — that sheet ALSO has a centre split, so checking only the
// middle happily accepts it and every "panel" we cut is really four tiny panels
// with a gutter cross through it. (That shipped once. The pixels caught it.)
// So: count every gutter inside the picture area. Exactly one → a true 2x2.
function centreSplit(
  runs: Array<[number, number]>,
  len: number,
  bounds: [number, number],
): [number, number] | null {
  const margin = len * 0.05;
  const interior = runs.filter(([a, b]) => a > bounds[0] + margin && b < bounds[1] - margin);
  if (interior.length !== 1) return null;
  const only = interior[0]!;
  // And it has to actually be in the middle — a dark doorway two thirds across
  // is not a gutter.
  return Math.abs((only[0] + only[1]) / 2 - len / 2) < len * 0.12 ? only : null;
}

// Trim the outer letterbox: first and last index that carries real picture.
function contentBounds(p: number[]): [number, number] {
  const sorted = [...p].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const threshold = Math.max(6, median * 0.35);
  let first = 0;
  let last = p.length - 1;
  while (first < p.length && p[first]! < threshold) first++;
  while (last > first && p[last]! < threshold) last--;
  return [first, last];
}

export interface PanelRect { x: number; y: number; w: number; h: number }

function panelRects(gray: Buffer, w: number, h: number): PanelRect[] | null {
  const { rows, cols } = meanProfile(gray, w, h);
  const [x0, x1] = contentBounds(cols);
  const [y0, y1] = contentBounds(rows);

  const vSplit = centreSplit(dipRuns(cols), w, [x0, x1]);
  const hSplit = centreSplit(dipRuns(rows), h, [y0, y1]);
  if (!vSplit || !hSplit) return null;

  const left = { a: x0, b: vSplit[0] - 1 };
  const right = { a: vSplit[1] + 1, b: x1 };
  const top = { a: y0, b: hSplit[0] - 1 };
  const bottom = { a: hSplit[1] + 1, b: y1 };

  const widths = [left.b - left.a + 1, right.b - right.a + 1];
  const heights = [top.b - top.a + 1, bottom.b - bottom.a + 1];
  // Reject a lopsided sheet — slicing it would cut faces in half.
  const balanced = (n: number[]) => Math.min(...n) > 0 && Math.min(...n) / Math.max(...n) > 0.85;
  if (!balanced(widths) || !balanced(heights)) return null;
  if (Math.min(...widths) < 200 || Math.min(...heights) < 200) return null;

  const rects: PanelRect[] = [];
  for (const row of [top, bottom]) {
    for (const col of [left, right]) {
      // Even dimensions keep every downstream encoder happy.
      rects.push({
        x: col.a,
        y: row.a,
        w: (col.b - col.a + 1) & ~1,
        h: (row.b - row.a + 1) & ~1,
      });
    }
  }
  return rects;
}

// ── Public entry points ──────────────────────────────────────────────────────

// Generate ONE sheet and confirm it is a real, sliceable 2x2. Both consumers need
// that guarantee for different reasons: the slicer needs to cut it, and the video
// model can only play it as a shot sequence if the panels are actually four equal
// rectangles. An irregular sheet is useless to both.
async function generateSheet(params: {
  basePrompt: string;
  primaryImageUrl: string;
  framings: string[];
  niche: string;
  visualStyle: string;
}): Promise<{ url: string; rects: PanelRect[] } | null> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) return null;
  const style = getStyleConfig(params.niche, params.visualStyle);
  fal.config({ credentials: apiKey });

  const panelFramings = fourDistinctFramings(params.framings);
  const panelLines = PANEL_POSITIONS.map((pos, i) => {
    const framing = panelFramings[i] ?? panelFramings[panelFramings.length - 1]!;
    return `${pos}: the same moment, ${framing.replace(/^,s*/, "")}.`;
  }).join(" ");

  const prompt =
    "A storyboard sheet divided into EXACTLY FOUR equal rectangular panels in a strict 2x2 grid: " +
    "EXACTLY two columns and EXACTLY two rows — four panels in total, never six, never nine, " +
    "never sixteen. All four the SAME size, split exactly down the middle " +
    "horizontally and vertically, separated by a thin solid black gutter. " +
    "Every panel shows the EXACT SAME character, wardrobe, location and lighting as the reference " +
    `image — same face, same clothes, same colour grade. ${params.basePrompt}. ${panelLines} ` +
    "No text, no labels, no numbers, no captions, no panel borders other than the black gutter. " +
    style.promptSuffix;

  let sheetUrl: string | null = null;
  try {
    // The sheet gets its OWN model, separate from CHARACTER_REF_MODEL (which draws
    // portraits and bibles, where nano-banana is fine). Measured layout compliance
    // on 5-6 attempts each, same prompt: kontext/max 4/6 with a correct vertical
    // sheet · nano-banana 3/9 · kontext 2/6 · qwen-image-edit 1/6 · seededit v3
    // sliced 5/6 but returned LANDSCAPE panels 4 of those times, unusable at 9:16.
    const model = process.env.SHOT_GRID_MODEL ?? "fal-ai/flux-pro/kontext/max";
    // nano-banana / gemini / qwen take an image_urls ARRAY; kontext + seededit take
    // a single image_url. Sending the wrong shape silently returns a plain t2i result.
    const multiImage = /nano-banana|gemini|qwen/i.test(model);
    const input: Record<string, unknown> = multiImage
      ? { prompt, image_urls: [params.primaryImageUrl], num_images: 1, enable_safety_checker: false }
      : { prompt, image_url: params.primaryImageUrl, num_images: 1, enable_safety_checker: false, safety_tolerance: "6" };
    const result = await fal.subscribe(model, { input, logs: false }) as Record<string, unknown>;
    const data = (result?.["data"] ?? result) as Record<string, unknown>;
    const images = data?.["images"] as Array<Record<string, unknown>> | undefined;
    sheetUrl = (images?.[0]?.["url"] as string) ?? null;
  } catch (e) {
    console.error("[shot-grid] generation failed:", e instanceof Error ? e.message.slice(0, 160) : e);
    return null;
  }
  if (!sheetUrl) return null;

  const dir = join(tmpdir(), `vynavo_sheet_${randomUUID()}`);
  try {
    mkdirSync(dir, { recursive: true });
    const gridPath = join(dir, "grid.png");
    const res = await fetch(sheetUrl);
    if (!res.ok) return null;
    writeFileSync(gridPath, Buffer.from(await res.arrayBuffer()));

    const { stdout } = await exec(FFPROBE, [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height", "-of", "csv=p=0", gridPath,
    ]);
    const [w, h] = stdout.trim().split(",").map(Number);
    if (!w || !h) return null;

    const rawPath = join(dir, "gray.raw");
    await exec(FFMPEG, ["-v", "error", "-i", gridPath, "-vf", "format=gray", "-f", "rawvideo", "-y", rawPath]);
    const gray = readFileSync(rawPath);
    if (gray.length < w * h) return null;

    const rects = panelRects(gray, w, h);
    if (!rects) {
      console.warn(`[shot-grid] irregular sheet (${w}x${h}) — descartada. hoja: ${sheetUrl}`);
      return null;
    }
    return { url: sheetUrl, rects };
  } catch (e) {
    console.error("[shot-grid] validation failed:", e instanceof Error ? e.message.slice(0, 160) : e);
    return null;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  }
}

// The sheet itself, unsliced — what the hook block feeds to the video model.
export async function generateShotSheet(params: {
  basePrompt: string;
  primaryImageUrl: string;
  framings: string[];
  niche: string;
  visualStyle: string;
}): Promise<string | null> {
  const sheet = await generateSheet(params);
  return sheet?.url ?? null;
}

// The sheet cut into individual shot images. Returns [] on any problem so the
// caller falls back to per-shot generation.
export async function generateShotGrid(params: {
  basePrompt: string;
  primaryImageUrl: string;
  framings: string[];        // one per EXTRA shot, in cut order (max 4)
  niche: string;
  visualStyle: string;
}): Promise<{ shots: string[]; sheetUrl: string | null }> {
  if (!params.framings.length) return { shots: [], sheetUrl: null };
  const sheet = await generateSheet(params);
  if (!sheet) return { shots: [], sheetUrl: null };

  const wanted = Math.min(4, params.framings.length);
  const dir = join(tmpdir(), `vynavo_slice_${randomUUID()}`);
  try {
    mkdirSync(dir, { recursive: true });
    const gridPath = join(dir, "grid.png");
    const res = await fetch(sheet.url);
    if (!res.ok) return { shots: [], sheetUrl: sheet.url };
    writeFileSync(gridPath, Buffer.from(await res.arrayBuffer()));

    const urls: string[] = [];
    for (let i = 0; i < wanted; i++) {
      const r = sheet.rects[i]!;
      const out = join(dir, `panel_${i}.jpg`);
      await exec(FFMPEG, [
        "-v", "error", "-i", gridPath,
        "-vf", `crop=${r.w}:${r.h}:${r.x}:${r.y}`,
        "-q:v", "2", "-y", out,
      ]);
      const { url } = await uploadBuffer({
        buffer: readFileSync(out), ext: "jpg", contentType: "image/jpeg", folder: "images",
      });
      urls.push(url);
    }
    console.log(`[shot-grid] 1 llamada → ${urls.length} planos (${sheet.rects[0]!.w}x${sheet.rects[0]!.h} c/u)`);
    // The sheet travels with the shots: the hook block needs the UNSLICED version,
    // and buying it twice for the same scene is pure waste.
    return { shots: urls, sheetUrl: sheet.url };
  } catch (e) {
    console.error("[shot-grid] slicing failed:", e instanceof Error ? e.message.slice(0, 160) : e);
    return { shots: [], sheetUrl: sheet.url };
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  }
}
