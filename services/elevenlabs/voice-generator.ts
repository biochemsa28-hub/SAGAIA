import { writeFileSync, mkdirSync } from "fs";
import { join, isAbsolute, resolve } from "path";

// ─── Voice Map by NICHE (primary) then tone (fallback) ───────────────────────
// Each niche gets a voice that matches its emotional world
// Native Latin-Spanish voices per niche (fallback when a scene has no speaker
// voice_profile — e.g. ads). Matches each niche's emotional world.
const NICHE_VOICE: Record<string, { voiceId: string; name: string }> = {
  terror:       { voiceId: "5egO01tkUjEzu7xSSE8M", name: "Carmelo — Mysterious & Deep (es)" },
  horror:       { voiceId: "5egO01tkUjEzu7xSSE8M", name: "Carmelo — Mysterious & Deep (es)" },
  thriller:     { voiceId: "lRf3yb6jZby4fn3q3Q7M", name: "MexiTony — confident (es)" },
  misterio:     { voiceId: "z365btkMkbqu8wJGFTrh", name: "Abel Quiñonez (es)" },
  mystery:      { voiceId: "z365btkMkbqu8wJGFTrh", name: "Abel Quiñonez (es)" },
  romance:      { voiceId: "Wuv1s5YTNCjL9mFJTqo4", name: "Karolina — Warm & Deep (es)" },
  inspiracional:{ voiceId: "ay4iqk10DLwc8KGSrf2t", name: "Azucena Ortega (es)" },
  inspirational:{ voiceId: "ay4iqk10DLwc8KGSrf2t", name: "Azucena Ortega (es)" },
  fantasia:     { voiceId: "bsEDAkNZWaEolZ7vEeVJ", name: "Abel — Mature Narrator (es)" },
  fantasy:      { voiceId: "bsEDAkNZWaEolZ7vEeVJ", name: "Abel — Mature Narrator (es)" },
  historia:     { voiceId: "bsEDAkNZWaEolZ7vEeVJ", name: "Abel — Mature Narrator (es)" },
  drama:        { voiceId: "2dfOetxQ16X5rqsIA5wN", name: "Erik (es)" },
  comedy:       { voiceId: "rpqlUOplj0Q0PIilat8h", name: "Jaider — casual (es)" },
  comedia:      { voiceId: "rpqlUOplj0Q0PIilat8h", name: "Jaider — casual (es)" },
  documentary:  { voiceId: "m7yTemJqdIqrcNleANfX", name: "Ana María — neutral (es)" },
  documental:   { voiceId: "m7yTemJqdIqrcNleANfX", name: "Ana María — neutral (es)" },
  publicidad:   { voiceId: "lRf3yb6jZby4fn3q3Q7M", name: "MexiTony — confident (es)" },
  // Faltaban y caían a la voz genérica de misterio: un chisme contado con voz de
  // suspenso, y una confesión íntima con la misma. Con audio nativo esto no se usa,
  // pero decide el tono apenas se apague NATIVE_AUDIO o se produzca en tier talking.
  // Chisme pide cercanía y complicidad; confesión pide contención, no gravedad.
  chisme:       { voiceId: "rpqlUOplj0Q0PIilat8h", name: "Jaider — casual (es)" },
  confesion:    { voiceId: "Wuv1s5YTNCjL9mFJTqo4", name: "Karolina — Warm & Deep (es)" },
  default:      { voiceId: "z365btkMkbqu8wJGFTrh", name: "Abel Quiñonez (es)" },
};

