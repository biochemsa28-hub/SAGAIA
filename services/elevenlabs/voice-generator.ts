import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Voice Map by tone ────────────────────────────────────────────────────────
// Mapped to real ElevenLabs voice IDs from the account
const VOICE_MAP: Record<string, { voiceId: string; name: string }> = {
  horror:        { voiceId: "N2lVS1w4EtoT3dr4eOWO", name: "Callum - Husky Trickster" },
  thriller:      { voiceId: "SOYHLrjzK2X1ezoPC6cr", name: "Harry - Fierce Warrior" },
  mystery:       { voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George - Warm Storyteller" },
  inspirational: { voiceId: "EXAVITQu4vr4xnSDxMaL", name: "Sarah - Confident" },
  romance:       { voiceId: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice - Engaging" },
  comedy:        { voiceId: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam - Social Media Creator" },
  documentary:   { voiceId: "SAz9YHcvj6GT2YYXdXww", name: "River - Informative" },
  fantasy:       { voiceId: "IKne3meq5aSn9XLyUdCD", name: "Charlie - Confident" },
  drama:         { voiceId: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger - Resonant" },
  default:       { voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George - Warm Storyteller" },
};

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

function getVoice(tone: string) {
  return VOICE_MAP[tone.toLowerCase()] ?? VOICE_MAP["default"]!;
}

function getStorageDir(): string {
  // On Vercel the filesystem is read-only except /tmp
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
  // Write a tiny valid MP3 header (silent, 1 frame) so the file isn't empty
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
  tone: string;
  projectId: string;
  sceneNumber: number;
}): Promise<VoiceGenerationResult> {
  const { text, tone, projectId, sceneNumber } = params;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const voice = getVoice(tone);
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
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.4,
          use_speaker_boost: true,
        },
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
  tone: string;
  projectId: string;
  sceneNumber: number;
}): Promise<VoiceGenerationResult> {
  const isMock = process.env.FORCE_MOCK_VOICE === "true" || !process.env.ELEVENLABS_API_KEY;

  if (isMock) {
    return generateMock(params.projectId, params.sceneNumber);
  }

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
  tone: string;
  scenes: Array<{ scene_number: number; narration_text: string }>;
}): Promise<SceneVoiceResult[]> {
  const results: SceneVoiceResult[] = [];

  for (const scene of params.scenes) {
    const result = await generateSceneVoice({
      text: scene.narration_text,
      tone: params.tone,
      projectId: params.projectId,
      sceneNumber: scene.scene_number,
    });
    results.push({ ...result, sceneNumber: scene.scene_number });

    // Respect ElevenLabs rate limit: ~2 req/s on free tier
    if (!result.mock) await new Promise((r) => setTimeout(r, 600));
  }

  return results;
}

export function getVoiceInfo(tone: string) {
  return getVoice(tone);
}
