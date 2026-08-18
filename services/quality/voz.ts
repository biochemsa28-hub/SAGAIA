// ── ¿La voz dijo el guion? ─────────────────────────────────────────────────
// Fracción de las palabras del guion (3+ letras, sin acentos ni puntuación) que
// aparecen en la transcripción del clip. No exige orden ni exactitud: Whisper
// y el modelo de voz cambian tildes y muletillas, y eso no es error. Lo que sí
// es error es "no me toques" convertido en "mi tokeks": ahí las palabras
// desaparecen y el número cae.
export const VOZ_MINIMA = Math.min(0.9, Math.max(0.2, Number(process.env.VOZ_MINIMA ?? 0.65) || 0.65));
const normalizarVoz = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3);
// LA PEOR LÍNEA MANDA, NO EL PROMEDIO. Medido en un video terminado: "Supe
// ese sísimico. Tenía cuestigüe años" dentro de un bloque de cinco líneas
// bien dichas — el promedio del bloque daba ≥0.8, el conciliador de
// subtítulos lo dio por bueno (y escribió el error en pantalla) y el juez
// tampoco habría disparado. Una frase ininteligible es un clip malo aunque
// las otras cuatro estén perfectas. Se evalúa cada línea por separado y el
// puntaje del bloque es el MÍNIMO entre las líneas con sustancia (2+
// palabras de contenido).
export function similitudPorLinea(lineas: string[], transcripcion: string): number {
  const t = new Set(normalizarVoz(transcripcion));
  let peor = 1;
  for (const l of lineas) {
    const g = normalizarVoz(l);
    // Una línea de UNA palabra larga ("Mírame", "Bloquéalo") también se juzga:
    // medido, "Mílame" pasó porque el mínimo eran dos palabras.
    if (g.length < 2 && !(g.length === 1 && g[0]!.length >= 5)) continue;
    let hit = 0; for (const w of g) if (t.has(w)) hit++;
    peor = Math.min(peor, hit / g.length);
  }
  return peor;
}
export function similitudVoz(guion: string, transcripcion: string): number {
  const g = normalizarVoz(guion);
  if (!g.length) return 1;
  const t = new Set(normalizarVoz(transcripcion));
  let hit = 0;
  for (const w of g) if (t.has(w)) hit++;
  return hit / g.length;
}
