import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Voice Map by NICHE (primary) then tone (fallback) ───────────────────────
// Each niche gets a voice that matches its emotional world
const NICHE_VOICE: Record<string, { voiceId: string; name: string }> = {
  terror:       { voiceId: "N2lVS1w4EtoT3dr4eOWO", name: "Callum - Husky Trickster" },
  horror:       { voiceId: "N2lVS1w4EtoT3dr4eOWO", name: "Callum - Husky Trickster" },
  thriller:     { voiceId: "SOYHLrjzK2X1ezoPC6cr", name: "Harry - Fierce Warrior" },
  misterio:     { voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George - Warm Storyteller" },
  mystery:      { voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George - Warm Storyteller" },
  romance:      { voiceId: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice - Engaging" },
  inspiracional:{ voiceId: "EXAVITQu4vr4xnSDxMaL", name: "Sarah - Confident" },
  inspirational:{ voiceId: "EXAVITQu4vr4xnSDxMaL", name: "Sarah - Confident" },
  fantasia:     { voiceId: "IKne3meq5aSn9XLyUdCD", name: "Charlie - Confident" },
  fantasy:      { voiceId: "IKne3meq5aSn9XLyUdCD", name: "Charlie - Confident" },
  historia:     { voiceId: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger - Resonant" },
  drama:        { voiceId: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger - Resonant" },
  comedy:       { voiceId: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam - Social Media Creator" },
  comedia:      { voiceId: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam - Social Media Creator" },
  documentary:  { voiceId: "SAz9YHcvj6GT2YYXdXww", name: "River - Informative" },
  documental:   { voiceId: "SAz9YHcvj6GT2YYXdXww", name: "River - Informative" },
  default:      { voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George - Warm Storyteller" },
};

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
  // Warm/positive emotions: higher stability = more consistent, softer style
  hope:       { stability: 0.65, similarity_boost: 0.72, style: 0.30, use_speaker_boost: true },
  wonder:     { stability: 0.60, similarity_boost: 0.70, style: 0.35, use_speaker_boost: true },
  joy:        { stability: 0.65, similarity_boost: 0.70, style: 0.40, use_speaker_boost: true },
  love:       { stability: 0.70, similarity_boost: 0.68, style: 0.25, use_speaker_boost: true },
  // Sadness/grief: very stable = controlled, low style = subdued
  sadness:    { stability: 0.72, similarity_boost: 0.65, style: 0.20, use_speaker_boost: false },
  grief:      { stability: 0.75, similarity_boost: 0.65, style: 0.18, use_speaker_boost: false },
  // Default: balanced
  default:    { stability: 0.50, similarity_boost: 0.75, style: 0.40, use_speaker_boost: true },
};

function getVoice(niche: string, tone: string) {
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

// ─── Add dramatic SSML pauses to narration text ───────────────────────────────
// Adds pauses at sentence boundaries and after key phrases for cinematic effect
function addSsmlPauses(text: string): string {
  return text
    // Pause after ending punctuation before next sentence
    .replace(/([.!?])\s+([A-ZÁÉÍÓÚÑ])/g, '$1 <break time="0.4s"/> $2')
    // Longer pause after ellipsis (dramatic effect)
    .replace(/\.\.\.\s*/g, '... <break time="0.6s"/> ')
    // Pause after em dash
    .replace(/—\s*/g, '— <break time="0.3s"/> ')
    // Strip [MOCK] prefix if present
    .replace(/^\[MOCK\]\s*/i, "")
    .trim();
}

export interface VoiceGenerationResult {
  success: boolean;
  filePath?: string;
  voiceName?: string;
  durationMs?: number;
  error?: string;
  mock?: boolean;
}

export interface SceneVoiceResult extends VoiceGenerationResult {
  sceneNumber: number;
}

function getStorageDir(): string {
  if (process.env.VERCEL) return "/tmp/storage";
  const raw = process.env.STORAGE_PATH ?? "./storage";
  const { isAbsolute, resolve } = require("path") as typeof import("path");
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
  projectId: string;
  sceneNumber: number;
}): Promise<VoiceGenerationResult> {
  const { text, niche, tone, emotion, projectId, sceneNumber } = params;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const voice = getVoice(niche, tone);
  const settings = getEmotionSettings(emotion);
  const narration = addSsmlPauses(text);
  const t0 = Date.now();

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: narration,
        model_id: "eleven_multilingual_v2",
        voice_settings: settings,
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const dir = join(getStorageDir(), "audio", projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${sceneNumber}.mp3`);
  writeFileSync(filePath, buffer);

  return {
    success: true,
    filePath,
    voiceName: voice.name,
    durationMs: Date.now() - t0,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateSceneVoice(params: {
  text: string;
  niche: string;
  tone: string;
  emotion?: string | null;
  projectId: string;
  sceneNumber: number;
}): Promise<VoiceGenerationResult> {
  const isMock = process.env.FORCE_MOCK_VOICE === "true" || !process.env.ELEVENLABS_API_KEY;
  if (isMock) return generateMock(params.projectId, params.sceneNumber);

  try {
    return await generateReal(params);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[ElevenLabs]", error);
    return { success: false, error };
  }
}

export async function generateProjectVoice(params: {
  projectId: string;
  niche: string;
  tone: string;
  scenes: Array<{ scene_number: number; narration_text: string; emotion?: string | null }>;
}): Promise<SceneVoiceResult[]> {
  const results: SceneVoiceResult[] = [];

  for (const scene of params.scenes) {
    const result = await generateSceneVoice({
      text: scene.narration_text,
      niche: params.niche,
      tone: params.tone,
      emotion: scene.emotion,
      projectId: params.projectId,
      sceneNumber: scene.scene_number,
    });
    results.push({ ...result, sceneNumber: scene.scene_number });
    if (!result.mock) await new Promise((r) => setTimeout(r, 600));
  }

  return results;
}

export function getVoiceInfo(niche: string, tone: string) {
  return getVoice(niche, tone);
}
