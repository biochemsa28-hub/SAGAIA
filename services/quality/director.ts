// El DIRECTOR: lee el guion entero como pieza antes de gastar un dólar.
//
// Las guardias de la ruta de guion atrapan defectos de FORMA con regex (línea
// larga, nombre cruzado, sin acto 4, muchos lugares). Lo que no atrapan es lo
// que el usuario ve cuando mira el video terminado: "corre muy rápido", "el
// beso no se sostiene", "dieciséis segundos del mismo gesto", "la revelación
// llega tarde", "la que escucha está en primer plano con la boca abierta".
// Eso lo ve un LECTOR, no una expresión regular.
//
// Una llamada (~$0.05, ~40s) con el guion completo + la premisa + una lista de
// chequeo de dirección. Devuelve notas CONCRETAS por escena, que entran como
// corrección en la misma regeneración que las guardias — nunca una segunda
// regeneración aparte: el guion ya cuesta dos minutos por pasada.
//
// Apagable con DIRECTOR_GATE=off. Se mide en logs como [director].
export interface NotaDirector { escena: number; nota: string }
export interface VeredictoDirector {
  aprobado: boolean;
  puntaje: number;           // 1-10, ritmo + dramaturgia + promesa visual
  notas: NotaDirector[];
  resumen: string;
}

type EscenaDirector = {
  scene_number?: number;
  speaker?: string | null;
  narration_text?: string | null;
  physical_action?: string | null;
  image_prompt?: string | null;
  location?: string | null;
  environment?: string | null;
  is_peak?: boolean;
  emotion?: string | null;
};

const DIRECTOR = (process.env.DIRECTOR_GATE ?? "on").toLowerCase();

