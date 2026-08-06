// ─── Local FFmpeg assembler ──────────────────────────────────────────────────
// Renders the final vertical video on YOUR machine/server with FFmpeg instead of
// Shotstack. Cost per render: $0. No external dependency, no ephemeral URLs — the
// output goes straight to R2 (permanent). Enable with RENDER_ENGINE=ffmpeg.
//
// v1 covers the kenburns tier: per-scene image + voice → Ken Burns clip, concatenated,
// with background music ducked under the narration. (Subtitles: roadmap v2.)

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { uploadBuffer } from "@/services/storage";

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";
// Living-atmosphere pass over still frames (grain that moves every frame). Off via
// ATMOSPHERE=off if you ever want perfectly clean stills.
// Ken Burns oversamples so the zoom does not pixelate. 2x (4K per scene) needs
// more memory than a small container has, and every segment died with a bare
// "Command failed" — the render worked on a laptop and could not work in
// production. 1.5x keeps the zoom clean at a third of the pixels.
const OVERSAMPLE = Math.max(1, Math.min(2, Number(process.env.KENBURNS_OVERSAMPLE ?? 1.5) || 1.5));
const OVERSAMPLE_W = Math.round(1080 * OVERSAMPLE / 2) * 2;
const OVERSAMPLE_H = Math.round(1920 * OVERSAMPLE / 2) * 2;

// "Arial Black" does not exist on Linux: libass finds no family, falls back to
// nothing, and the whole filter chain fails. Liberation Sans Narrow Bold is the
// metric-compatible substitute shipped by ttf-liberation, which the Dockerfile
// now installs. Override with SUBTITLE_FONT if a nicer face is available.
const SUBTITLE_FONT = process.env.SUBTITLE_FONT ?? "Liberation Sans Narrow";

const ATMOSPHERE_ON = (process.env.ATMOSPHERE ?? "on").toLowerCase() !== "off";

export interface FfScene {
  imageUrl?: string;
  videoUrl?: string;   // if a real motion clip exists, use it instead of Ken Burns
  audioUrl?: string;
  /** Several narrations laid end to end over ONE clip — a narrative block. */
  audioUrls?: string[];
  durationSeconds?: number;
  wordTimings?: Array<{ word: string; start: number; end: number }>; // for burned CapCut subs
  emotion?: string;    // drives the Ken Burns motion (direction, easing, anchor)
  shots?: string[];    // extra camera setups of this same beat → the edit cuts between them
}

// ── CapCut-style burned subtitles via an ASS file ────────────────────────────
// Caption chunking: keep lines SHORT so they never overflow the 1080px frame.
const MAX_CHARS_PER_LINE = 18;   // hard cap — at 88px Arial Black this fits with margin
const MAX_WORDS_PER_CHUNK = 3;
const MAX_CHUNK_SECONDS = 1.6;   // never hold one caption longer than this (keeps sync tight)

// Niche-flavoured highlight color (ASS uses &HBBGGRR — reversed from hex RGB).
const NICHE_COLOR: Record<string, string> = {
  terror: "&H0000E5FF",      // amarillo dorado
  horror: "&H0000E5FF",
  romance: "&H00B4A0FF",     // rosa
  misterio: "&H00FFD966",    // cian claro
  mystery: "&H00FFD966",
  thriller: "&H004DA6FF",    // naranja
  inspiracional: "&H0080FF80", // verde menta
  inspirational: "&H0080FF80",
  drama: "&H0000E5FF",
  publicidad: "&H0000E5FF",
  default: "&H0000E5FF",
};