// ─── Voice library by CHARACTER ARCHETYPE (voice_profile) ────────────────────
// Bridges a cast member's voice_profile (lib/ai/casting.ts) to a real ElevenLabs
// voice. When a scene knows WHO speaks (its speaker's voice_profile), we use this
// instead of the niche voice — so each character has their own distinct voice.
// Override any entry via env, e.g. VOICE_ID_MALE_VILLAIN=xxxx.
// Native Latin-Spanish voices (from the ElevenLabs library) per archetype — they
// sound natural in español, not English voices with an accent. Override any via env.
const PROFILE_VOICE: Record<string, { voiceId: string; name: string }> = {
  male_young:    { voiceId: process.env.VOICE_ID_MALE_YOUNG    ?? "rpqlUOplj0Q0PIilat8h", name: "Jaider (es)" },
  male_adult:    { voiceId: process.env.VOICE_ID_MALE_ADULT    ?? "2dfOetxQ16X5rqsIA5wN", name: "Erik (es)" },
  male_elderly:  { voiceId: process.env.VOICE_ID_MALE_ELDERLY  ?? "bsEDAkNZWaEolZ7vEeVJ", name: "Abel — Mature Narrator (es)" },
  male_villain:  { voiceId: process.env.VOICE_ID_MALE_VILLAIN  ?? "5egO01tkUjEzu7xSSE8M", name: "Carmelo — Mysterious & Deep (es)" },
  female_young:  { voiceId: process.env.VOICE_ID_FEMALE_YOUNG  ?? "f2x23jU8jLdfpOI5mVHo", name: "Karla (es)" },
  female_adult:  { voiceId: process.env.VOICE_ID_FEMALE_ADULT  ?? "ay4iqk10DLwc8KGSrf2t", name: "Azucena Ortega (es)" },
  female_elderly:{ voiceId: process.env.VOICE_ID_FEMALE_ELDERLY?? "Wuv1s5YTNCjL9mFJTqo4", name: "Karolina — Warm & Deep (es)" },
  child:         { voiceId: process.env.VOICE_ID_CHILD         ?? "m7yTemJqdIqrcNleANfX", name: "Ana María — natural (es)" },
  narrator:      { voiceId: process.env.VOICE_ID_NARRATOR      ?? "z365btkMkbqu8wJGFTrh", name: "Abel Quiñonez (es)" },
  creature:      { voiceId: process.env.VOICE_ID_CREATURE      ?? "W5JElH3dK1UYYAiHH7uh", name: "Martin Osborne — whispery (es)" },
};

// Map a cast member's voice_profile to a real ElevenLabs voice. Returns null for
// an unknown/missing profile so callers can fall back to the niche voice.
export function getVoiceForProfile(profile?: string | null): { voiceId: string; name: string } | null {
  if (!profile) return null;
  return PROFILE_VOICE[profile.toLowerCase()] ?? null;
}

// PREMADE (default) voices per archetype — these are the ONLY voices a FREE
// ElevenLabs plan can use via API (library/Spanish voices return 402 on free).
// Used as an automatic fallback so production never hard-fails: it uses the nice
// Spanish voices on a paid plan, and these on free.
const PREMADE_FALLBACK: Record<string, string> = {
  male_young: "TX3LPaxmHKxFdv7VOQHJ", male_adult: "JBFqnCBsd6RMkjVDRZzb",
  male_elderly: "CwhRBWXzGAHq8TQ4Fs17", male_villain: "N2lVS1w4EtoT3dr4eOWO",
  female_young: "Xb7hH8MSUJpSbSDYk0k2", female_adult: "EXAVITQu4vr4xnSDxMaL",
  female_elderly: "pFZP5JQG7iQjIQuC4Bku", child: "cgSgspJ2msm6clMCkdW9",
  narrator: "JBFqnCBsd6RMkjVDRZzb", creature: "N2lVS1w4EtoT3dr4eOWO",
};
const DEFAULT_PREMADE = "JBFqnCBsd6RMkjVDRZzb"; // George — warm storyteller

function getPremadeFallback(voiceProfile?: string | null): string {
  if (voiceProfile && PREMADE_FALLBACK[voiceProfile.toLowerCase()]) return PREMADE_FALLBACK[voiceProfile.toLowerCase()]!;
  return DEFAULT_PREMADE;
}

// ─── UNIQUE voice PER CHARACTER (not per archetype) ──────────────────────────
// Two characters with the same archetype (e.g. two "female_adult") must NOT sound
// identical. We keep a gendered pool of native Spanish voices and give each distinct
// character its OWN voice — deterministically, so the same character always keeps
// the same voice across scenes (and episodes).
const MALE_POOL: Array<{ voiceId: string; name: string }> = [
  { voiceId: "2dfOetxQ16X5rqsIA5wN", name: "Erik (es)" },
  { voiceId: "rpqlUOplj0Q0PIilat8h", name: "Jaider (es)" },
  { voiceId: "lRf3yb6jZby4fn3q3Q7M", name: "MexiTony (es)" },
  { voiceId: "nmvA11Y688M5reLqDsVm", name: "Samuel Rosales (es)" },
  { voiceId: "5egO01tkUjEzu7xSSE8M", name: "Carmelo (es)" },
  { voiceId: "z365btkMkbqu8wJGFTrh", name: "Abel Quiñonez (es)" },
];
const FEMALE_POOL: Array<{ voiceId: string; name: string }> = [
  { voiceId: "ay4iqk10DLwc8KGSrf2t", name: "Azucena Ortega (es)" },
  { voiceId: "f2x23jU8jLdfpOI5mVHo", name: "Karla (es)" },
  { voiceId: "Wuv1s5YTNCjL9mFJTqo4", name: "Karolina (es)" },
  { voiceId: "m7yTemJqdIqrcNleANfX", name: "Ana María (es)" },
  { voiceId: "cAvMBIZ0VNTU8XdsUpEq", name: "Susana Elizabeth (es)" },
  { voiceId: "iBGVhgcEZS6A5gTOjqSJ", name: "Gabiyoya (es)" },
];

