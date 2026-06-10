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

// ─── Build Shotstack timeline ─────────────────────────────────────────────────

function buildTimeline(params: {
  scenes: AssemblyScene[];
  title?: string;
  addSubtitles?: boolean;
}): Record<string, unknown> {
  const { scenes, title, addSubtitles = true } = params;

  const videoClips: Record<string, unknown>[] = [];
  const audioClips: Record<string, unknown>[] = [];
  const subtitleClips: Record<string, unknown>[] = [];
  const titleClips: Record<string, unknown>[] = [];

  let timeOffset = 0;

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

    // Video clip
    videoClips.push({
      asset: { type: "video", src: scene.videoUrl, volume: 0 },
      start: timeOffset,
      length: dur,
      transition: timeOffset > 0 ? { in: "fade" } : undefined,
    });

    // Audio
    if (scene.audioUrl) {
      audioClips.push({
        asset: { type: "audio", src: scene.audioUrl, volume: 1 },
        start: timeOffset,
        length: dur,
      });
    }

    // Subtitles
    if (addSubtitles && scene.narrationText) {
      subtitleClips.push({
        asset: {
          type: "html",
          html: `<p>${scene.narrationText}</p>`,
          css: "p { font-family: 'Open Sans'; font-size: 30px; color: #ffffff; text-shadow: 2px 2px 4px #000000; text-align: center; padding: 0 20px; line-height: 1.4; }",
          width: 1080,
          height: 300,
        },
        start: timeOffset,
        length: dur,
        position: "bottom",
        offset: { y: -0.1 },
      });
    }

    timeOffset += dur;
  }

  const tracks: Record<string, unknown>[] = [
    { clips: videoClips },
  ];
  if (subtitleClips.length) tracks.push({ clips: subtitleClips });
  if (titleClips.length) tracks.push({ clips: titleClips });
  if (audioClips.length) tracks.push({ clips: audioClips });

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
