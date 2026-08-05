// ─── Shotstack Video Assembler ────────────────────────────────────────────────
// Combines Kling video clips + ElevenLabs audio into a single MP4

const API_BASE = "https://api.shotstack.io/v1";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface AssemblyScene {
  sceneNumber: number;
  videoUrl?: string;   // Kling clip (cinematic tier)
  imageUrl?: string;   // static Flux image (Ken Burns tier — animated by Shotstack)
  audioUrl?: string;
  narrationText?: string;
  durationSeconds: number;
  wordTimings?: WordTiming[];  // real per-word timing for synced subtitles
  emotion?: string;            // primary emotion → drives Ken Burns direction
}

// Ken Burns effects mapped per emotional beat — slow push for dread/tension,
// zoom-out for revelation/shock, slide for action/urgency.
const EMOTION_KENBURNS: Record<string, string> = {
  // Terror / dread — slow creep in = unease builds
  terror: "zoomIn", miedo: "zoomIn", dread: "zoomIn", suspenso: "zoomIn",
  shock: "zoomIn", unsettling: "zoomIn",
  // Revelation / betrayal / discovery — pull back = world expands with info
  revelacion: "zoomOut", sorpresa: "zoomOut", traicion: "zoomOut",
  shock_reveal: "zoomOut", discovery: "zoomOut",
  // Action / urgency / run — lateral slide = movement, escape
  accion: "slideLeft", urgencia: "slideLeft", escape: "slideLeft", correr: "slideRight",
  // Sadness / tenderness / memory — slow upward tilt = emotional lift
  tristeza: "slideUp", ternura: "slideUp", nostalgia: "slideUp", memoria: "slideUp",
  // Hope / triumph / inspiration
  esperanza: "slideUp", triunfo: "slideUp", inspiracion: "slideUp",
  // Romance / intimacy
  amor: "zoomIn", intimidad: "zoomIn", romance: "zoomIn",
  // Mystery / clue reveal
  misterio: "zoomIn", pista: "zoomIn",
  // Default fallback sequence (varied so consecutive unknowns don't repeat)
};
const KENBURNS_FALLBACK = ["zoomIn", "zoomOut", "slideLeft", "slideRight", "slideUp"];

function kenBurnsForScene(emotion: string | undefined, index: number): string {
  if (emotion) {
    const key = emotion.toLowerCase().trim();
    if (EMOTION_KENBURNS[key]) return EMOTION_KENBURNS[key]!;
  }
  return KENBURNS_FALLBACK[index % KENBURNS_FALLBACK.length]!;
}

// Scene-to-scene transition driven by emotion → real editing rhythm, not a flat fade.
// Shotstack valid: fade, reveal, wipeLeft/Right, slideLeft/Right/Up/Down, zoom, carouselLeft…
const EMOTION_TRANSITION: Record<string, string> = {
  terror: "fade", miedo: "fade", dread: "fade", suspenso: "fade", tristeza: "fade", drama: "fade", duelo: "fade",
  revelacion: "zoom", sorpresa: "zoom", shock: "zoom", traicion: "zoom", giro: "zoom",
  accion: "slideLeft", urgencia: "slideLeft", escape: "slideLeft", thriller: "slideLeft", adrenalina: "slideLeft",
  esperanza: "slideUp", triunfo: "slideUp", inspiracion: "slideUp", amor: "reveal", ternura: "reveal", romance: "reveal",
};
function transitionForScene(emotion: string | undefined): string {
  const key = emotion?.toLowerCase().trim();
  return (key && EMOTION_TRANSITION[key]) || "fade";
}

export interface AssemblyResult {
  success: boolean;
  renderId?: string;
  status?: string;
  error?: string;
}

export interface AssemblyStatus {
  status: "queued" | "fetching" | "rendering" | "saving" | "done" | "failed";
  url?: string;
  error?: string;
}