// ── Ken Burns "director" ─────────────────────────────────────────────────────
// Applies real animation principles so the motion never feels mechanical:
//  • EASING — no linear moves (ease-in creeps, ease-out settles)
//  • VARIED TIMING — each emotion gets its own speed and direction
//  • ANCHOR POINT — pushes hold on the subject (upper third for faces), so the
//    frame doesn't "drift" or jump around
// Returns the zoompan z/x/y expressions for one scene. Cost: $0.
function kenBurnsMotion(emotion: string | undefined, frames: number): { z: string; x: string; y: string } {
  const e = (emotion ?? "").toLowerCase().trim();
  const t = `(on/${Math.max(1, frames)})`;            // normalized 0→1 progress
  const easeOut = `(1-pow(1-${t},3))`;                 // fast start, gentle settle
  const easeIn = `pow(${t},2)`;                        // slow creep, accelerating
  const easeInOut = `(0.5-0.5*cos(${t}*PI))`;          // smooth both ends

  // ORGANIC DRIFT — a real camera is never perfectly still. Two slow sine waves at
  // incommensurate periods never repeat, so the frame breathes instead of gliding on
  // rails. This is the single biggest reason a zoompan reads as "slideshow": it's
  // TOO smooth. Amplitude is a few pixels — felt, not seen.
  const driftX = `+7*sin(on/47)+4*sin(on/113)`;
  const driftY = `+6*cos(on/59)+3*sin(on/97)`;

  // Anchors: center, or upper third (where faces sit in vertical portraits).
  const cx = `iw/2-(iw/zoom/2)${driftX}`;
  const cyCenter = `ih/2-(ih/zoom/2)${driftY}`;
  const cyFace = `ih/2.6-(ih/zoom/2.6)${driftY}`;

  const group = (list: string[]) => list.includes(e);

  // DREAD/TERROR: slow inexorable creep toward the subject — the threat approaching.
  if (group(["terror", "miedo", "dread", "suspenso", "shock", "misterio", "mystery", "pista"]))
    return { z: `1+0.22*${easeIn}`, x: cx, y: cyFace };

  // REVELATION: pull back — the world opens up as the truth lands.
  if (group(["revelacion", "sorpresa", "traicion", "giro", "shock_reveal", "discovery"]))
    return { z: `1.26-0.24*${easeOut}`, x: cx, y: cyCenter };

  // ACTION/URGENCY: faster, decisive push with a settle.
  if (group(["accion", "urgencia", "escape", "thriller", "adrenalina", "rabia", "ira"]))
    return { z: `1+0.30*${easeOut}`, x: cx, y: cyCenter };

  // TENDERNESS/HOPE: gentle floating rise — the camera "breathes" upward.
  if (group(["ternura", "amor", "romance", "esperanza", "nostalgia", "intimidad", "triunfo", "inspiracion"]))
    return { z: `1+0.18*${easeInOut}`, x: cx, y: `ih/2-(ih/zoom/2)-40*${easeInOut}${driftY}` };

  // SADNESS/DRAMA: very slow, heavy push on the face.
  if (group(["tristeza", "duelo", "drama", "culpa", "verguenza"]))
    return { z: `1+0.16*${easeInOut}`, x: cx, y: cyFace };

  // Default: cinematic easeOut push, face-anchored.
  return { z: `1+0.20*${easeOut}`, x: cx, y: cyFace };
}

