// ─── Native character audio ──────────────────────────────────────────────────
// Seedance v1.5 returns clips with a real audio track: the characters speak, in
// Spanish, with emotion. We were throwing it away — the assembler replaced it
// with an ElevenLabs narration, which is exactly why the finished videos "sounded
// narrated" no matter how much the script was rewritten as dialogue.
//
// Two things have to be true for that audio to be usable:
//
//  1. The characters must say the SCRIPT's lines. Left to itself the model
//     improvises: the first clip we checked came back with "no puedo abrir mi ojo
//     al verlo" — fluent, emotional, and not in the story. The dialogue has to be
//     in the prompt, quoted, or you get a well-acted scene from another film.
//
//  2. We must know what was actually said, to burn captions. Whisper gives
//     word-level timestamps for a fraction of a cent, so the karaoke subtitles
//     survive the switch — they just describe the generated performance instead
//     of dictating it.

import { fal } from "@fal-ai/client";

export interface SpokenLine {
  speaker?: string | null;
  text: string;
}

// Build the spoken part of a block's video prompt.
//
// Order matters: the dialogue goes LAST and is quoted verbatim. Buried in the
// middle of camera instructions it gets treated as description and paraphrased.
export function buildDialogueDirection(lines: SpokenLine[]): string {
  const spoken = lines.map((l) => l.text?.trim()).filter((t): t is string => Boolean(t));
  if (!spoken.length) return "";

  const quoted = lines
    .filter((l) => l.text?.trim())
    .map((l) => (l.speaker ? `${l.speaker} says, in Spanish: "${l.text.trim()}"` : `A character says, in Spanish: "${l.text.trim()}"`))
    .join(" Then ");

  return (
    " The characters SPEAK this dialogue out loud, in Spanish, in this exact order, " +
    "with the emotion the scene calls for. Do not invent other lines, do not narrate, " +
    "no voice-over — only these characters speaking to each other on camera. " +
    quoted
  );
}

export interface Transcribed {
  text: string;
  words: Array<{ word: string; start: number; end: number }>;
}

// What the clip ACTUALLY says, with word timings, so captions match the take.
// Returns null on any failure — a video without captions still ships.
export async function transcribeClip(clipUrl: string, language = "es"): Promise<Transcribed | null> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) return null;
  try {
    fal.config({ credentials: apiKey });
    const model = process.env.TRANSCRIBE_MODEL ?? "fal-ai/whisper";
    const r = await fal.subscribe(model, {
      input: { audio_url: clipUrl, task: "transcribe", language, chunk_level: "word" },
      logs: false,
    }) as Record<string, unknown>;
    const d = (r?.["data"] ?? r) as Record<string, unknown>;
    const chunks = (d?.["chunks"] ?? []) as Array<{ timestamp?: [number, number]; text?: string }>;
    const words = chunks
      .filter((c) => Array.isArray(c.timestamp) && typeof c.text === "string")
      .map((c) => ({
        word: (c.text ?? "").trim(),
        start: c.timestamp![0],
        end: Math.max(c.timestamp![1], c.timestamp![0] + 0.08),   // zero-length words break the caption timing
      }))
      .filter((w) => w.word.length > 0);
    const text = String(d?.["text"] ?? "").trim();
    if (!text && !words.length) return null;
    return { text, words };
  } catch (e) {
    console.error("[transcribe]", e instanceof Error ? e.message.slice(0, 160) : e);
    return null;
  }
}