// ─── Background music by niche (env-driven) ──────────────────────────────────
// Music URLs come from env vars so you can plug in your OWN verified, publicly
// reachable tracks (e.g. a Cloudflare R2 / S3 bucket) without code changes:
//
//   MUSIC_URL_TERROR=https://cdn.tu-dominio.com/music/terror.mp3
//   MUSIC_URL_ROMANCE=https://...
//   MUSIC_URL_DEFAULT=https://...   (fallback for any niche)
//
// Anything missing/unreachable is skipped gracefully (video renders without music).
function getMusicUrl(niche: string, musicMood?: string | null): string | null {
  const norm = niche.toLowerCase();
  const byNiche = process.env[`MUSIC_URL_${norm.toUpperCase()}`];
  if (byNiche) return byNiche;

  // Map a few mood keywords onto whatever niche tracks exist
  if (musicMood) {
    const mood = musicMood.toLowerCase();
    const pick = (k: string) => process.env[`MUSIC_URL_${k.toUpperCase()}`];
    if (mood.includes("dark") || mood.includes("tense") || mood.includes("scary")) return pick("thriller") ?? pick("terror") ?? null;
    if (mood.includes("romantic") || mood.includes("love") || mood.includes("soft")) return pick("romance") ?? null;
    if (mood.includes("epic") || mood.includes("uplift") || mood.includes("motivat")) return pick("inspiracional") ?? null;
    if (mood.includes("orchestr") || mood.includes("magic")) return pick("fantasia") ?? null;
    if (mood.includes("sad") || mood.includes("emotional") || mood.includes("drama")) return pick("drama") ?? null;
  }

  return process.env["MUSIC_URL_DEFAULT"] ?? null;
}

// ─── Sound design SFX (env-driven, optional) ─────────────────────────────────
// Punchy transitions + an opening impact dramatically raise perceived production
// value. Provide your own short SFX (mp3) via env; missing = silently skipped.
//   SFX_WHOOSH_URL=https://cdn.tu-dominio.com/sfx/whoosh.mp3   (scene transitions)
//   SFX_IMPACT_URL=https://cdn.tu-dominio.com/sfx/impact.mp3   (opening hit / hook)
function getSfx(kind: "whoosh" | "impact"): string | null {
  return process.env[`SFX_${kind.toUpperCase()}_URL`] ?? null;
}

// Verify a remote asset is fetchable before handing it to Shotstack.
// Shotstack downloads assets server-side; an unreachable URL fails the whole render.
async function isReachable(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    // Range GET (1 byte) — more reliable than HEAD across CDNs that block HEAD
    const res = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: ctrl.signal });
    clearTimeout(t);
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

// ─── CapCut-style viral subtitles ────────────────────────────────────────────
// Splits narration into 4-word chunks using Shotstack's native `text` asset
// (works on ALL Shotstack plans, unlike `html` which requires Standard+)

// 1 word per chunk = true word-by-word karaoke captions (the punchy TikTok look).
// Override with SUBTITLE_WORDS (e.g. 2-3) if you prefer small phrases.
const WORDS_PER_CHUNK = Math.max(1, Number(process.env.SUBTITLE_WORDS ?? 1) || 1);

// Niche-specific text colors — whole chunk gets the accent color on last chunk
const NICHE_HIGHLIGHT: Record<string, string> = {
  terror:        "#FF3B3B",
  horror:        "#FF3B3B",
  thriller:      "#FF6B00",
  misterio:      "#A855F7",
  mystery:       "#A855F7",
  romance:       "#FF69B4",
  inspiracional: "#FFE14D",
  inspirational: "#FFE14D",
  fantasia:      "#818CF8",
  fantasy:       "#818CF8",
  historia:      "#F59E0B",
  drama:         "#F59E0B",
  default:       "#FFE14D",
};

// Font px size — big & punchy for the CapCut viral look.
const SUBTITLE_PX = Number(process.env.SUBTITLE_PX) || 82;

// Build one subtitle clip from a chunk of words at an absolute timeline position.
// Uses Shotstack's CURRENT "text" asset (the legacy "title" asset is deprecated and
// renders nothing on the modern API) — bold font + black stroke for the CapCut look.
function subtitleClip(
  text: string, start: number, length: number, color: string,
): Record<string, unknown> {
  return {
    asset: {
      type: "text",
      text,
      font: { family: "Montserrat", color, size: SUBTITLE_PX, weight: 800, lineHeight: 1 },
      alignment: { horizontal: "center", vertical: "center" },
      stroke: { color: "#000000", width: 10 },  // thick black outline = CapCut signature (Shotstack max)
      width: 1000,
      height: 320,
    },
    start: Math.max(0, start),
    length: Math.max(0.4, length),
    position: "center",          // center band — always on-screen, above the TikTok UI
    offset: { x: 0, y: -0.22 },  // nudge into the lower third
    // NO fade: word-by-word captions must pop INSTANTLY at full opacity. A fade on
    // a ~0.5s word leaves it mostly transparent (that's why captions looked absent).
  };
}

