// ─── Narrative blocks ────────────────────────────────────────────────────────
// One animated clip per GROUP of consecutive scenes, instead of one per scene.
//
// The measurement that drove this: a single 8s clip generated from a storyboard
// sheet came back with THREE distinct camera setups and a clear progression
// (close → medium → push in). A 3.8s scene animated on its own has no room for
// that — the model barely gets one move out of it. So grouping scenes until they
// fill ~10s buys real coverage AND costs less: a 53s video needs 6 blocks, not 14
// clips ($3.72 of motion instead of $8.68).
//
// The other half of the idea is continuity. Each block's sheet is generated FROM
// the previous block's closing frame, so wardrobe, lighting and location carry
// forward and the finished video reads as one continuous piece rather than six
// clips glued together.

export interface BlockScene {
  scene_number: number;
  image_url?: string | null;
  image_prompt?: string | null;
  narration_text?: string | null;
  audio_seconds?: number | null;
  duration_seconds?: number | null;
  /** Quién habla. Un bloque NUNCA mezcla hablantes — ver planNarrativeBlocks. */
  speaker?: string | null;
}

export interface NarrativeBlock {
  /** The scene that owns the generated clip (its asset row carries the block). */
  leadScene: number;
  /** Every scene this block covers, in order. */
  scenes: number[];
  /** Total narration length the clip has to cover. */
  seconds: number;
  /** One beat per scene, used as the sheet's panel descriptions. */
  beats: string[];
  /** The frame the sheet is built from — the lead scene's own image. */
  referenceImageUrl: string;
  /**
   * El bloque pide más segundos de los que un clip puede durar. Solo puede pasar
   * cuando UNA escena sola ya excede el máximo: el planificador cierra los bloques
   * antes de pasarse, pero no puede partir una escena en dos. Marcarlo es lo único
   * que convierte "el video se congeló" en "la escena N tiene el parlamento
   * demasiado largo", que es un problema de guion y se arregla en el guion.
   */
  overflow: boolean;
}

// Spanish speech runs at roughly 14 characters per second. That estimate matters
// now: with native audio there IS no ElevenLabs track to measure, so a planner
// that waits for audio_seconds falls back to the script's guessed duration and
// blocks end up sized for a line that takes twice as long to say. Measured audio
// still wins when it exists (the sheet-based path still produces it).
// 11, no 14. El guion pide pausas dramáticas ("…", "—") y una voz que se quiebra:
// eso se lee más lento de lo que una cuenta de caracteres sugiere. Con 14 el
// planificador creía que un bloque duraba 7s, la voz real daba 11, y el clip —que
// se pidió para 7— dejaba cuatro segundos de cuadro congelado. Estimar de menos
// no ahorra nada: se paga con un video que se detiene.
export const CHARS_PER_SECOND = Math.max(6, Number(process.env.CHARS_PER_SECOND ?? 11) || 11);

const sceneSeconds = (s: BlockScene) => {
  if (s.audio_seconds && s.audio_seconds > 0) return s.audio_seconds;
  const chars = (s.narration_text ?? "").trim().length;
  if (chars > 0) return Math.max(1.5, chars / CHARS_PER_SECOND);
  return Math.max(1, s.duration_seconds ?? 4);
};

