// ── ¿La voz dijo el guion? ─────────────────────────────────────────────────
// Fracción de las palabras del guion (3+ letras, sin acentos ni puntuación) que
// aparecen en la transcripción del clip. No exige orden ni exactitud: Whisper
// y el modelo de voz cambian tildes y muletillas, y eso no es error. Lo que sí
// es error es "no me toques" convertido en "mi tokeks": ahí las palabras
// desaparecen y el número cae.
export const VOZ_MINIMA = Math.min(0.9, Math.max(0.2, Number(process.env.VOZ_MINIMA ?? 0.65) || 0.65));
const normalizarVoz = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3);
export function similitudVoz(guion: string, transcripcion: string): number {
  const g = normalizarVoz(guion);
  if (!g.length) return 1;
  const t = new Set(normalizarVoz(transcripcion));
  let hit = 0;
  for (const w of g) if (t.has(w)) hit++;
  return hit / g.length;
}
