// ─── Creatomate Video Assembler ───────────────────────────────────────────────
// Combines Kling video clips + ElevenLabs audio into a single MP4

const CREATOMATE_API = "https://api.creatomate.com/v1/renders";

export interface AssemblyScene {
  sceneNumber: number;
  videoUrl: string;       // Kling MP4 URL
  audioUrl?: string;      // ElevenLabs MP3 URL (optional)
  narrationText?: string; // For subtitles (optional)
  durationSeconds: number;
}

export interface AssemblyResult {
  success: boolean;
  renderId?: string;
  outputUrl?: string;
  status?: string;
  error?: string;
}

// ─── Build Creatomate source JSON ─────────────────────────────────────────────

function buildSource(params: {
  scenes: AssemblyScene[];
  title?: string;
  addSubtitles?: boolean;
}): Record<string, unknown> {
  const { scenes, title, addSubtitles = false } = params;

  // Track 1: video clips in sequence
  // Track 2: audio per scene
  // Track 3: subtitles (optional)
  // Track 4: title card at start (optional)

  const elements: Record<string, unknown>[] = [];
  let timeOffset = 0;

  // Optional title card (2s at start)
  if (title) {
    elements.push({
      type: "text",
      track: 3,
      time: 0,
      duration: 2,
      text: title,
      font_size: "8 vmin",
      font_weight: "700",
      color: "#ffffff",
      background_color: "rgba(0,0,0,0.6)",
      background_x_padding: "4%",
      background_y_padding: "2%",
      x_alignment: "50%",
      y_alignment: "85%",
    });
  }

  for (const scene of scenes) {
    const duration = scene.durationSeconds;

    // Video clip
    elements.push({
      type: "video",
      track: 1,
      time: timeOffset,
      duration,
      source: scene.videoUrl,
      fit: "cover",
    });

    // Audio track for this scene
    if (scene.audioUrl) {
      elements.push({
        type: "audio",
        track: 2,
        time: timeOffset,
        duration,
        source: scene.audioUrl,
        volume: "100%",
      });
    }

    // Subtitles
    if (addSubtitles && scene.narrationText) {
      elements.push({
        type: "text",
        track: 3,
        time: timeOffset,
        duration,
        text: scene.narrationText,
        font_size: "4.5 vmin",
        font_weight: "600",
        color: "#ffffff",
        stroke_color: "#000000",
        stroke_width: "0.15 vmin",
        x_alignment: "50%",
        y_alignment: "88%",
        width: "90%",
        line_height: "130%",
      });
    }

    timeOffset += duration;
  }

  return {
    output_format: "mp4",
    width: 1080,
    height: 1920,
    frame_rate: 30,
    elements,
  };
}

// ─── Submit render ─────────────────────────────────────────────────────────────

export async function submitAssembly(params: {
  scenes: AssemblyScene[];
  title?: string;
  addSubtitles?: boolean;
}): Promise<AssemblyResult> {
  const apiKey = process.env.CREATOMATE_API_KEY;
  if (!apiKey) throw new Error("CREATOMATE_API_KEY not set");

  const source = buildSource(params);

  const res = await fetch(CREATOMATE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ source }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Creatomate error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as Array<{ id: string; status: string; url: string }>;
  const render = data[0];
  if (!render) throw new Error("Creatomate returned no render");

  return {
    success: true,
    renderId: render.id,
    outputUrl: render.url,
    status: render.status,
  };
}

// ─── Check render status ──────────────────────────────────────────────────────

export async function checkAssembly(renderId: string): Promise<{
  status: "planned" | "waiting" | "rendering" | "succeeded" | "failed";
  url?: string;
  error?: string;
}> {
  const apiKey = process.env.CREATOMATE_API_KEY;
  if (!apiKey) throw new Error("CREATOMATE_API_KEY not set");

  const res = await fetch(`${CREATOMATE_API}/${renderId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) throw new Error(`Creatomate status error: ${res.status}`);

  const data = (await res.json()) as { status: string; url: string; error_message?: string };
  return {
    status: data.status as "planned" | "waiting" | "rendering" | "succeeded" | "failed",
    url: data.url,
    error: data.error_message,
  };
}
