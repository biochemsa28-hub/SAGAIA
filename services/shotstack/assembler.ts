// ─── Shotstack Video Assembler ────────────────────────────────────────────────
// Combines Kling video clips + ElevenLabs audio into a single MP4

const API_BASE = "https://api.shotstack.io/v1";

export interface AssemblyScene {
  sceneNumber: number;
  videoUrl: string;
  audioUrl?: string;
  narrationText?: string;
  durationSeconds: number;
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

// ─── Background music by mood/niche ──────────────────────────────────────────
// Royalty-free tracks from Pixabay (CC0 license, commercial use allowed)
const MUSIC_LIBRARY: Record<string, string> = {
  // Horror / Terror
  terror:        "https://cdn.pixabay.com/audio/2023/03/15/audio_b8d1b1e8d4.mp3",
  horror:        "https://cdn.pixabay.com/audio/2023/03/15/audio_b8d1b1e8d4.mp3",
  // Thriller / Suspense
  thriller:      "https://cdn.pixabay.com/audio/2022/10/16/audio_59a8cef8a3.mp3",
  suspense:      "https://cdn.pixabay.com/audio/2022/10/16/audio_59a8cef8a3.mp3",
  // Mystery
  misterio:      "https://cdn.pixabay.com/audio/2022/11/22/audio_0e18a28831.mp3",
  mystery:       "https://cdn.pixabay.com/audio/2022/11/22/audio_0e18a28831.mp3",
  // Romance
  romance:       "https://cdn.pixabay.com/audio/2023/01/25/audio_50d054ed54.mp3",
  // Inspirational / Motivational
  inspiracional: "https://cdn.pixabay.com/audio/2022/10/25/audio_946e3e58cc.mp3",
  inspirational: "https://cdn.pixabay.com/audio/2022/10/25/audio_946e3e58cc.mp3",
  // Fantasy / Adventure
  fantasia:      "https://cdn.pixabay.com/audio/2023/02/09/audio_a0be98424b.mp3",
  fantasy:       "https://cdn.pixabay.com/audio/2023/02/09/audio_a0be98424b.mp3",
  // Drama / Historia
  drama:         "https://cdn.pixabay.com/audio/2022/11/09/audio_2c4c0ee24e.mp3",
  historia:      "https://cdn.pixabay.com/audio/2022/11/09/audio_2c4c0ee24e.mp3",
  // Documentary
  documentary:   "https://cdn.pixabay.com/audio/2022/08/04/audio_2dde668d05.mp3",
  documental:    "https://cdn.pixabay.com/audio/2022/08/04/audio_2dde668d05.mp3",
  // Comedy
  comedy:        "https://cdn.pixabay.com/audio/2022/03/15/audio_d7aacc1a84.mp3",
  comedia:       "https://cdn.pixabay.com/audio/2022/03/15/audio_d7aacc1a84.mp3",
};

function getMusicUrl(niche: string, musicMood?: string | null): string | null {
  // Try exact niche match first
  const byNiche = MUSIC_LIBRARY[niche.toLowerCase()];
  if (byNiche) return byNiche;

  // Try to match music_mood keywords
  if (musicMood) {
    const mood = musicMood.toLowerCase();
    for (const [key, url] of Object.entries(MUSIC_LIBRARY)) {
      if (mood.includes(key)) return url;
    }
    // keyword matches
    if (mood.includes("dark") || mood.includes("tense") || mood.includes("scary")) return MUSIC_LIBRARY["thriller"]!;
    if (mood.includes("romantic") || mood.includes("love") || mood.includes("soft")) return MUSIC_LIBRARY["romance"]!;
    if (mood.includes("epic") || mood.includes("uplift") || mood.includes("motivat")) return MUSIC_LIBRARY["inspiracional"]!;
    if (mood.includes("orchestr") || mood.includes("magic")) return MUSIC_LIBRARY["fantasia"]!;
    if (mood.includes("sad") || mood.includes("emotional") || mood.includes("drama")) return MUSIC_LIBRARY["drama"]!;
  }

  return null;
}

// ─── CapCut-style viral subtitles ────────────────────────────────────────────
// Splits narration into 4-word chunks, large centered bold text,
// last word of each chunk highlighted in yellow — same style as viral TikToks

const WORDS_PER_CHUNK = 4;

// Niche-specific highlight colors
const NICHE_HIGHLIGHT: Record<string, string> = {
  terror:        "#FF3B3B", // red — blood/danger
  horror:        "#FF3B3B",
  thriller:      "#FF6B00", // orange — urgency
  misterio:      "#A855F7", // purple — mystery
  mystery:       "#A855F7",
  romance:       "#FF69B4", // pink — love
  inspiracional: "#FFE14D", // yellow — energy
  inspirational: "#FFE14D",
  fantasia:      "#818CF8", // indigo — magic
  fantasy:       "#818CF8",
  historia:      "#F59E0B", // amber — epic
  drama:         "#F59E0B",
  default:       "#FFE14D", // yellow — universal
};

function buildCapcutSubtitles(
  scene: AssemblyScene,
  startTime: number,
  niche: string,
): Record<string, unknown>[] {
  if (!scene.narrationText) return [];

  const raw = scene.narrationText
    .replace(/<break[^>]*\/>/g, " ")
    .replace(/\[MOCK\]\s*/gi, "")
    .trim();

  const words = raw.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  // Split into chunks
  const chunks: string[][] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
    chunks.push(words.slice(i, i + WORDS_PER_CHUNK));
  }

