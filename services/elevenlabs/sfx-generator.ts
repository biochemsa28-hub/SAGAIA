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

// ── SONIDO DIEGÉTICO POR ESCENA ──────────────────────────────────────────────
// El whoosh y el impacto son sonidos de EDICIÓN: marcan un corte, no cuentan nada.
// Lo que hace saltar al espectador es el ruido que pasa DENTRO de la escena — la
// puerta que se abre, el vidrio que cae, los pasos que se acercan. La música
// sostiene el tono de toda la historia; esto marca un instante, y ningún colchón
// musical produce ese reflejo.
//
// El guion ya dice cuál es (campo sfx_prompt por escena). Acá solo se generan.
//
// La caché es por TEXTO, no por escena: dos escenas que piden la misma puerta
// comparten el archivo y se paga una sola vez. Con historias del mismo nicho eso
// se acumula rápido entre videos, porque la caché vive con el proceso.
export interface SceneSfx { scene_number: number; url: string }

export async function generateSceneSfx(
  escenas: Array<{ scene_number: number; sfx_prompt?: string | null }>,
): Promise<SceneSfx[]> {
  const pedidos = escenas
    .map((e) => ({ n: e.scene_number, p: (e.sfx_prompt ?? "").trim() }))
    .filter((e) => e.p.length >= 3);
  if (!pedidos.length) return [];

  // Tope de gasto: un guion que devolviera un sfx por escena en 14 escenas son 14
  // llamadas por video. Se priorizan las primeras — son las que deciden si alguien
  // se queda mirando.
  const TOPE = Math.max(1, Number(process.env.MAX_SCENE_SFX ?? 8) || 8);
  const recortados = pedidos.slice(0, TOPE);
  if (recortados.length < pedidos.length) {
    console.log(`[sfx] ${pedidos.length} sonidos pedidos, se generan ${recortados.length} (tope MAX_SCENE_SFX)`);
  }

  const out = await Promise.all(
    recortados.map(async (e) => {
      const clave = "esc_" + e.p.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 48);
      const url = await generate(clave, e.p, 3);
      return url ? { scene_number: e.n, url } : null;
    }),
  );
  const listos = out.filter((x): x is SceneSfx => x !== null);
  console.log(`[sfx] ${listos.length}/${recortados.length} sonidos de escena generados`);
  return listos;
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
