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
  /** La emoción de ESTA línea, no la del bloque. Ver buildDialogueDirection. */
  emotion?: string | null;
  /** Qué hace el personaje mientras dice ESTA línea (animation_prompt de su escena). */
  action?: string | null;
  /** "antes | después": lo que hacen los cuerpos alrededor de la línea. */
  physicalAction?: string | null;
  /** Qué se mueve en el AMBIENTE durante esta línea (lluvia, cortina, humo). */
  environment?: string | null;
}

// Build the spoken part of a block's video prompt.
//
// Order matters: the dialogue goes LAST and is quoted verbatim. Buried in the
// middle of camera instructions it gets treated as description and paraphrased.
export function buildDialogueDirection(lines: SpokenLine[], segundos?: number): string {
  const spoken = lines.map((l) => l.text?.trim()).filter((t): t is string => Boolean(t));
  if (!spoken.length) return "";

  // Un NOMBRE no identifica a nadie dentro de una imagen. Medido en un video real:
  // con "Valeria dice X. Después Renata dice Y", el modelo puso las dos líneas en
  // la boca del personaje enfocado — incluida la que le hablaba a él. La única
  // forma de que reparta bien los parlamentos es decirle cómo SE VE cada uno.
  const util = lines.filter((l) => l.text?.trim());
  const comoSeVe = (l: SpokenLine) => (l.look ?? "").trim() || (l.speaker ? `the character named ${l.speaker}` : "the character on screen");

  // DIRECCIÓN LÍNEA POR LÍNEA, no por bloque.
  //
  // Un bloque agrupa varias escenas en un solo clip, y antes se le mandaba la
  // cámara, la acción y la emoción de la PRIMERA escena junto con el diálogo de
  // TODAS. La imagen mostraba el momento de la escena 3 mientras se escuchaban las
  // líneas de la 3, la 4 y la 5 — de ahí que lo que se dice no coincida con lo que
  // pasa. Y todo el clip se actuaba con una sola emoción aunque el bloque recorra
  // un arco entero.
  //
  // Cada línea lleva ahora SU emoción y SU acción. Es como se dirige de verdad: no
  // se le dice a un actor "hacé la escena triste", se le dice qué hace y qué siente
  // en cada frase.
  // ── EL TIEMPO SE REPARTE, NO SE SUGIERE ────────────────────────────────────
  //
  // "Primero se besan, después habla" deja que el modelo decida cuánto dura cada
  // cosa, y siempre decide lo mismo: la acción física dura un parpadeo y el
  // resto es gente hablando. Medido en una prueba real de este mismo modelo, un
  // prompt con tramos explícitos —"Shot 1 (0-4s) … CUT … Shot 2 (4-8s)"— produjo
  // un corte limpio exactamente en el segundo 5. Lo que se pide con un reloj se
  // cumple; lo que se pide con un adverbio, no.
  //
  // Reparto por línea: la acción de entrada se lleva el primer tercio, la línea
  // el grueso, y la reacción el cierre. Sin duración conocida no se inventan
  // números — se vuelve al orden sin tiempos, que es peor pero no miente.
  const total = segundos && segundos > 1 ? segundos : 0;
  const porLinea = total ? total / util.length : 0;
  const reloj = (desde: number, hasta: number) => `(${desde.toFixed(1)}-${hasta.toFixed(1)}s)`;

  const quoted = util
    .map((l, i) => {
      const verbo = i === 0 ? "says" : "answers";
      const accion = (l.action ?? "").trim();
      const tells = (l.emotion ?? "").trim() ? tellsDe(l.emotion) : "";
      // LA ACCIÓN FÍSICA VA EN EL TIEMPO, NO EN PARALELO.
      //
      // Todo lo que se le mandaba al modelo ocurría MIENTRAS se hablaba, así que
      // el clip era gente diciendo frases y, de fondo, una cortina moviéndose.
      // Lo que hace que una escena sea una escena pasa ANTES de que alguien
      // hable —se están besando, ella se separa— y DESPUÉS —se sostienen la
      // mirada—. Sin ese orden no hay beso ni hay miradas: hay una videollamada.
      const [antes, despues] = (l.physicalAction ?? "").split("|").map((s) => s.trim());
      // El ambiente es un TERCER eje, aparte del personaje y de la cámara. Sin él,
      // en un plano solo se mueve la cara y el resultado se lee como una foto que
      // habla. La lluvia corriendo por el vidrio detrás convierte el mismo plano en
      // una toma.
      const ambiente = (l.environment ?? "").trim();

      // Tramos de esta línea. La acción de entrada necesita tiempo REAL para
      // leerse: un beso de tres cuadros no es un beso.
      const t0 = porLinea * i;
      const tAntes = antes ? t0 + porLinea * 0.32 : t0;
      const tHabla = despues ? t0 + porLinea * 0.82 : t0 + porLinea;

      return (
        // Primero el cuerpo, después la voz: así es como se lee una escena.
        // El reloj SOLO si hay duración real. Sin ella salía "(0.0-0.0s)", que
        // no informa nada y encima le dice al modelo que esa acción dura cero.
        (antes
          ? `${total ? reloj(t0, tAntes) + " " : ""}FIRST, before any words — hold this long enough to read: ${antes}. THEN, `
          : "") +
        (total ? `${reloj(tAntes, tHabla)} ` : "") +
        `${comoSeVe(l)} ${verbo}, in Spanish: "${l.text.trim()}"` +
        (accion ? ` — while doing this: ${accion}` : "") +
        (tells ? ` — performed with: ${tells}` : "") +
        (ambiente ? ` — and in the environment, independently of the character: ${ambiente}` : "") +
        (despues
          ? `. ${total ? reloj(tHabla, t0 + porLinea) + " " : ""}IMMEDIATELY AFTER the line, without speaking: ${despues}`
          : "")
      );
    })
    .join(" THEN, and only after the previous line is finished: ");

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

  // LA ACCIÓN SE EJECUTA COMPLETA O NO EXISTE.
  //
  // Un modelo de video, ante una acción física, tiende a insinuarla: el beso es
  // un acercamiento, la caída es un tambaleo, el grito es una boca abierta. Sale
  // barato en cómputo y arruina la escena, porque el espectador ve la intención
  // y no el hecho. Hay que decirle que el gesto llega hasta el final.
  const accionCompleta =
    " PHYSICAL ACTIONS ARE PERFORMED IN FULL, never implied or half-started. " +
    "If they kiss, their lips meet and stay together. If someone falls, the body actually hits the ground. " +
    "If someone screams, the mouth opens wide, the neck tenses and the whole body commits to it. " +
    "If someone slaps, the hand lands. A gesture that stops halfway reads as a mistake, not as restraint. " +
    "Give each action the seconds it needs — the timings below are the schedule, follow them.";

  return (
    " The characters SPEAK this dialogue out loud, in Spanish, in this exact order, " +
    "with the emotion the scene calls for. Do not invent other lines, do not narrate, " +
    "no voice-over — only these characters speaking to each other on camera." +
    turnos +
    accionCompleta +
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
  // El mapa se inclinaba a lo dramático y los nichos nuevos caían al genérico: una
  // escena de chisme dirigida como un duelo, o un remate de comedia actuado con
  // gravedad. La emoción la escribe el guion según el nicho, así que estas son las
  // que producen comedia, chisme, confesión, documental y terror.
  complicidad:  "leaning in toward the camera, eyebrows lifting, a conspiratorial half-smile, the voice dropping as if someone might hear",
  incredulidad: "the head pulling back, eyes widening, a short disbelieving laugh, a hand rising to the mouth",
  burla:        "one eyebrow up, a crooked smile held a beat too long, the eyes bright and unimpressed",
  euforia:      "the whole face opening, a laugh that arrives before the words, the body unable to stay still",
  incomodidad:  "a tight polite smile, the eyes darting for an exit, hands finding something to hold",
  asombro:      "the jaw slackening, a slow blink, the head tilting as the fact lands",
  pavor:        "the body locked in place, breath stopping entirely, only the eyes moving",
  alivio_amargo:"a laugh that turns wet halfway, the shoulders dropping while the eyes fill",
  resignacion:  "a long exhale, a small nod to nobody, the gaze settling on the floor",
  nervios:      "a rushed swallow, fingers tapping, the voice starting before it is ready",
  alegria:      "the eyes creasing before the mouth moves, a laugh escaping mid-sentence, the shoulders lifting",
  envidia:      "a smile that never reaches the eyes, the gaze tracking the other person, the jaw setting when they look away",
  esperanza:    "the chin lifting slightly, the eyes fixing on something past the camera, breath steadying",
  orgullo:      "the spine straightening, a slow blink, the smallest smile withheld on purpose",
  odio:         "absolute stillness in the face, the eyes cold and unblinking, the voice flat and quiet",
};

// La emoción llega del guion en español y en una sola palabra, pero no siempre es
// exactamente una de las claves ("traición que quema por dentro"). Se busca por
// coincidencia parcial antes de caer al genérico.
// Los tells físicos crudos de una emoción, sin envoltorio. Se usan dos veces: como
// dirección general del clip y, sobre todo, línea por línea dentro del diálogo.
export function tellsDe(emotion: string | null | undefined): string {
  const e = (emotion ?? "").toLowerCase().normalize("NFD").trim();
  const sinAcentos = e.replace(/[̀-ͯ]/g, "");
  if (!sinAcentos) return "";
  const clave = Object.keys(ACTUACION).find((k) => sinAcentos.includes(k) || k.includes(sinAcentos.split(/\s+/)[0] ?? ""));
  return clave ? ACTUACION[clave]! : "";
}

// buildPerformanceDirection se eliminó: daba UNA emoción para todo el clip, que es
// justamente lo que hacía que un bloque de tres escenas se actuara con la cara de
// la primera. La dirección va ahora línea por línea, dentro de
// buildDialogueDirection.

export interface Transcribed {
  text: string;
  words: Array<{ word: string; start: number; end: number }>;
}

// What the clip ACTUALLY says, with word timings, so captions match the take.
// Returns null on any failure — a video without captions still ships.
export async function transcribeClip(clipUrl: string, language = "es"): Promise<Transcribed | null> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    console.warn("[transcribe] sin FAL_API_KEY — no hay subtítulos medidos");
    return null;
  }
  // ESCALERA DE INTENTOS. Se pedía una sola combinación de parámetros y si el
  // modelo no la aceptaba, la respuesta volvía vacía y el sistema se quedaba sin
  // tiempos de palabra para TODAS las escenas — que es lo que pasó en producción.
  // Un parámetro que el modelo dejó de aceptar no debería costar los subtítulos
  // del video entero, así que se prueba de lo más específico a lo más básico.
  const intentos: Array<{ input: Record<string, unknown>; nota: string }> = [
    { input: { audio_url: clipUrl, task: "transcribe", language, chunk_level: "word" }, nota: "word + language" },
    { input: { audio_url: clipUrl, task: "transcribe", chunk_level: "word" }, nota: "word, sin language" },
    { input: { audio_url: clipUrl, task: "transcribe", language }, nota: "sin chunk_level" },
    { input: { audio_url: clipUrl }, nota: "mínimo" },
  ];

  try {
    fal.config({ credentials: apiKey });
    const model = process.env.TRANSCRIBE_MODEL ?? "fal-ai/whisper";
    let d: Record<string, unknown> = {};
    for (const [k, intento] of intentos.entries()) {
      const r = await fal.subscribe(model, { input: intento.input, logs: false }).catch((e: unknown) => {
        console.warn(`[transcribe] intento "${intento.nota}" falló: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
        return null;
      }) as Record<string, unknown> | null;
      if (!r) continue;
      d = (r?.["data"] ?? r) as Record<string, unknown>;
      const hayAlgo = String(d?.["text"] ?? "").trim().length > 0 || Array.isArray(d?.["chunks"]);
      if (hayAlgo) {
        if (k > 0) console.log(`[transcribe] recuperado con "${intento.nota}"`);
        break;
      }
      console.warn(`[transcribe] intento "${intento.nota}" devolvió vacío (claves: ${Object.keys(d ?? {}).join(",") || "ninguna"})`);
    }
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
    // EL CAMINO SILENCIOSO. Esta rama devolvía null sin decir una palabra, y por
    // eso "Whisper no transcribe nada" fue invisible durante toda una jornada: el
    // que llama solo registra `[nativo]` cuando HAY transcripción, así que un
    // fallo aquí no deja ningún rastro en ningún log. Un fallo que no se ve es el
    // más caro de todos — el video se termina igual, con los subtítulos estirados.
    if (!text && !words.length) {
      console.warn(
        "[transcribe] respuesta SIN texto ni palabras. Claves recibidas: " +
        Object.keys(d ?? {}).join(", ") +
        " — si no aparecen 'text' ni 'chunks', el modelo o su formato de salida cambió",
      );
      return null;
    }
    // Con texto pero sin palabras hay subtítulos, pero sin sincronía: conviene
    // saberlo, porque el síntoma en pantalla es idéntico al fallo total.
    if (text && !words.length) {
      console.warn(`[transcribe] hay texto pero NO tiempos por palabra (chunk_level) — subtítulos sin sincronía fina`);
    }
    return { text, words };
  } catch (e) {
    console.error("[transcribe] falló:", e instanceof Error ? e.message.slice(0, 200) : e);
    return null;
  }
}