export async function revisarComoDirector(params: {
  topic: string;
  format?: string;
  niche?: string;
  tone?: string;
  durationTarget?: string;
  cast?: string[];
  scenes: EscenaDirector[];
  mecanicas?: string[];
  curvaEmocional?: string;
}): Promise<VeredictoDirector | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (DIRECTOR === "off" || !apiKey || params.scenes.length < 3) return null;

  const guion = params.scenes.map((s) =>
    `#${s.scene_number ?? "?"}${s.is_peak ? " [PICO]" : ""} [${s.speaker ?? "?"}] @${s.location ?? "?"}` +
    `\n  dice: «${(s.narration_text ?? "").trim()}»` +
    `\n  cuerpo: ${(s.physical_action ?? "").trim() || "-"}` +
    `\n  cuadro: ${(s.image_prompt ?? "").trim().slice(0, 260)}`,
  ).join("\n");

  const esConsejo = (params.format ?? "") === "consejo";

  // ── EL NIVEL ──────────────────────────────────────────────────────────────
  // La vara NO es el gusto del dueño: es lo que comparten los videos con
  // DISTRIBUCIÓN POSITIVA MEDIDA en Facebook a 48h (≥6s de tiempo promedio,
  // ≥+0.3x de alcance): "ella cree que son dulces" (7s, +0.4x), "3 secretos
  // para tu marido" (7s, +0.3x), "el veneno en su copa" (6s, +0.3x). Los
  // videos que solo eran bellos (el muñeco: mejor gancho de todos, 4s y
  // −0.2x) salieron de la vara — el Director estaba defendiendo un estándar
  // perdedor. Se re-basa con datos nuevos del Genoma, no con aprobaciones.
  const EL_NIVEL =
    "\nEL NIVEL (la vara — viene de los videos MEDIDOS con distribución positiva, no del gusto; tus notas deben empujar el guion HACIA esto):\n" +
    "Los videos que el público de esta casa sostiene 6+ segundos comparten un ADN: (1) UNA imagen de apertura que ya ES la historia y pasa DENTRO de una casa reconocible — el veneno sirviéndose en la copa, los dulces espolvoreándose; nunca preámbulo. " +
    "(2) Un ACTO DE CUIDADO COTIDIANO QUE ES AMENAZA (o una promesa útil y concreta): la que cocina para el que quiere, la que aconseja — lo doméstico torcido es lo que este público se queda a ver. " +
    "(3) SOSTÉN: cada 4-6 segundos entra UN dato nuevo que reabre la pregunta — el espectador que llegó al segundo 5 tiene que tener un motivo NUEVO para llegar al 10, y el del 10 para llegar al 20. Un guion cuyo único imán es el gancho muere a los 4 segundos aunque el gancho sea perfecto (medido: el mejor gancho de la casa tuvo la peor distribución). " +
    "(4) Un OBJETO-TERMÓMETRO de cocina o de casa que escala solo y sin comentario — la copa, la bandeja, el frasco: el estado de la historia se LEE en el objeto. " +
    "(5) La emoción VERDADERA de cada personaje en su cara — la que goza goza, el que no sabe no sabe; el género vive en luz y sonido. " +
    "(6) Un cierre que resuelve la pregunta central PERO deja un dato lateral colgando, más la pregunta que obliga a elegir bando. " +
    "(7) Economía total: ni una línea que explique lo que la imagen ya dijo, ni un plano que repita el anterior. " +
    "Si este guion no está a esa vara, tu nota más importante es la que más lo acerque — aunque técnicamente no haya ningún error. Y juzgá el SOSTÉN antes de leer la premisa: leé las escenas en orden y anotá en qué segundo te habrías ido.\n";
  const pedido =
    "Sos el DIRECTOR de un microdrama vertical (TikTok/Reels) de " + (params.durationTarget ?? "60s") + ". " +
    "Leé el guion ENTERO como pieza y juzgalo como lo juzgaría el espectador al verlo terminado. " +
    "No corrijas ortografía ni estilo: juzgá RITMO, DRAMATURGIA y si la PROMESA de la premisa se cumple en pantalla.\n\n" +
    `PREMISA: ${params.topic}\nFORMATO: ${params.format ?? "story"} · NICHO: ${params.niche ?? "-"} · TONO: ${params.tone ?? "-"}` +
    (params.cast?.length ? `\nELENCO: ${params.cast.join(", ")}` : "") +
    "\n\nGUION:\n" + guion + "\n\n" +
    EL_NIVEL +
    "LISTA DE CHEQUEO (marcá solo lo que falla, con la escena y la corrección concreta):\n" +
    "1. PROMESA VISUAL: lo que la premisa promete ver (el beso, el engaño, la transformación, el objeto) ¿se VE en cuadro y se sostiene los segundos que necesita, o solo se menciona? Si la premisa promete un ACTO físico (comer, besar, bailar, transformarse): ¿al menos DOS escenas lo congelan A LA MITAD del gesto (la mordida, la masticación, el giro) y escala — o el guion solo sostiene el objeto, lo acerca y lo CUENTA? Sostener, acercar y contar NO es ver: eso es promesa incumplida y es tu nota más importante. Si la premisa es de descubrir/ver algo: ¿la escena 1 es la ilusión (el hecho, hablado por quien lo comete) y la revelación llega en la escena 2?\n" +
    "2. RITMO: ¿corre demasiado rápido (todo pasa en las primeras 3 escenas, no hay aire antes del golpe) o se arrastra (3+ escenas sin que cambie nada)? ¿Hay una escena de respiro antes del pico?\n" +
    "3. CURVA: ¿cada acto escala? ¿El pico está en el último cuarto y es el momento físico más grande? ¿Hay cierre después del pico?\n" +
    "4. CUERPOS: ¿el mismo gesto dura más de 2 escenas seguidas? ¿La acción física es coherente con la situación (al que acaban de pillar no le toca acariciar a la esposa)?\n" +
    "5. CUADRO Y VOZ: en cada escena, ¿quien habla es el sujeto del cuadro y los demás escuchan (boca cerrada)? ¿Alguna escena pone en primer plano al que NO habla?\n" +
    "6. LUGAR: ¿cambia de lugar sin necesidad?\n" +
    "6b. LA PRUEBA DEL CIEGO: leé SOLO las líneas habladas, en orden, sin mirar los cuadros. ¿Un oyente sin pantalla puede contar quién hizo qué a quién? Si las líneas viven de 'eso/esto/lo' sin nombrar la cosa (la carta, el beso, el nombre), o si son puras reacciones sin datos, el guion está hueco — pedí que cada línea nombre su objeto y aporte un dato nuevo. Esta nota pesa más que cualquier otra de estilo.\n" +
    "6c. MANOS: ¿en cada escena el que habla HACE algo con un objeto, o los personajes están parados posando (brazos cruzados, mirando)? Tres o más escenas de gente de pie sin manipular nada = catálogo de modelos, no drama. Pedí la acción de manos concreta por escena.\n" +
    (params.curvaEmocional ? `7c. CURVA DECLARADA: el guion promete "${params.curvaEmocional}". ¿Las escenas la CUMPLEN acto por acto? ¿Hay tensión-liberación-tensión o es una meseta?\n` : "") +
    (params.mecanicas?.length ? `7b. MECÁNICAS DECLARADAS: el guion dice ejecutar [${params.mecanicas.join(", ")}]. ¿De verdad están EJECUTADAS en las escenas (no solo insinuadas)? Si una no está, decí en qué escena debería vivir y cómo.\n` : "") +
    "7. BUCLE DE CURIOSIDAD: ¿la última línea obliga a jugar (decisión/predicción/detección/juicio nacida de esta historia) o es un '¿qué opinas?' genérico? ¿El último plano muestra un objeto/hecho NUEVO que abre la parte 2, o el cierre es solo 'sígueme'? Si hay pista sembrada temprana, ¿el vuelco la usa?\n" +
    (esConsejo ? "8. CONSEJO: ¿los consejos son reales, concretos y vividos (no dictados)? ¿Se entregan todos, sin carnada?\n" : "") +
    "Criterio: ante la duda, APROBÁ — una nota de más obliga a regenerar un guion que estaba bien. Máximo 5 notas, las más importantes, cada una ejecutable por el guionista en una reescritura.\n" +
    'Respondé SOLO este JSON: {"aprobado": true|false, "puntaje": 1-10, "resumen": "una frase", "notas": [{"escena": N, "nota": "qué cambiar, concreto"}]}';

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 900,
        system: "Respondé SOLO con JSON válido, sin markdown.",
        messages: [{ role: "user", content: pedido }],
      }),
    });
    if (!res.ok) { console.warn("[director] no se pudo revisar:", res.status); return null; }
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "{}";
    const m = /\{[\s\S]*\}/.exec(raw);
    const v = JSON.parse(m ? m[0] : "{}") as Partial<VeredictoDirector>;
    const notas = (Array.isArray(v.notas) ? v.notas : [])
      .filter((n): n is NotaDirector => Boolean(n) && typeof (n as NotaDirector).nota === "string")
      .map((n) => ({ escena: Number(n.escena) || 0, nota: String(n.nota).slice(0, 300) }))
      .slice(0, 5);
    const out: VeredictoDirector = {
      aprobado: v.aprobado !== false && notas.length === 0 ? true : v.aprobado === true,
      puntaje: Math.max(1, Math.min(10, Number(v.puntaje) || 0)),
      notas,
      resumen: String(v.resumen ?? "").slice(0, 240),
    };
    console.log(
      `[director] ${out.aprobado ? "APROBADO" : "CON NOTAS"} · ${out.puntaje}/10 · ${out.resumen}` +
      (notas.length ? "\n" + notas.map((n) => `  · esc ${n.escena}: ${n.nota}`).join("\n") : ""),
    );
    return out;
  } catch (e) {
    console.warn("[director] error:", e instanceof Error ? e.message.slice(0, 120) : e);
    return null;
  }
}

// Texto que entra al guionista como corrección.
export function notasComoCorreccion(v: VeredictoDirector | null): string {
  if (!v || v.aprobado || !v.notas.length) return "";
  return "\n[NOTAS DEL DIRECTOR — aplicalas todas en la reescritura] " +
    v.notas.map((n) => `Escena ${n.escena || "(general)"}: ${n.nota}`).join(" · ");
}
