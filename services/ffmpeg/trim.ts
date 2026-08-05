// Trim the head off a finished clip, locally, for free.
//
// The hook block needs this: Seedance opens on the storyboard sheet as a GRID
// before it commits to the first full-frame shot, and those seconds sit exactly
// where retention is decided. Measured on real clips, the grid holds ~4.5s of a
// 10s generation — a production shipped with three seconds of visible grid at the
// very front because the cut was set to 2s from a single sample.
//
// This is a blunt fixed cut on purpose. Two attempts at detecting the boundary
// automatically both failed on real footage: the gutter detector reads crisp
// black lines that compression destroys, and comparing frames against the source
// sheet trips early because the grid ANIMATES (each panel moves independently, so
// the frame stops matching the sheet while still being a grid). Losing a second
// of motion is cheap; shipping a grid frame is not.

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

// Returns the trimmed MP4, or null so the caller keeps the original untouched.
export async function trimClipHead(url: string, seconds: number): Promise<Buffer | null> {
  if (seconds <= 0) return null;
  const dir = join(tmpdir(), `vynavo_trim_${randomUUID()}`);
  try {
    mkdirSync(dir, { recursive: true });
    const src = join(dir, "in.mp4");
    const out = join(dir, "out.mp4");
    const res = await fetch(url);
    if (!res.ok) return null;
    writeFileSync(src, Buffer.from(await res.arrayBuffer()));

    // Never cut the clip down to nothing: if the trim would leave under 2s, the
    // generation is not usable as a block anyway and the original is the safer
    // thing to hand the editor.
    const { stdout } = await exec(FFMPEG.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"), [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src,
    ]).catch(() => ({ stdout: "" }));
    const dur = Number(stdout.trim());
    if (Number.isFinite(dur) && dur - seconds < 2) {
      console.warn(`[trim] recorte de ${seconds}s dejaría ${(dur - seconds).toFixed(1)}s — se deja el clip completo`);
      return null;
    }

    // Re-encode rather than stream-copy: -c copy can only cut on a keyframe, which
    // silently lands the cut somewhere other than where we asked and leaves the
    // grid on screen. The clip is a few seconds long — the encode is cheap.
    await exec(FFMPEG, [
      "-v", "error", "-ss", String(seconds), "-i", src,
      "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
      "-c:a", "copy", "-movflags", "+faststart", "-y", out,
    ]);
    console.log(`[trim] recortados ${seconds}s de cabecera`);
    return readFileSync(out);
  } catch (e) {
    console.error("[trim]", e instanceof Error ? e.message.slice(0, 140) : e);
    return null;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  }
}
