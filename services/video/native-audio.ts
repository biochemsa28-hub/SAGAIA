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
  /** Cómo SE VE quien habla ("the woman in the red dress"). Ver abajo. */
  look?: string | null;
  text: string;
}

// Build the spoken part of a block's video prompt.
//
// Order matters: the dialogue goes LAST and is quoted verbatim. Buried in the
// middle of camera instructions it gets treated as description and paraphrased.
export function buildDialogueDirection(lines: SpokenLine[]): string {
  const spoken = lines.map((l) => l.text?.trim()).filter((t): t is string => Boolean(t));
  if (!spoken.length) return "";

  // Un NOMBRE no identifica a nadie dentro de una imagen. Medido en un video real:
  // con "Valeria dice X. Después Renata dice Y", el modelo puso las dos líneas en
  // la boca del personaje enfocado — incluida la que le hablaba a él. La única
  // forma de que reparta bien los parlamentos es decirle cómo SE VE cada uno.
  const util = lines.filter((l) => l.text?.trim());
  const comoSeVe = (l: SpokenLine) => (l.look ?? "").trim() || (l.speaker ? `the character named ${l.speaker}` : "the character on screen");

  const quoted = util
    .map((l, i) => {
      const verbo = i === 0 ? "says" : "answers";
      return `${comoSeVe(l)} ${verbo}, in Spanish: "${l.text.trim()}"`;
    })
    .join(" Then ");

  // ¿Hay más de una persona hablando? Si la hay, hace falta decir explícitamente
  // que se turnan y que el que escucha NO mueve la boca — sin eso el modelo anima
  // a los dos hablando encima, que es peor que atribuir mal.
  const distintos = new Set(util.map((l) => comoSeVe(l).toLowerCase()));
  const turnos = distintos.size > 1
    ? " IMPORTANT — this is a CONVERSATION with turn-taking: exactly ONE person speaks at a time, " +
      "in the order given. While one speaks the other LISTENS and reacts — their lips do NOT move. " +
      "Never put a line in the mouth of the wrong person, and never have both speak at once. " +
      "The camera favours whoever is speaking, then the reaction of the other."
    : "";

  return (
    " The characters SPEAK this dialogue out loud, in Spanish, in this exact order, " +
    "with the emotion the scene calls for. Do not invent other lines, do not narrate, " +
    "no voice-over — only these characters speaking to each other on camera." +
    turnos +
    " " + quoted
  );
}

// ─── Dirección de actuación ──────────────────────────────────────────────────
// El guion define una emoción por escena y ese dato NUNCA llegaba al modelo de
// video: se le mandaba el movimiento de cámara y el diálogo, y la interpretación
// quedaba librada al azar. Por eso los personajes dicen líneas devastadoras con
// cara neutra.
//
// Un modelo de video no sabe actuar "traición": sabe hacer una mandíbula que se
// tensa, un parpadeo que se demora, una lágrima que se queda en el borde. Se le
// dan los TELLS FÍSICOS, que es como se dirige a un actor de verdad.
const ACTUACION: Record<string, string> = {
  traicion:     "jaw tightening, eyes wide then narrowing, shallow breath, one tear held back at the lash line, voice thinning on the last words",
  dolor:        "eyes wet and unblinking, chin trembling, the throat working before speaking, the voice breaking mid-sentence",
  duelo:        "eyes wet and unblinking, chin trembling, shoulders dropping, a long blink that lets a tear fall",
  rabia:        "nostrils flaring, tendons visible in the neck, a sharp exhale before the line, clipped hard consonants",
  ira:          "nostrils flaring, tendons visible in the neck, a sharp exhale before the line, clipped hard consonants",
  miedo:        "pupils wide, rapid shallow breathing, body very still, eyes flicking to the side",
  panico:       "rapid shallow breathing, trembling hands, eyes darting, voice pitched high and tight",
  culpa:        "eyes cast down, fingers worrying at each other, a swallow before speaking, a small voice",
  verguenza:    "eyes cast down, a flush across the cheeks, turning slightly away from the other person",
  amor:         "lips parting slightly, a slow blink, breath held for a beat, the smallest lean forward",
  deseo:        "lips parting slightly, a slow blink, breath held, eyes moving from eyes to mouth and back",
  sorpresa:     "a micro-freeze, then a hard blink, lips apart, the head pulling back an inch",
  desesperacion:"tears streaming freely, the voice cracking apart, hands reaching and stopping",
  tristeza:     "wet eyes that keep blinking them away, a tight small smile that fails, the voice going quiet",
  alivio:       "the shoulders finally dropping, a long exhale, wet eyes and the beginning of a smile",
  determinacion:"the jaw setting, a steady unblinking gaze, the chin lifting, the voice low and even",
  ternura:      "the eyes softening, a barely-there smile, the head tilting a fraction, the voice dropping to almost nothing",
  soledad:      "the gaze unfocused past the camera, the body small in the frame, a slow blink, no one to look at",
  nostalgia:    "the eyes drifting away mid-sentence, a smile that arrives and then hurts, a long slow blink",
  humillacion:  "the eyes dropping, a hard swallow, the face heating, forcing the chin back up",
};

// La emoción llega del guion en español y en una sola palabra, pero no siempre es
// exactamente una de las claves ("traición que quema por dentro"). Se busca por
// coincidencia parcial antes de caer al genérico.
export function buildPerformanceDirection(emotion: string | null | undefined): string {
  const e = (emotion ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  // Los acentos se quitan con el rango de marcas combinantes escrito en \u para
  // que no dependa de cómo guarde el archivo el editor.
  const sinAcentos = e.replace(/[̀-ͯ]/g, "");
  let tells = "";
  if (sinAcentos) {
    const clave = Object.keys(ACTUACION).find((k) => sinAcentos.includes(k) || k.includes(sinAcentos.split(/\s+/)[0] ?? ""));
    if (clave) tells = ACTUACION[clave]!;
  }
  if (!tells) {
    tells = "genuine micro-expressions, the eyes carrying the feeling before the mouth does, breath visible in the delivery";
  }
  return (
    ` PERFORMANCE — this is the whole point of the shot: the character truly FEELS this. ` +
    `${tells}. The emotion is visible on the FACE, in real time, changing as the line is said — ` +
    `not a fixed expression held for the whole clip. Real film acting, not a posed portrait.`
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