function buildCapcutSubtitles(
  scene: AssemblyScene,
  startTime: number,
  niche: string,
): Record<string, unknown>[] {
  const highlight = NICHE_HIGHLIGHT[niche.toLowerCase()] ?? NICHE_HIGHLIGHT["default"]!;

  // ── Path A: REAL word timings from ElevenLabs → perfect karaoke sync ────────
  const timings = scene.wordTimings?.filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end));
  if (timings && timings.length) {
    const clips: Record<string, unknown>[] = [];
    let chunkIdx = 0;
    for (let i = 0; i < timings.length; i += WORDS_PER_CHUNK) {
      const group = timings.slice(i, i + WORDS_PER_CHUNK);
      const text = group.map((g) => g.word.toUpperCase()).join(" ");
      const start = startTime + group[0]!.start;
      const end = startTime + group[group.length - 1]!.end;
      // Colorful TikTok look: alternate white / niche-accent for pop + readability.
      clips.push(subtitleClip(text, start, end - start, chunkIdx % 2 === 0 ? "#FFFFFF" : highlight));
      chunkIdx++;
    }
    return clips;
  }

  // ── Path B: fallback — even split (no timing data available) ────────────────
  if (!scene.narrationText) return [];
  const raw = scene.narrationText
    .replace(/<break[^>]*\/>/g, " ")
    .replace(/\[MOCK\]\s*/gi, "")
    .trim();
  const words = raw.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
    chunks.push(words.slice(i, i + WORDS_PER_CHUNK));
  }
  const chunkDur = Math.max(0.4, scene.durationSeconds / chunks.length);

  return chunks.map((chunk, idx) => {
    const text = chunk.map((w) => w.toUpperCase()).join(" ");
    // Same alternating white / niche-accent colorful look as the synced path.
    return subtitleClip(text, startTime + idx * chunkDur, chunkDur, idx % 2 === 0 ? "#FFFFFF" : highlight);
  });
}

// ─── Build Shotstack timeline ─────────────────────────────────────────────────