function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}
// Build an ASS subtitle file for one scene: CapCut captions from word timings,
// plus optional watermark (free plan) and a CTA card on the closing seconds.
function buildAssContent(
  timings: Array<{ word: string; start: number; end: number }> | undefined,
  opts?: { durSec?: number; watermark?: boolean; cta?: string | null; niche?: string },
): string {
  const hi = NICHE_COLOR[(opts?.niche ?? "").toLowerCase()] ?? NICHE_COLOR.default;
  const header =
    "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n" +
    "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\n" +
    // Cap: heavy Arial Black, thick outline + drop shadow, wide side margins so a
    // long line NEVER runs off the 1080px frame (it wraps instead).
    `Style: Cap,${SUBTITLE_FONT},86,&H00FFFFFF,&H00000000,&H00000000,-1,0,1,8,4,2,110,110,400\n` +
    // Pop: same but in the niche's highlight color — used for the punch word.
    `Style: Pop,${SUBTITLE_FONT},90,${hi},&H00000000,&H00000000,-1,0,1,8,4,2,110,110,400\n` +
    "Style: Mark,Arial,38,&H60FFFFFF,&H60000000,&H00000000,-1,0,1,2,0,8,40,40,60\n" +
    `Style: CTA,Arial Black,74,${hi},&H00000000,&H00000000,-1,0,1,7,3,5,90,90,0\n\n` +
    "[Events]\nFormat: Layer, Start, End, Style, MarginL, MarginR, Effect, Text\n";

  const lines: string[] = [];
  const clean = (timings ?? []).filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end));

  // ── Smart chunking ─────────────────────────────────────────────────────────
  // Break on: char budget, word count, long pause, OR sentence-ending punctuation.
  // This keeps captions short (no overflow) AND glued to the audio (no drift).
  type Chunk = { words: typeof clean; start: number; end: number };
  const chunks: Chunk[] = [];
  let cur: typeof clean = [];
  const flush = () => {
    if (!cur.length) return;
    chunks.push({ words: cur, start: cur[0]!.start, end: cur[cur.length - 1]!.end });
    cur = [];
  };
  for (let i = 0; i < clean.length; i++) {
    const w = clean[i]!;
    const raw = w.word.trim();
    // Ellipsis/pause markers are dead weight on screen — drop standalone ones.
    if (/^[.…·—-]+$/.test(raw)) { flush(); continue; }
    cur.push(w);
    const text = cur.map((c) => c.word).join(" ");
    const next = clean[i + 1];
    const gapToNext = next ? next.start - w.end : 0;
    const spanTooLong = w.end - cur[0]!.start >= MAX_CHUNK_SECONDS;
    const endsSentence = /[.!?…]$/.test(raw);
    if (
      text.length >= MAX_CHARS_PER_LINE ||
      cur.length >= MAX_WORDS_PER_CHUNK ||
      spanTooLong ||
      endsSentence ||
      gapToNext > 0.45          // a real pause in the delivery → cut the caption here
    ) flush();
  }
  flush();

  // ── Emit dialogue lines ────────────────────────────────────────────────────
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    const next = chunks[i + 1];
    const words = c.words.map((g) => g.word.toUpperCase().replace(/[{}\\]/g, "").replace(/^[…]+|[…]+$/g, "").trim()).filter(Boolean);
    if (!words.length) continue;
    const text = words.join(" ");
    // Hold the caption until the next one starts (max +0.35s) so there are no gaps
    // and it never lags behind the voice.
    const end = next ? Math.min(next.start, c.end + 0.35) : c.end + 0.25;
    // Punch styling: emphasize lines that carry a question/exclamation.
    const isPunch = /[!?¡¿]/.test(text);
    const style = isPunch ? "Pop" : "Cap";
    // Subtle pop-in scale so each caption "snaps" like CapCut.
    lines.push(`Dialogue: 0,${assTime(c.start)},${assTime(Math.max(end, c.start + 0.25))},${style},,,,{\\fscx92\\fscy92\\t(0,90,\\fscx100\\fscy100)}${text}`);
  }
  const dur = Math.max(1, opts?.durSec ?? 60);
  if (opts?.watermark) {
    lines.push(`Dialogue: 0,${assTime(0)},${assTime(dur)},Mark,,,,VYNAVO`);
  }
  if (opts?.cta) {
    const ctaText = opts.cta.replace(/[{}\\]/g, "").slice(0, 60).toUpperCase();
    const start = Math.max(0, dur - 2.6);
    lines.push(`Dialogue: 1,${assTime(start)},${assTime(dur)},CTA,,,,{\\fad(250,0)}${ctaText}`);
  }
  return header + lines.join("\n") + "\n";
}