function poolForProfile(profile?: string | null): Array<{ voiceId: string; name: string }> {
  const p = (profile ?? "").toLowerCase();
  if (p.startsWith("female") || p === "child") return FEMALE_POOL;
  return MALE_POOL; // male_*, villain, narrator, creature → male pool
}

// Assign a distinct voice to each distinct character (by name). Each character first
// tries its archetype's default voice; if that's already taken by another character,
// it gets the next free voice from its gendered pool. Stable ordering = consistency.
export function assignCharacterVoices(
  cast: Array<{ name?: string | null; voice_profile?: string | null }>,
): Map<string, { voiceId: string; name: string }> {
  const map = new Map<string, { voiceId: string; name: string }>();
  const used = new Set<string>();
  // Distinct characters in first-seen order (stable).
  const seen = new Set<string>();
  const order: Array<{ name: string; voice_profile?: string | null }> = [];
  for (const c of cast) {
    const name = (c.name ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    order.push({ name, voice_profile: c.voice_profile });
  }
  for (const c of order) {
    const def = getVoiceForProfile(c.voice_profile);
    let pick = def && !used.has(def.voiceId) ? def : null;
    if (!pick) {
      const pool = poolForProfile(c.voice_profile);
      pick = pool.find((v) => !used.has(v.voiceId)) ?? def ?? pool[0]!;
    }
    used.add(pick.voiceId);
    map.set(c.name.trim().toLowerCase(), pick);
  }
  return map;
}

// ─── Voice settings per scene emotion ────────────────────────────────────────
// Adjusts delivery style for each emotional beat
interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

const EMOTION_SETTINGS: Record<string, VoiceSettings> = {
  // Dark/intense emotions: less stable = more raw, higher style = more expressive
  tension:    { stability: 0.35, similarity_boost: 0.80, style: 0.65, use_speaker_boost: true },
  fear:       { stability: 0.30, similarity_boost: 0.85, style: 0.70, use_speaker_boost: true },
  anger:      { stability: 0.30, similarity_boost: 0.85, style: 0.75, use_speaker_boost: true },
  // Mystery/suspense: mid stability, controlled expression
  mystery:    { stability: 0.45, similarity_boost: 0.75, style: 0.50, use_speaker_boost: true },
  suspense:   { stability: 0.40, similarity_boost: 0.78, style: 0.55, use_speaker_boost: true },
  // Warm/positive emotions: still expressive — a hopeful line that is "consistent"
  // is a line being read, not felt.
  hope:       { stability: 0.42, similarity_boost: 0.72, style: 0.55, use_speaker_boost: true },
  wonder:     { stability: 0.40, similarity_boost: 0.70, style: 0.58, use_speaker_boost: true },
  joy:        { stability: 0.38, similarity_boost: 0.70, style: 0.65, use_speaker_boost: true },
  love:       { stability: 0.40, similarity_boost: 0.68, style: 0.55, use_speaker_boost: true },
  // Sadness/grief. These used to be the MOST stable settings in the table, which
  // is exactly backwards: high stability flattens the voice, and a flat voice
  // reading a devastating line is the definition of "sounds narrated". Grief is
  // the least controlled a person ever sounds — the delivery should break.
  sadness:    { stability: 0.32, similarity_boost: 0.68, style: 0.62, use_speaker_boost: true },
  grief:      { stability: 0.28, similarity_boost: 0.68, style: 0.70, use_speaker_boost: true },
  // Default: leans performed, not neutral. Every line here is a character speaking.
  default:    { stability: 0.38, similarity_boost: 0.75, style: 0.58, use_speaker_boost: true },
};

// eleven_v3 is the expressive model — it ACTS the line instead of reading it,
// which is the whole complaint about the narration sounding narrated. Verified
// against the with-timestamps endpoint (200 + full character alignment), so the
// karaoke subtitles keep working. Override with ELEVEN_MODEL if it ever regresses.
const VOICE_MODEL = process.env.ELEVEN_MODEL ?? "eleven_v3";

function getVoice(niche: string, tone: string, voiceProfile?: string | null) {
  // A scene that knows WHO speaks wins: use the character's archetype voice.
  const byProfile = getVoiceForProfile(voiceProfile);
  if (byProfile) return byProfile;
  return (
    NICHE_VOICE[niche.toLowerCase()] ??
    NICHE_VOICE[tone.toLowerCase()] ??
    NICHE_VOICE["default"]!
  );
}

function getEmotionSettings(emotion?: string | null): VoiceSettings {
  if (!emotion) return EMOTION_SETTINGS["default"]!;
  return EMOTION_SETTINGS[emotion.toLowerCase()] ?? EMOTION_SETTINGS["default"]!;
}

// ─── Clean narration text for the timestamps endpoint ─────────────────────────
// We intentionally DON'T inject SSML <break> tags here: the with-timestamps
// endpoint aligns subtitles to the exact characters spoken, and stray SSML would
// corrupt that alignment. ElevenLabs already adds natural pauses at punctuation,
// so we keep punctuation (drama preserved) and just strip noise.
function cleanNarration(text: string): string {
  return text
    .replace(/<break[^>]*\/>/g, " ")   // drop any SSML breaks the AI may have added
    .replace(/\[MOCK\]\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// A single word with its spoken time window (seconds) — used for karaoke subtitles
export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

// Build word-level timings from ElevenLabs character alignment.
function wordsFromAlignment(
  characters: string[],
  starts: number[],
  ends: number[],
): WordTiming[] {
  const words: WordTiming[] = [];
  let cur = "";
  let curStart: number | null = null;
  let lastEnd = 0;

  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i] ?? "";
    const isSpace = /\s/.test(ch);
    if (isSpace) {
      if (cur && curStart !== null) {
        words.push({ word: cur, start: round3(curStart), end: round3(lastEnd) });
      }
      cur = "";
      curStart = null;
    } else {
      if (curStart === null) curStart = starts[i] ?? lastEnd;
      cur += ch;
      lastEnd = ends[i] ?? lastEnd;
    }
  }
  if (cur && curStart !== null) {
    words.push({ word: cur, start: round3(curStart), end: round3(lastEnd) });
  }
  return words;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface VoiceGenerationResult {
  success: boolean;
  filePath?: string;
  voiceName?: string;
  durationMs?: number;
  error?: string;
  mock?: boolean;
  // NEW: real audio length + per-word timings for perfectly-synced subtitles
  audioDurationSec?: number;
  wordTimings?: WordTiming[];
}

export interface SceneVoiceResult extends VoiceGenerationResult {
  sceneNumber: number;
}

function getStorageDir(): string {
  if (process.env.VERCEL) return "/tmp/storage";
  const raw = process.env.STORAGE_PATH ?? "./storage";
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

// ─── Mock adapter ─────────────────────────────────────────────────────────────

async function generateMock(projectId: string, sceneNumber: number): Promise<VoiceGenerationResult> {
  const dir = join(getStorageDir(), "audio", projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${sceneNumber}.mp3`);
  const silentMp3 = Buffer.from(
    "fffb9000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "hex"
  );
  writeFileSync(filePath, silentMp3);
  return { success: true, filePath, voiceName: "mock", durationMs: 0, mock: true };
}

// ─── Real ElevenLabs adapter ──────────────────────────────────────────────────

async function generateReal(params: {
  text: string;
  niche: string;
  tone: string;
  emotion?: string | null;
  voiceProfile?: string | null;
  voiceOverride?: { voiceId: string; name: string } | null;  // unique per-character voice
  projectId: string;
  sceneNumber: number;
}): Promise<VoiceGenerationResult> {
  const { text, niche, tone, emotion, voiceProfile, voiceOverride, projectId, sceneNumber } = params;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  // A per-character voice (unique per speaker) wins; else fall back to archetype.
  const voice = voiceOverride ?? getVoice(niche, tone, voiceProfile);
  const settings = getEmotionSettings(emotion);
  const narration = cleanNarration(text);
  const t0 = Date.now();

  // with-timestamps returns audio (base64) + character-level alignment so we can
  // build perfectly-synced karaoke subtitles instead of guessing the timing.
  const tts = (voiceId: string) => fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text: narration, model_id: VOICE_MODEL, voice_settings: settings }),
    }
  );

  let response = await tts(voice.voiceId);
  let usedVoiceName = voice.name;

  // If the configured (Spanish library) voice isn't allowed on this plan, fall back
  // to a premade voice that always works — so production never hard-fails.
  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 402 && /library voices|payment_required/i.test(errText)) {
      const fb = getPremadeFallback(voiceProfile);
      if (fb !== voice.voiceId) {
        console.warn(`[ElevenLabs] voice ${voice.voiceId} blocked on this plan, falling back to premade ${fb}`);
        response = await tts(fb);
        usedVoiceName = `${voice.name} → premade`;
      }
    }
    if (!response.ok) {
      const finalErr = response.bodyUsed ? errText : await response.text();
      throw new Error(`ElevenLabs API error ${response.status}: ${finalErr}`);
    }
  }

  const json = (await response.json()) as {
    audio_base64?: string;
    alignment?: {
      characters?: string[];
      character_start_times_seconds?: number[];
      character_end_times_seconds?: number[];
    };
  };

  if (!json.audio_base64) throw new Error("ElevenLabs returned no audio");
  const buffer = Buffer.from(json.audio_base64, "base64");

  // Extract word timings + real audio duration from the alignment
  let wordTimings: WordTiming[] | undefined;
  let audioDurationSec: number | undefined;
  const a = json.alignment;
  if (a?.characters && a.character_start_times_seconds && a.character_end_times_seconds) {
    wordTimings = wordsFromAlignment(
      a.characters,
      a.character_start_times_seconds,
      a.character_end_times_seconds,
    );
    const ends = a.character_end_times_seconds;
    audioDurationSec = round3(ends[ends.length - 1] ?? 0);
  }

  const dir = join(getStorageDir(), "audio", projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${sceneNumber}.mp3`);
  writeFileSync(filePath, buffer);

  return {
    success: true,
    filePath,
    voiceName: usedVoiceName,
    durationMs: Date.now() - t0,
    audioDurationSec,
    wordTimings,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateSceneVoice(params: {
  text: string;
  niche: string;
  tone: string;
  emotion?: string | null;
  voiceProfile?: string | null;
  voiceOverride?: { voiceId: string; name: string } | null;
  projectId: string;
  sceneNumber: number;
}): Promise<VoiceGenerationResult> {
  const isMock = process.env.FORCE_MOCK_VOICE === "true" || !process.env.ELEVENLABS_API_KEY;
  if (isMock) return generateMock(params.projectId, params.sceneNumber);

  // Retry once on transient failure (rate limit / network) so a single hiccup
  // doesn't leave a scene with no audio — which previously misaligned the render.
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await generateReal(params);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[ElevenLabs] scene ${params.sceneNumber} attempt ${attempt + 1} failed:`, lastError);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return { success: false, error: lastError };
}

// Run an async mapper over items with a max number running at once (rate-limit safe).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

// Parallel voices at once. ElevenLabs free/starter plans allow only 2 concurrent
// requests (429 concurrent_limit_exceeded above that), so default to 2. Raise via
// VOICE_CONCURRENCY once you upgrade the ElevenLabs plan.
const VOICE_CONCURRENCY = Math.max(1, Number(process.env.VOICE_CONCURRENCY ?? 2) || 2);

export async function generateProjectVoice(params: {
  projectId: string;
  niche: string;
  tone: string;
  scenes: Array<{ scene_number: number; narration_text: string; emotion?: string | null; voice_profile?: string | null; speaker?: string | null }>;
}): Promise<SceneVoiceResult[]> {
  // Assign a UNIQUE voice to each distinct character so two same-archetype
  // characters never sound identical (the per-character voice fix).
  const voiceByChar = assignCharacterVoices(
    params.scenes.map((s) => ({ name: s.speaker, voice_profile: s.voice_profile })),
  );
  return mapWithConcurrency(params.scenes, VOICE_CONCURRENCY, async (scene) => {
    const override = scene.speaker ? voiceByChar.get(scene.speaker.trim().toLowerCase()) ?? null : null;
    const result = await generateSceneVoice({
      text: scene.narration_text,
      niche: params.niche,
      tone: params.tone,
      emotion: scene.emotion,
      voiceProfile: scene.voice_profile,
      voiceOverride: override,
      projectId: params.projectId,
      sceneNumber: scene.scene_number,
    });
    return { ...result, sceneNumber: scene.scene_number };
  });
}

export function getVoiceInfo(niche: string, tone: string) {
  return getVoice(niche, tone);
}
