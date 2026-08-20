// ── MOTOR DE PREMISAS VIRALES ────────────────────────────────────────────────
// Puntúa una premisa ANTES de escribir el guion — donde cambiar de idea cuesta
// un centavo, no una producción. El Director revisa el guion ya escrito; esto
// revisa la SEMILLA.
//
// 8 ejes (0-10): gancho, brecha de curiosidad, conflicto, apuesta (qué está en
// riesgo), emoción dominante, vuelco, identificación ("podría pasarme a mí") y
// debate (¿genera opinión dividida?). Devuelve además DOS reescrituras con la
// fórmula maestra: PERSONA + DESEO + ANOMALÍA + CONSECUENCIA + SECRETO + REVERSAL.
//
// FASE 1: aconseja, nunca bloquea — sin retención real medida, un umbral sería
// precisión falsa (y bloquear a quien quiere pagar es perder ventas por una
// opinión). El puntaje se guarda con el proyecto para correlacionar después.
export interface EjePremisa { eje: string; puntaje: number; nota: string }
export interface EvaluacionPremisa {
  total: number;                 // promedio 0-10, una décima
  ejes: EjePremisa[];
  veredicto: string;             // una frase honesta
  mejoras: string[];             // 2 reescrituras listas para usar
}

const EJES = ["gancho", "curiosidad", "conflicto", "apuesta", "emocion", "vuelco", "identificacion", "debate"] as const;

export async function evaluarPremisa(params: {
  topic: string;
  format?: string;
  niche?: string;
  tone?: string;
}): Promise<EvaluacionPremisa | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !params.topic.trim()) return null;

  const esEscena = params.format === "escena";
  const pedido =
    "Sos un productor de contenido viral vertical (TikTok/Reels, videos de 30-60s). Evaluá esta PREMISA — no el guion — con ojo frío de productor que decide dónde poner dinero.\n\n" +
    `PREMISA: "${params.topic.trim().slice(0, 400)}"\n` +
    `FORMATO: ${params.format ?? "story"} · UNIVERSO: ${params.niche ?? "-"} · TONO: ${params.tone ?? "-"}\n\n` +
    "Puntuá 0-10 cada eje, con una nota de UNA frase concreta (qué tiene o qué le falta):\n" +
    "1. gancho: ¿la premisa misma detiene el scroll en 3 segundos, sin contexto?\n" +
    "2. curiosidad: ¿abre una pregunta que NECESITA respuesta? (brecha entre lo que se sabe y lo que falta)\n" +
    "3. conflicto: ¿hay fuerzas opuestas claras (expectativa vs realidad, poder vs débil)?\n" +
    "4. apuesta: ¿qué está en riesgo y cuánto pesa (dinero, amor, reputación, supervivencia)?\n" +
    "5. emocion: ¿provoca UNA emoción dominante clara (sorpresa, indignación, ternura, miedo, humor)?\n" +
    "6. vuelco: ¿contiene un cambio de percepción (primero crees X, descubres Y)?\n" +
    (esEscena
      ? "7. identificacion: ¿el espectador quiere SER o VER eso (satisfacción visual, destreza, morbo)?\n8. debate: ¿provoca compartir o comentar ('¿viste eso?')?\n"
      : "7. identificacion: ¿el espectador piensa 'esto podría pasarme' o 'conozco a alguien así'?\n8. debate: ¿hay ambigüedad moral que divida opiniones en los comentarios?\n") +
    "\nDespués escribí DOS reescrituras de ESTA premisa (no otra historia) que suban los ejes flojos, usando la fórmula PERSONA + DESEO + ANOMALÍA + CONSECUENCIA + SECRETO + REVERSAL. " +
    "Cada una en 1-2 frases, en español neutro, lista para pegar. La primera fiel a la premisa original; la segunda más agresiva para redes. " +
    (esEscena ? "El formato es ESCENA (performance sin diálogo): las reescrituras describen lo que SE VE, no una trama hablada. " : "") +
    "En 60 segundos cabe UN vuelco: no metas dos giros.\n" +
    'Respondé SOLO este JSON: {"ejes": [{"eje": "gancho", "puntaje": N, "nota": "..."}, ...los 8...], "veredicto": "una frase honesta de productor", "mejoras": ["...", "..."]}';

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 1200,
        system: "Respondé SOLO con JSON válido, sin markdown.",
        messages: [{ role: "user", content: pedido }],
      }),
    });
    if (!res.ok) { console.warn("[premisa] no se pudo evaluar:", res.status); return null; }
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "{}";
    const m = /\{[\s\S]*\}/.exec(raw);
    const v = JSON.parse(m ? m[0] : "{}") as Partial<EvaluacionPremisa>;
    const ejes = (Array.isArray(v.ejes) ? v.ejes : [])
      .filter((e): e is EjePremisa => Boolean(e) && typeof (e as EjePremisa).eje === "string")
      .map((e) => ({ eje: String(e.eje).toLowerCase(), puntaje: Math.max(0, Math.min(10, Number(e.puntaje) || 0)), nota: String(e.nota ?? "").slice(0, 160) }))
      .filter((e) => (EJES as readonly string[]).includes(e.eje))
      .slice(0, 8);
    if (ejes.length < 6) { console.warn("[premisa] respuesta incompleta — se ignora"); return null; }
    const total = Math.round((ejes.reduce((a, e) => a + e.puntaje, 0) / ejes.length) * 10) / 10;
    const mejoras = (Array.isArray(v.mejoras) ? v.mejoras : []).map((x) => String(x).slice(0, 420)).filter(Boolean).slice(0, 2);
    const out: EvaluacionPremisa = { total, ejes, veredicto: String(v.veredicto ?? "").slice(0, 200), mejoras };
    console.log(`[premisa] ${total}/10 · ${out.veredicto}`);
    return out;
  } catch (e) {
    console.warn("[premisa] error:", e instanceof Error ? e.message.slice(0, 120) : e);
    return null;
  }
}