function buildTimeline(params: {
  scenes: AssemblyScene[];
  title?: string;
  addSubtitles?: boolean;
  niche?: string;
  musicUrl?: string | null;
  cta?: string | null;
  sfxWhoosh?: string | null;
  sfxImpact?: string | null;
  watermark?: boolean;
  clipsHaveAudio?: boolean;  // talking/lip-sync clips already contain the narration
}): Record<string, unknown> {
  const { scenes, title, addSubtitles = true, niche = "", musicUrl, cta, sfxWhoosh, sfxImpact, watermark, clipsHaveAudio } = params;

  const videoClips: Record<string, unknown>[] = [];
  const narrationClips: Record<string, unknown>[] = [];
  const subtitleClips: Record<string, unknown>[] = [];
  const titleClips: Record<string, unknown>[] = [];
  const musicClips: Record<string, unknown>[] = [];
  const sfxClips: Record<string, unknown>[] = [];

  let timeOffset = 0;
  let totalDuration = 0;

  // No opening title card — viral shorts hook with the scene + captions, not a
  // text overlay covering the first seconds. (CTA + watermark are added later.)
  void title;

  // Cross-dissolve overlap between clips for fluid feel — 0.7s overlap
  const TRANSITION_OVERLAP = 0.7;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    const dur = scene.durationSeconds || 5;
    const isFirst = i === 0;
    const isLast = i === scenes.length - 1;

    // Overlap start: each clip starts slightly before the previous ends
    // so cross-dissolve creates a seamless blend (not a hard cut)
    const clipStart = isFirst
      ? 0
      : timeOffset - TRANSITION_OVERLAP;

    const clipLength = isFirst
      ? dur
      : dur + TRANSITION_OVERLAP;

    // Visual clip — Kling video (cinematic) OR Ken Burns over the static image (fast/cheap).
    // Transition IN is driven by the scene's emotion → varied editing rhythm.
    const inTrans = transitionForScene(scene.emotion);
    const transition = !isFirst
      ? { in: inTrans, out: isLast ? "fade" : undefined }
      : { out: isLast ? "fade" : undefined };

    if (scene.videoUrl) {
      videoClips.push({
        // Talking/lip-sync clips carry their own synced narration → volume 1.
        // Other clips are muted; the separate narration track carries the audio.
        asset: { type: "video", src: scene.videoUrl, volume: clipsHaveAudio ? 1 : 0 },
        start: clipStart,
        length: clipLength,
        transition,
      });
    } else if (scene.imageUrl) {
      // Ken Burns: animate the still image (zoom/pan) — cinematic feel, ~zero cost
      videoClips.push({
        asset: { type: "image", src: scene.imageUrl },
        start: clipStart,
        length: clipLength,
        fit: "cover",  // fill the 9:16 frame
        effect: kenBurnsForScene(scene.emotion, i),
        transition,
      });
    }

    // Narration audio — no overlap, locked to scene start.
    // Skipped for talking clips: the clip already contains the synced narration.
    if (scene.audioUrl && !clipsHaveAudio) {
      const audioSrc = scene.audioUrl.replace(/\.mpeg(\?|$)/, ".mp3$1");
      narrationClips.push({
        asset: { type: "audio", src: audioSrc, volume: 1.0 },
        start: timeOffset,
        length: dur,
      });
    }

    // CapCut-style viral subtitles — also locked to scene start (no overlap)
    if (addSubtitles) {
      const chunks = buildCapcutSubtitles(scene, timeOffset, niche);
      subtitleClips.push(...chunks);
    }

    // Whoosh SFX on each scene transition (not the first) — punchy cuts
    if (sfxWhoosh && !isFirst) {
      sfxClips.push({
        asset: { type: "audio", src: sfxWhoosh, volume: 0.45 },
        start: Math.max(0, timeOffset - 0.25),
        length: 0.8,
      });
    }

    timeOffset += dur;
  }

  totalDuration = timeOffset;

  // Opening impact SFX — lands on the hook, grabs attention in the first second
  if (sfxImpact && totalDuration > 0) {
    sfxClips.push({
      asset: { type: "audio", src: sfxImpact, volume: 0.55, effect: "fadeOut" },
      start: 0,
      length: 1.6,
    });
  }

  // End CTA card — engineered retention: a final on-screen tease ("Parte 2 →")
  // over the last ~2.6s of the video. Drives follows + comments.
  if (cta && totalDuration > 2.6) {
    const cardLen = 2.4;
    titleClips.push({
      asset: {
        type: "text",
        text: cta.replace(/\[MOCK\]\s*/gi, "").trim().toUpperCase(),
        font: { family: "Montserrat", color: "#FFFFFF", size: 58, weight: 800, lineHeight: 1.1 },
        alignment: { horizontal: "center", vertical: "center" },
        stroke: { color: "#000000", width: 8 },
        background: { color: "#000000", opacity: 0.45, padding: 24, borderRadius: 14 },
        width: 950, height: 500,
      },
      start: totalDuration - cardLen,
      length: cardLen,
      position: "center",
      transition: { in: "fade", out: "fade" },
    });
  }

  // Free-tier watermark — persistent across the whole video. Doubles as viral
  // marketing (every shared free video advertises the product) and an upgrade nudge.
  if (watermark && totalDuration > 0) {
    titleClips.push({
      asset: {
        type: "text",
        text: "Hecho con VYNAVO",
        font: { family: "Montserrat", color: "#FFFFFF", size: 24, weight: 700, lineHeight: 1 },
        alignment: { horizontal: "center", vertical: "top" },
        width: 600, height: 80,
      },
      start: 0,
      length: totalDuration,
      position: "top",
      offset: { x: 0, y: -0.04 },
      opacity: 0.6,
    });
  }

  // Background music — low volume under narration (ducked), smooth fade in AND out.
  if (musicUrl && totalDuration > 0) {
    musicClips.push({
      asset: { type: "audio", src: musicUrl, volume: 0.12, effect: "fadeInFadeOut" },
      start: 0,
      length: totalDuration,
    });
  }

  // Shotstack layers tracks with the FIRST track on TOP. So visual overlays
  // (subtitles, title/CTA/watermark) must come BEFORE the video track, otherwise
  // the full-frame video covers them and nothing shows. Audio tracks have no
  // visual layer, so their order is irrelevant — they go last.
  const tracks: Record<string, unknown>[] = [];
  if (subtitleClips.length) tracks.push({ clips: subtitleClips }); // top
  if (titleClips.length) tracks.push({ clips: titleClips });
  tracks.push({ clips: videoClips });                              // visual background
  if (narrationClips.length) tracks.push({ clips: narrationClips });
  if (sfxClips.length) tracks.push({ clips: sfxClips });
  if (musicClips.length) tracks.push({ clips: musicClips });

  return {
    timeline: {
      background: "#000000",
      // Declare the caption font so Shotstack renders bold Montserrat (otherwise
      // it falls back to a thin default and captions look weak / may not show).
      fonts: [
        { src: "https://cdn.jsdelivr.net/gh/google/fonts/ofl/montserrat/static/Montserrat-ExtraBold.ttf" },
      ],
      tracks,
    },
    output: {
      format: "mp4",
      resolution: "1080",
      aspectRatio: "9:16",
      fps: 30,
    },
  };
}

