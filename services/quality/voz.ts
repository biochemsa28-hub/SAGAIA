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
// nombres: los del elenco. UN NOMBRE MAL DICHO NO PASA POR PROMEDIO. Medido:
// "Marlene, hace un año que no sé cómo decirte" salió "Marlenin…" — 7 de 8
// palabras coincidían (0.875) y el clip pasó. El espectador oye el nombre de
// la protagonista mal pronunciado en la línea del pico. Si la línea nombra a
// alguien del elenco y la transcripción no trae ese nombre (ni con una letra
// de diferencia —Whisper cambia tildes—), la línea vale 0.5: falla y se repite.
export function similitudPorLinea(lineas: string[], transcripcion: string, nombres: string[] = []): number {
  const tl = normalizarVoz(transcripcion);
  const t = new Set(tl);
  const nombresNorm = nombres.map((n) => normalizarVoz(n)[0] ?? "").filter((n) => n.length >= 3);
  const casi = (a: string, b: string) => {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    // una sola letra de diferencia (sustitución, inserción o borrado)
    let i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      d++; if (d > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return d + (a.length - i) + (b.length - j) <= 1;
  };
  let peor = 1;
  for (const l of lineas) {
    const g = normalizarVoz(l);
    // Una línea de UNA palabra larga ("Mírame", "Bloquéalo") también se juzga:
    // medido, "Mílame" pasó porque el mínimo eran dos palabras.
    if (g.length < 2 && !(g.length === 1 && g[0]!.length >= 5)) continue;
    let hit = 0; for (const w of g) if (t.has(w)) hit++;
    let puntaje = hit / g.length;
    for (const n of nombresNorm) {
      if (!g.includes(n)) continue;
      if (!tl.some((w) => casi(w, n))) puntaje = Math.min(puntaje, 0.5);
    }
    peor = Math.min(peor, puntaje);
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