  const chunkDur = Math.max(0.4, scene.durationSeconds / chunks.length);
  const highlight = NICHE_HIGHLIGHT[niche.toLowerCase()] ?? NICHE_HIGHLIGHT["default"]!;

  return chunks.map((chunk, idx) => {
    // Last word gets the highlight color — draws the eye
    const html = chunk
      .map((word, wi) => {
        const isLast = wi === chunk.length - 1;
        const color = isLast ? highlight : "#FFFFFF";
        const shadow = isLast
          ? `text-shadow: 0 0 20px ${highlight}88, 3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000;`
          : "text-shadow: 3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000;";
        return `<span style="color:${color}; ${shadow}">${word.toUpperCase()}</span>`;
      })
      .join(" ");

    const fullHtml = `<div style="
      font-family: 'Montserrat', 'Arial Black', Arial, sans-serif;
      font-size: 78px;
      font-weight: 900;
      text-align: center;
      line-height: 1.2;
      letter-spacing: -1px;
      padding: 0 30px;
    ">${html}</div>`;

    return {
      asset: {
        type: "html",
        html: fullHtml,
        width: 1000,
        height: 260,
        background: "transparent",
      },
      start: startTime + idx * chunkDur,
      length: chunkDur,
      position: "center",
      offset: { y: 0.18 }, // slightly below center — avoids covering faces/action
      transition: { in: "fadeIn", out: "fadeOut" },
    };
  });
}

// ─── Build Shotstack timeline ─────────────────────────────────────────────────

function buildTimeline(params: {
  scenes: AssemblyScene[];
  title?: string;
  addSubtitles?: boolean;
  niche?: string;
  musicMood?: string | null;
}): Record<string, unknown> {
  const { scenes, title, addSubtitles = true, niche = "", musicMood } = params;

  const videoClips: Record<string, unknown>[] = [];
  const narrationClips: Record<string, unknown>[] = [];
  const subtitleClips: Record<string, unknown>[] = [];
  const titleClips: Record<string, unknown>[] = [];
  const musicClips: Record<string, unknown>[] = [];

  let timeOffset = 0;
  let totalDuration = 0;

  // Optional title card
  if (title) {
    titleClips.push({
      asset: {
        type: "title",
        text: title,
        style: "minimal",
        color: "#ffffff",
        size: "medium",
        background: "rgba(0,0,0,0.0)",
        position: "bottom",
      },
      start: 0,
      length: 2,
      transition: { in: "fade", out: "fade" },
    });
  }

  for (const scene of scenes) {
    const dur = scene.durationSeconds || 5;

    // Video clip (Kling) — muted since we use narration audio
    videoClips.push({
      asset: { type: "video", src: scene.videoUrl, volume: 0 },
      start: timeOffset,
      length: dur,
      transition: timeOffset > 0 ? { in: "fade" } : undefined,
    });

    // Narration audio (ElevenLabs) — full volume
    if (scene.audioUrl) {
      const audioSrc = scene.audioUrl.replace(/\.mpeg(\?|$)/, ".mp3$1");
      narrationClips.push({
        asset: { type: "audio", src: audioSrc, volume: 1.0 },
        start: timeOffset,
        length: dur,
      });
    }

    // CapCut-style viral subtitles
    if (addSubtitles) {
      const chunks = buildCapcutSubtitles(scene, timeOffset, niche);
      subtitleClips.push(...chunks);
    }

    timeOffset += dur;
  }

  totalDuration = timeOffset;

  // Background music — low volume under narration
  const musicUrl = getMusicUrl(niche, musicMood);
  if (musicUrl && totalDuration > 0) {
    musicClips.push({
      asset: { type: "audio", src: musicUrl, volume: 0.12, effect: "fadeOut" },
      start: 0,
      length: totalDuration,
    });
  }

  const tracks: Record<string, unknown>[] = [
    { clips: videoClips },
  ];
  if (subtitleClips.length) tracks.push({ clips: subtitleClips });
  if (titleClips.length) tracks.push({ clips: titleClips });
  if (narrationClips.length) tracks.push({ clips: narrationClips });
  if (musicClips.length) tracks.push({ clips: musicClips });

  return {
    timeline: {
      background: "#000000",
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
}): Promise<AssemblyResult> {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) throw new Error("SHOTSTACK_API_KEY not set");

  const body = buildTimeline(params);

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