// Group consecutive scenes until they fill `targetSeconds`.
//
// Capped at 4 scenes per block for a hard reason, not a taste one: the sheet has
// exactly four panels, so a fifth scene in a block would have no beat to show and
// the model would be animating a moment it was never given.
export function planNarrativeBlocks(
  scenes: BlockScene[],
  targetSeconds: number,
  maxScenesPerBlock = 4,
): NarrativeBlock[] {
  // Se agrupan TODAS las escenas, tengan imagen o no.
  //
  // Antes se filtraba por `image_url`, y eso rompia la promesa que el resto del
  // sistema da por cierta: que submit, collect y montaje pueden recalcular la
  // MISMA agrupacion sin pasarse estado. No pueden, porque cada uno corre en un
  // momento distinto con un conjunto de imagenes distinto. Medido en produccion:
  // submit dijo "14 escenas → 4 bloques" y el montaje "14 escenas → 10
  // segmentos" — seis escenas quedaron como fotos fijas mudas intercaladas entre
  // los clips, que es exactamente el entrecortado que se ve al mirarlo.
  //
  // Con ANCHOR_IMAGES_ONLY ademas era circular: solo se renderizan las imagenes
  // de los lideres de bloque, y los lideres los decide este mismo planificador.
  //
  // La imagen ahora solo elige la REFERENCIA del bloque, no quien entra en el.
  const blocks: NarrativeBlock[] = [];
  let current: BlockScene[] = [];
  let acc = 0;

  const flush = () => {
    if (!current.length) return;
    const lead = current[0]!;
    // La referencia es la del lider; si al lider le falta (una generacion que
    // fallo), sirve la de cualquier miembro antes que perder el bloque entero.
    const conImagen = current.find((s) => s.image_url);
    blocks.push({
      leadScene: lead.scene_number,
      scenes: current.map((s) => s.scene_number),
      seconds: acc,
      beats: current.map((s) => (s.image_prompt ?? s.narration_text ?? "").slice(0, 220)),
      referenceImageUrl: lead.image_url ?? conImagen?.image_url ?? "",
      // Con un solo margen de gracia: pedir 7.2s a un clip de 7 no congela nada.
      overflow: acc > targetSeconds + 0.5,
    });
    current = [];
    acc = 0;
  };

  for (const s of scenes) {
    const dur = sceneSeconds(s);
    // Un bloque SÍ puede contener una conversación: es justamente lo que hace que
    // se vea gente hablándose en vez de monólogos encadenados, y partirlo por cada
    // cambio de voz multiplicaba los clips y el costo.
    //
    // Lo que fallaba no era agruparlos, era la ATRIBUCIÓN: al modelo de video se le
    // pasaban los parlamentos con los nombres del guion, y un nombre no le dice
    // nada — no sabe cuál de las dos personas en cuadro es "Valeria". Así que ponía
    // todas las líneas en la boca de quien estuviera enfocado. Eso se arregla en
    // buildDialogueDirection, describiendo a cada hablante por cómo SE VE.
    // Close the block BEFORE overflowing, unless it would leave it empty.
    if (current.length && (acc + dur > targetSeconds || current.length >= maxScenesPerBlock)) flush();
    current.push(s);
    acc += dur;
  }
  flush();

  // A trailing block holding a single short scene is worse than a slightly long
  // one: it costs a full clip for a couple of seconds of screen time. Fold it back.
  if (blocks.length > 1) {
    const last = blocks[blocks.length - 1]!;
    const prev = blocks[blocks.length - 2]!;
    if (last.scenes.length === 1 && last.seconds < 3 && prev.scenes.length < maxScenesPerBlock) {
      prev.scenes.push(...last.scenes);
      prev.beats.push(...last.beats);
      prev.seconds += last.seconds;
      blocks.pop();
    }
  }

  return blocks;
}

// The panel descriptions for a block's sheet. One panel per beat, padded with
// distinct framings so the sheet always describes four different pictures — a
// repeated description makes the model add rows and the slicer rejects the sheet.
export function blockPanelFramings(block: NarrativeBlock): string[] {
  const PAD = [
    ", wide establishing shot of the location, the character small in the frame",
    ", extreme close-up detail insert — the eyes, or the hands, or the key object",
    ", over-the-shoulder shot from behind the character",
    ", low-angle medium shot of the character",
  ];
  const out = block.beats.map((b) => `, ${b}`);
  for (const p of PAD) {
    if (out.length >= 4) break;
    out.push(p);
  }
  return out.slice(0, 4);
}