async function download(url: string, path: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url.slice(0, 60)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buf);

  // A .jpg URL does not guarantee JPEG bytes: fal serves WebP and AVIF behind
  // those names, and the minimal ffmpeg in an Alpine image may lack the decoder.
  // The failure is silent and looks like nothing at all — the encoder starts, the
  // filters configure, and zero frames ever appear. Naming the real format turns
  // that into a one-line diagnosis instead of hours of guessing.
  const nombre = path.split(/[/]/).pop() ?? path;
  const m = buf.subarray(0, 12);
  const tipo =
    m[0] === 0xff && m[1] === 0xd8 ? "jpeg" :
    m.subarray(0, 4).toString("hex") === "89504e47" ? "png" :
    m.subarray(8, 12).toString("ascii") === "WEBP" ? "webp" :
    m.subarray(4, 8).toString("ascii") === "ftyp" ? "avif/heic" :
    "desconocido:" + m.subarray(0, 4).toString("hex");
  if (tipo !== "jpeg" && tipo !== "png") {
    console.warn("[download] " + nombre + " NO es jpeg/png -> " + tipo + " (" + buf.length + " bytes)");
  } else if (buf.length < 1024) {
    console.warn("[download] " + nombre + " pesa solo " + buf.length + " bytes");
  }
}

