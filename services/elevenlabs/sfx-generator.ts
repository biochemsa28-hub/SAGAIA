// ─── ElevenLabs Sound Effects generator ───────────────────────────────────────
// Generates short SFX (whoosh transitions, opening impact) from a text prompt via
// ElevenLabs' /v1/sound-generation endpoint, then uploads them to fal storage so
// Shotstack can fetch a public URL. Results are cached for the process lifetime so
// we don't regenerate the same effect on every render (whoosh is reused forever;
// impact is cached per niche/mood).

const cache = new Map<string, string>();

// Mood phrase per niche to flavour the opening impact hit.
const NICHE_IMPACT_MOOD: Record<string, string> = {
  terror: "dark ominous bass impact, horror sting",
  horror: "dark ominous bass impact, horror sting",
  thriller: "tense aggressive cinematic impact hit",
  misterio: "mysterious deep cinematic impact, suspenseful",
  mystery: "mysterious deep cinematic impact, suspenseful",
  romance: "soft warm shimmer swell, gentle",
  inspiracional: "uplifting epic riser impact, hopeful",
  inspirational: "uplifting epic riser impact, hopeful",
  fantasia: "magical sparkling orchestral impact",
  fantasy: "magical sparkling orchestral impact",
  drama: "emotional deep cinematic impact",
  historia: "epic cinematic impact, grand",
  default: "cinematic impact hit, dramatic",
};

async function generate(key: string, prompt: string, durationSeconds: number): Promise<string | null> {
  if (cache.has(key)) return cache.get(key)!;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !process.env.FAL_API_KEY) return null;

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: prompt, duration_seconds: durationSeconds, prompt_influence: 0.5 }),
    });
    if (!res.ok) {
      console.warn("[sfx] ElevenLabs sound-generation failed:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());

    // Upload to fal storage for a public, Shotstack-reachable URL.
    const { fal } = await import("@fal-ai/client");
    fal.config({ credentials: process.env.FAL_API_KEY });
    const file = new File([buffer], `sfx_${key}.mp3`, { type: "audio/mpeg" });
    const url = (await fal.storage.upload(file)) as string;

    cache.set(key, url);
    return url;
  } catch (e) {
    console.warn("[sfx] generation error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

// Public: returns { whoosh, impact } public URLs (or nulls). Never throws — a null
// just means the assembler renders without that effect.
export async function generateStorySfx(niche: string): Promise<{ whoosh: string | null; impact: string | null }> {
  const moodKey = (niche || "default").toLowerCase();
  const impactPrompt = NICHE_IMPACT_MOOD[moodKey] ?? NICHE_IMPACT_MOOD["default"]!;
  const [whoosh, impact] = await Promise.all([
    generate("whoosh", "short clean cinematic whoosh transition swoosh, quick", 1),
    generate(`impact_${moodKey}`, impactPrompt, 2),
  ]);
  return { whoosh, impact };
}