// ─── Submit render ────────────────────────────────────────────────────────────

export async function submitAssembly(params: {
  scenes: AssemblyScene[];
  title?: string;
  addSubtitles?: boolean;
  niche?: string;
  musicMood?: string | null;
  musicUrl?: string | null;       // dynamically generated music (overrides env)
  cta?: string | null;
  watermark?: boolean;
  sfxWhooshUrl?: string | null;  // dynamically generated SFX (overrides env)
  sfxImpactUrl?: string | null;
  clipsHaveAudio?: boolean;
}): Promise<AssemblyResult> {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) throw new Error("SHOTSTACK_API_KEY not set");

  // Resolve + verify all audio asset URLs in parallel. Any bad/unreachable URL
  // must NEVER fail the render — we drop it gracefully.
  // Dynamically-generated music/SFX (from ElevenLabs) take priority over env URLs.
  const musicCandidate = params.musicUrl ?? getMusicUrl(params.niche ?? "", params.musicMood);
  const whooshCandidate = params.sfxWhooshUrl ?? getSfx("whoosh");
  const impactCandidate = params.sfxImpactUrl ?? getSfx("impact");

  const [musicOk, whooshOk, impactOk] = await Promise.all([
    musicCandidate ? isReachable(musicCandidate) : Promise.resolve(false),
    whooshCandidate ? isReachable(whooshCandidate) : Promise.resolve(false),
    impactCandidate ? isReachable(impactCandidate) : Promise.resolve(false),
  ]);

  const musicUrl = musicOk ? musicCandidate : null;
  const sfxWhoosh = whooshOk ? whooshCandidate : null;
  const sfxImpact = impactOk ? impactCandidate : null;
  if (musicCandidate && !musicUrl) console.warn("[shotstack] music URL unreachable, skipping:", musicCandidate);
  if (whooshCandidate && !sfxWhoosh) console.warn("[shotstack] whoosh SFX unreachable, skipping");
  if (impactCandidate && !sfxImpact) console.warn("[shotstack] impact SFX unreachable, skipping");

  const body = buildTimeline({
    scenes: params.scenes,
    title: params.title,
    addSubtitles: params.addSubtitles,
    niche: params.niche,
    musicUrl,
    cta: params.cta,
    sfxWhoosh,
    sfxImpact,
    watermark: params.watermark,
    clipsHaveAudio: params.clipsHaveAudio,
  });

  const res = await fetch(`${API_BASE}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shotstack error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { success: boolean; response: { id: string; message: string } };
  return {
    success: true,
    renderId: data.response.id,
    status: "queued",
  };
}

// ─── Check render status ──────────────────────────────────────────────────────

export async function checkAssembly(renderId: string): Promise<AssemblyStatus> {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) throw new Error("SHOTSTACK_API_KEY not set");

  const res = await fetch(`${API_BASE}/render/${renderId}`, {
    headers: { "x-api-key": apiKey },
  });

  if (!res.ok) throw new Error(`Shotstack status error: ${res.status}`);

  const data = (await res.json()) as {
    response: {
      status: string;
      url?: string;
      error?: string;
    }
  };

  const r = data.response;
  return {
    status: r.status as AssemblyStatus["status"],
    url: r.url,
    error: r.error,
  };
}
