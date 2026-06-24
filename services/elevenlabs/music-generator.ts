// ─── ElevenLabs Music generator ────────────────────────────────────────────────
// Composes an ORIGINAL background score from a text prompt via ElevenLabs' Music
// API (/v1/music), then uploads it to fal storage so Shotstack can fetch a public
// URL. Cached for the process lifetime per niche/mood so we don't regenerate the
// same score on every render. Never throws — a null just means "render without
// generated music" (the assembler falls back to env MUSIC_URL_* or no music).

const cache = new Map<string, string>();

// Mood/genre prompt per niche — flavours the score to match the story's emotion.
const NICHE_MUSIC_MOOD: Record<string, string> = {
  terror:        "dark ominous horror underscore, low drones, tense strings, unsettling, cinematic, instrumental",
  horror:        "dark ominous horror underscore, low drones, tense strings, unsettling, cinematic, instrumental",
  thriller:      "tense suspenseful thriller score, pulsing rhythm, urgent strings, cinematic, instrumental",
  misterio:      "mysterious cinematic underscore, soft suspense, intriguing piano and strings, instrumental",
  mystery:       "mysterious cinematic underscore, soft suspense, intriguing piano and strings, instrumental",
  romance:       "warm emotional romantic score, soft piano and strings, intimate, heartfelt, instrumental",
  inspiracional: "uplifting inspirational cinematic build, hopeful piano, swelling strings, motivational, instrumental",
  inspirational: "uplifting inspirational cinematic build, hopeful piano, swelling strings, motivational, instrumental",
  fantasia:      "magical orchestral fantasy score, wonder, sweeping strings, ethereal, instrumental",
  fantasy:       "magical orchestral fantasy score, wonder, sweeping strings, ethereal, instrumental",
  drama:         "emotional dramatic cinematic score, deep piano, melancholic strings, instrumental",
  historia:      "epic grand cinematic score, orchestral, documentary feel, instrumental",
  publicidad:    "upbeat modern commercial background, clean, energetic, positive, light percussion, instrumental",
  default:       "subtle cinematic background score, emotional, instrumental, modern",
};

// POST /v1/music. Clamp length to a sane range; cache by niche+mood (one track
// reused across renders of that vibe — the assembler fades it out under narration).
export async function generateStoryMusic(
  niche: string,
  musicMood?: string | null,
  durationSeconds = 30,
): Promise<string | null> {
  // Opt-IN: the ElevenLabs Music API requires a PAID plan (free → 402). Only try
  // when explicitly enabled, so free accounts don't waste a failing call.
  if ((process.env.AUTO_MUSIC ?? "off").toLowerCase() !== "on") return null;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !process.env.FAL_API_KEY) return null;

  const moodKey = (niche || "default").toLowerCase();
  const basePrompt = NICHE_MUSIC_MOOD[moodKey] ?? NICHE_MUSIC_MOOD["default"]!;
  const prompt = musicMood ? `${basePrompt}. ${musicMood}` : basePrompt;
  const lengthMs = Math.min(Math.max(Math.round(durationSeconds), 10), 120) * 1000;
  const key = `${moodKey}_${Math.round(lengthMs / 1000)}`;
  if (cache.has(key)) return cache.get(key)!;

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, music_length_ms: lengthMs }),
    });
    if (!res.ok) {
      console.warn("[music] ElevenLabs music failed:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());

    const { fal } = await import("@fal-ai/client");
    fal.config({ credentials: process.env.FAL_API_KEY });
    const file = new File([buffer], `music_${key}.mp3`, { type: "audio/mpeg" });
    const url = (await fal.storage.upload(file)) as string;

    cache.set(key, url);
    return url;
  } catch (e) {
    console.warn("[music] generation error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