async function probeDuration(path: string): Promise<number> {
  try {
    const { stdout } = await exec(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", path]);
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch { return 0; }
}

// Build ONE scene clip: Ken Burns over the image (or use the video clip) + its audio.
// `deco` adds the finishing touches: crossfade-in, watermark, and the closing CTA.
async function buildSceneClip(
  dir: string, i: number, scene: FfScene,
  deco?: { watermark?: boolean; cta?: string | null; isFirst?: boolean; isLast?: boolean; niche?: string },
): Promise<string | null> {
  const out = join(dir, `scene_${i}.mp4`);
  const audioPath = join(dir, `a_${i}.mp3`);
  let hasAudio = false;
  // A narrative block covers several scenes with ONE clip, so their narrations
  // play back to back over it. Concatenated here rather than upstream so the
  // duration probe below measures the real combined length.
  if (scene.audioUrls && scene.audioUrls.length > 1) {
    try {
      const parts: string[] = [];
      for (let k = 0; k < scene.audioUrls.length; k++) {
        const part = join(dir, `a_${i}_${k}.mp3`);
        await download(scene.audioUrls[k]!, part);
        parts.push(part);
      }
      const listPath = join(dir, `alist_${i}.txt`);
      writeFileSync(listPath, parts.map((f) => `file '${f.split(String.fromCharCode(92)).join("/")}'`).join(String.fromCharCode(10)));
      // Re-encode on concat: the parts can differ in bitrate, and -c copy would
      // produce a file whose duration probe lies.
      await exec(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:a", "libmp3lame", "-b:a", "128k", audioPath], { maxBuffer: 1 << 26, cwd: dir });
      hasAudio = true;
    } catch { hasAudio = false; }
  } else if (scene.audioUrl) {
    try { await download(scene.audioUrl, audioPath); hasAudio = true; } catch { hasAudio = false; }
  }
  const dur = hasAudio ? Math.max(1.5, (await probeDuration(audioPath)) + 0.3) : Math.max(2, scene.durationSeconds ?? 4);
  const frames = Math.round(dur * 30);

  // CapCut subtitles + watermark + CTA: one per-scene .ass file (relative name so
  // Windows path escaping in the ffmpeg filter is a non-issue — we set cwd=dir).
  const needAss = Boolean(scene.wordTimings?.length || deco?.watermark || (deco?.isLast && deco?.cta));
  let assName: string | null = null;
  if (needAss) {
    assName = `s_${i}.ass`;
    writeFileSync(join(dir, assName), buildAssContent(scene.wordTimings, {
      durSec: dur,
      watermark: deco?.watermark,
      cta: deco?.isLast ? deco?.cta ?? null : null,
      niche: deco?.niche,
    }));
  }
  const subFilter = assName ? `,ass=${assName}` : "";
  // Smooth scene transitions: quick fade-in on every scene after the first,
  // and a gentle fade-out to close the video.
  const fadeIn = deco?.isFirst ? "" : ",fade=t=in:st=0:d=0.4";
  const fadeOut = deco?.isLast ? `,fade=t=out:st=${Math.max(0, dur - 0.5).toFixed(2)}:d=0.5` : "";
  const transition = `${fadeIn}${fadeOut}`;
  const opts = { maxBuffer: 1 << 26, cwd: dir };

  try {
    if (scene.videoUrl) {
      // Real motion clip → scale/pad to 1080x1920 + burn subtitles + mux audio.
      const vid = join(dir, `v_${i}.mp4`);
      await download(scene.videoUrl, vid);

      // With native character audio there is no narration track to measure, so the
      // segment lasts exactly as long as the clip. Without this the fade-out was
      // computed from a 4s fallback and landed halfway through an 8s take.
      let outro = transition;
      if (!hasAudio) {
        const realDur = await probeDuration(vid).catch(() => 0);
        if (realDur > 1) {
          const fo = deco?.isLast ? `,fade=t=out:st=${Math.max(0, realDur - 0.5).toFixed(2)}:d=0.5` : "";
          outro = `${fadeIn}${fo}`;
        }
      }
      const args = ["-y", "-i", vid];
      if (hasAudio) args.push("-i", audioPath);
      args.push(
        // tpad clones the final frame indefinitely so the NARRATION decides the
        // segment length, not the clip. A narrative block lays several scenes'
        // narration over one generation; without this, -shortest cut the story
        // dead the moment the clip ran out — five seconds of dialogue silently
        // vanished in testing. Holding a frame is survivable; losing the line is not.
        "-filter_complex", `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1${hasAudio ? ",tpad=stop_mode=clone:stop_duration=30" : ""}${subFilter}${outro}[v]`,
        "-map", "[v]", "-map", hasAudio ? "1:a" : "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out,
      );
      await exec(FFMPEG, args, opts);
    } else if (scene.imageUrl && (scene.shots?.length ?? 0) > 0) {
      // ── MULTI-SHOT: cut between camera setups inside this one scene ───────────
      // Build a silent Ken Burns segment per shot, concat them, THEN lay the scene's
      // narration + captions over the whole cut. Cutting every ~1.5s is what gives
      // limited-budget animation its energy — and the cuts also hide the small
      // drift between independently generated frames.
      const urls = [scene.imageUrl, ...(scene.shots ?? [])];
      const per = dur / urls.length;
      const perFrames = Math.max(12, Math.round(per * 30));
      const atmo = ATMOSPHERE_ON ? `,noise=alls=6:allf=t+u` : "";
      const segs: string[] = [];
      for (let k = 0; k < urls.length; k++) {
        const shotImg = join(dir, `i_${i}_${k}.jpg`);
        await download(urls[k]!, shotImg);
        const smo = kenBurnsMotion(scene.emotion, perFrames);
        const seg = join(dir, `seg_${i}_${k}.mp4`);
        await exec(FFMPEG, [
          "-y", "-loop", "1", "-i", shotImg,
          "-filter_complex",
          `[0:v]scale=${OVERSAMPLE_W}:${OVERSAMPLE_H}:force_original_aspect_ratio=increase,crop=${OVERSAMPLE_W}:${OVERSAMPLE_H},` +
          `zoompan=z='${smo.z}':x='${smo.x}':y='${smo.y}':d=${perFrames}:s=1080x1920:fps=30,setsar=1${atmo}[v]`,
          "-map", "[v]", "-t", per.toFixed(3),
          "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", seg,
        ], opts);
        segs.push(seg);
      }
      // Concat the shots into this scene's silent video track.
      const shotList = join(dir, `shots_${i}.txt`);
      writeFileSync(shotList, segs.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
      const track = join(dir, `track_${i}.mp4`);
      await exec(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", shotList, "-c", "copy", track], opts);

      // Lay narration + burned captions over the finished cut.
      const args2 = ["-y", "-i", track];
      if (hasAudio) args2.push("-i", audioPath);
      args2.push("-filter_complex", `[0:v]setsar=1${subFilter}${transition}[v]`, "-map", "[v]");
      if (hasAudio) args2.push("-map", "1:a", "-shortest");
      args2.push("-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", out);
      await exec(FFMPEG, args2, opts);
    } else if (scene.imageUrl) {
      const img = join(dir, `i_${i}.jpg`);
      await download(scene.imageUrl, img);
      // Eased, emotion-driven, anchored Ken Burns (see kenBurnsMotion). Upscaling
      // 2x before zoompan avoids the shimmer/jitter zoompan has on 1:1 sources.
      const mo = kenBurnsMotion(scene.emotion, frames);
      // Film grain texture over the still. Measured: it does alter the frame, but it
      // does NOT meaningfully add frame-to-frame motion (x264 smooths it away). Keep
      // it for texture — do not mistake it for making the shot feel alive. Real
      // aliveness needs a video model (see ANIMATE_HERO_SCENES).
      const atmo = ATMOSPHERE_ON ? `,noise=alls=6:allf=t+u` : "";
      const kb = `[0:v]scale=${OVERSAMPLE_W}:${OVERSAMPLE_H}:force_original_aspect_ratio=increase,crop=${OVERSAMPLE_W}:${OVERSAMPLE_H},` +
        `zoompan=z='${mo.z}':x='${mo.x}':y='${mo.y}':d=1:s=1080x1920:fps=30,setsar=1${atmo}${subFilter}${transition}[v]`;
      // d=1, NOT d=frames. With -loop 1 the input never ends, so d=frames asks
      // zoompan for 150 output frames PER input frame — it buffers forever and
      // never emits the first one, which is the "frame= 0" every scene died on.
      // With d=1 each looped frame yields one output frame and the z/x/y
      // expressions advance through `on`, which is what they already use.
      const args = ["-y", "-loop", "1", "-framerate", "30", "-t", String(dur), "-i", img];
      if (hasAudio) args.push("-i", audioPath);
      args.push("-filter_complex", kb, "-map", "[v]");
      if (hasAudio) args.push("-map", "1:a", "-shortest");
      // (-t ya se aplica en la entrada)
      args.push("-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", out);
      try {
        await exec(FFMPEG, args, opts);
      } catch (e) {
        // Burned captions are the most fragile link: they depend on libass, on
        // fontconfig, and on a font that actually exists in the image. A video
        // without captions still ships; a failed render ships nothing and throws
        // away images and clips that were already paid for. So if the subtitle
        // pass fails, retry the same segment plain.
        if (!subFilter) throw e;
        console.warn("[ffmpeg] scene " + i + ": reintentando SIN subtitulos");
        const plano = kb.split(subFilter).join("");
        const args2 = args.map((x) => (x === kb ? plano : x));
        await exec(FFMPEG, args2, opts);
      }
    } else {
      return null;
    }
    return out;
  } catch (e) {
    // Include ffmpeg's OWN stderr, not just the wrapper's "Command failed": the
    // useful line (out of memory, invalid filter, missing codec) lives there, and
    // truncating to 160 chars threw it away every time.
    const detalle = (e as { stderr?: string })?.stderr;
    console.error(`[ffmpeg] scene ${i} failed:`, (e instanceof Error ? e.message : String(e)).slice(0, 200));
    if (detalle) {
      // Progress lines (frame= fps= size=) are 95% of ffmpeg stderr and say
      // nothing. Showing the tail buried the one line that matters — the parse
      // error or the resource failure — under a wall of "frame= 0".
      const lineas = String(detalle).split(String.fromCharCode(10));
      const util = lineas
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .filter((l) => !l.startsWith("frame=") && !l.startsWith("video:") && !l.startsWith("size="))
        .filter((l) => /error|invalid|failed|no such|cannot|unable|undefined|killed|memory|Conversion/i.test(l))
        .slice(-6);
      const fallback = lineas.map((l) => l.trim()).filter((l) => l.length > 0).slice(-4);
      console.error("[ffmpeg] scene " + i + " causa:", (util.length ? util : fallback).join(" | "));
    }
    return null;
  }
}

// Assemble the whole project → one MP4 → upload to R2. Returns the durable URL.
export async function assembleWithFfmpeg(params: {
  scenes: FfScene[];
  musicUrl?: string | null;
  cta?: string | null;        // closing call-to-action card
  watermark?: boolean;        // free-plan brand mark
  niche?: string;             // drives the caption highlight color
  sfxWhooshUrl?: string | null;  // transition whoosh on every cut
  sfxImpactUrl?: string | null;  // impact hit on the opening hook
}): Promise<{ url: string; provider: "ffmpeg" }> {
  const dir = join(tmpdir(), `vynavo_${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  try {
    // 1) Per-scene clips (sequential — keeps memory sane on a small box).
    const clips: string[] = [];
    const boundaries: number[] = [];   // absolute start time of each scene (for SFX)
    let elapsed = 0;
    const last = params.scenes.length - 1;
    for (let i = 0; i < params.scenes.length; i++) {
      const c = await buildSceneClip(dir, i, params.scenes[i]!, {
        watermark: params.watermark,
        cta: params.cta ?? null,
        isFirst: i === 0,
        isLast: i === last,
        niche: params.niche,
      });
      if (c) {
        clips.push(c);
        boundaries.push(elapsed);
        elapsed += await probeDuration(c);
      }
    }
    if (!clips.length) throw new Error("No scene clips could be built");

    // 2) Concatenate.
    const listPath = join(dir, "list.txt");
    writeFileSync(listPath, clips.map((c) => `file '${c.replace(/\\/g, "/")}'`).join("\n"));
    const concatOut = join(dir, "concat.mp4");
    await exec(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concatOut], { maxBuffer: 1 << 26 });

    // 3) SOUND DESIGN + music in ONE mix pass.
    //    • impact hit on the hook (scene 1) — lands the first punch
    //    • whoosh on every scene cut — the cuts read as *edited*, not as a slideshow
    //    • music bed ducked under the narration
    //    Sound design is a huge share of perceived production value in horror/drama.
    let finalOut = concatOut;
    try {
      const inputs: string[] = ["-i", concatOut];
      const filters: string[] = [];
      const mixLabels: string[] = ["[0:a]"];
      let idx = 1;

      if (params.musicUrl) {
        const music = join(dir, "music.mp3");
        await download(params.musicUrl, music);
        inputs.push("-i", music);
        filters.push(`[${idx}:a]volume=0.12[mus]`);
        mixLabels.push("[mus]");
        idx++;
      }

      // Whoosh at each scene cut (skip the very first — nothing to transition from).
      const cuts = boundaries.slice(1);
      if (params.sfxWhooshUrl && cuts.length) {
        const w = join(dir, "whoosh.mp3");
        await download(params.sfxWhooshUrl, w);
        inputs.push("-i", w);
        const wi = idx++;
        const outs = cuts.map((_, k) => `[w${k}]`).join("");
        filters.push(`[${wi}:a]asplit=${cuts.length}${outs}`);
        cuts.forEach((t, k) => {
          const ms = Math.max(0, Math.round((t - 0.12) * 1000));  // land just before the cut
          filters.push(`[w${k}]adelay=${ms}|${ms},volume=0.38[wd${k}]`);
          mixLabels.push(`[wd${k}]`);
        });
      }

      // Impact on the opening beat — the "stop scrolling" punch.
      if (params.sfxImpactUrl) {
        const im = join(dir, "impact.mp3");
        await download(params.sfxImpactUrl, im);
        inputs.push("-i", im);
        filters.push(`[${idx}:a]adelay=150|150,volume=0.5[imp]`);
        mixLabels.push("[imp]");
        idx++;
      }

      if (mixLabels.length > 1) {
        filters.push(`${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0:normalize=0[a]`);
        const mixed = join(dir, "final.mp4");
        await exec(FFMPEG, [
          "-y", ...inputs,
          "-filter_complex", filters.join(";"),
          "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-shortest", mixed,
        ], { maxBuffer: 1 << 26 });
        finalOut = mixed;
      }
    } catch (e) {
      // Never lose the video over an audio-sweetening failure.
      console.error("[ffmpeg] sound design skipped:", e instanceof Error ? e.message.slice(0, 150) : e);
    }

    // 4) Upload to durable R2.
    const buffer = readFileSync(finalOut);
    const { url } = await uploadBuffer({ buffer, ext: "mp4", contentType: "video/mp4", folder: "finals" });
    return { url, provider: "ffmpeg" };
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
