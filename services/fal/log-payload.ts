// ─── Registro del payload EXACTO que sale hacia fal ─────────────────────────
// Para comparar con el dashboard de fal línea por línea: modelo, prompt entero,
// referencias y parámetros. Se activa con FAL_LOG_PAYLOADS=on (por defecto
// apagado: los prompts son largos y ensucian el log). Cada entrada lleva una
// etiqueta con la etapa (retrato / hoja / escena / pico / clip / referencias)
// para saber qué llamada es cuál.
export function logPayload(etapa: string, modelo: string, input: Record<string, unknown>): void {
  if ((process.env.FAL_LOG_PAYLOADS ?? "off").toLowerCase() !== "on") return;
  const copia: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v.length > 4000) copia[k] = v.slice(0, 4000) + `… (+${v.length - 4000} car.)`;
    else copia[k] = v;
  }
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  console.log(`[fal→ ${etapa}] modelo=${modelo} prompt=${prompt.length} car. refs=${Array.isArray(input.image_urls) ? input.image_urls.length : input.image_url ? 1 : 0}\n${JSON.stringify(copia)}`);
}
