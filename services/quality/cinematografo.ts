// ── EL CINEMATÓGRAFO ─────────────────────────────────────────────────────────
// Piensa la premisa COMO SE VE antes de que el guionista la escriba. El usuario
// escribe "mujer que come insectos creyendo que son caramelos" y este paso la
// expande al nivel de un director de fotografía: qué se ve plano a plano, con
// qué lente, qué objetos CONCRETOS (especies, marcas, texturas — lo genérico
// no se dibuja), qué suena pegado al micrófono, y dónde vive la ironía.
//
// Medido a mano primero: la misma premisa cruda daba un guion plano; expandida
// ("grillos, gusanos y escarabajos vivos", "push-in al plato", "wet crunching
// close to the mic", "la etiqueta CARAMELOS visible desde el plano 1") daba
// exactamente la visión del usuario. Este servicio hace esa expansión siempre.
//
// Corre solo en formato ESCENA (donde la imagen ES el guion). Una llamada
// (~$0.02, ~15s); su salida entra como instrucciones adicionales al guionista.
// Apagable con CINEMATOGRAFO_GATE=off.
const GATE = (process.env.CINEMATOGRAFO_GATE ?? "on").toLowerCase();

export async function tratamientoVisual(params: {
  topic: string;
  niche?: string;
  tone?: string;
  durationTarget?: string;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (GATE === "off" || !apiKey || !params.topic.trim()) return null;

  const pedido =
    "Sos un DIRECTOR DE FOTOGRAFÍA de contenido vertical. Un usuario escribió esta premisa cruda para un video de " +
    `${params.durationTarget ?? "30s"} SIN DIÁLOGO (formato performance/escena, tono ${params.tone ?? "-"}):\n` +
    `«${params.topic.trim().slice(0, 400)}»\n\n` +
    "Expandila a un TRATAMIENTO VISUAL de 6-9 líneas que el guionista va a obedecer. Reglas del oficio:\n" +
    "1. CONCRETÁ LO GENÉRICO: nada de 'bichos', 'cosas', 'un lugar' — especies con nombre, objetos con material y estado, el detalle que se puede dibujar. Lo genérico sale como mancha.\n" +
    "2. LA CÁMARA NARRA: decí explícitamente los 2-3 movimientos clave (el push-in al detalle revelador, el plano que se queda quieto, el macro). ¿Dónde está la cámara cuando el espectador entiende?\n" +
    "3. EL SONIDO ÍNTIMO: qué se oye TODO el tiempo y qué suena PEGADO al micrófono en el momento clave (la textura sonora que produce la emoción física: el crujido, el roce, el goteo).\n" +
    "4. LA IRONÍA/EL CONTRASTE: si el espectador sabe algo que el personaje no, decí en qué plano exacto se le muestra al espectador y cómo el personaje sigue sin saberlo. Y decilo EXPLÍCITO: la cara del personaje lleva la emoción de SU realidad (deleite, calma) en TODOS los planos — el horror es del espectador y vive en luz/encuadre/sonido, nunca en su expresión.\n" +
    "5. LA PISTA VISIBLE: un objeto en cuadro desde el principio (etiqueta, foto, marca) que cobra sentido con el giro.\n" +
    "6. LA PROGRESIÓN: de lo normal a lo imposible en pasos — qué se ve en el primer tercio, qué en el medio, qué en el clímax visual, y el último plano que abre la parte 2.\n" +
    "Escribí el tratamiento en español, directo, sin numerar con títulos — como notas de un DF a su equipo. NADA de diálogo. Máximo 180 palabras.";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: pedido }],
      }),
    });
    if (!res.ok) { console.warn("[cinematógrafo] no se pudo:", res.status); return null; }
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const texto = (json.content?.find((c) => c.type === "text")?.text ?? "").trim();
    if (texto.length < 60) return null;
    console.log(`[cinematógrafo] tratamiento de ${texto.length} caracteres para la escena`);
    return texto.slice(0, 1400);
  } catch (e) {
    console.warn("[cinematógrafo] error:", e instanceof Error ? e.message.slice(0, 120) : e);
    return null;
  }
}
