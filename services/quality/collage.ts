// ─── ¿La imagen es un collage? ──────────────────────────────────────────────
// nano-banana/edit, cuando recibe varias imágenes de referencia, a veces
// devuelve una GRILLA (dos o tres paneles) en vez de una escena. Medido en un
// video terminado: arriba la pareja de perfil, abajo la espalda de ella y el
// sofá con la taza — tres paneles en un cuadro de 9:16, y el clip animó eso.
//
// Un collage tiene una costura: una fila (o columna) donde el contenido cambia
// de golpe a lo largo de TODO el ancho. Se busca la fila con mayor diferencia
// media respecto de la siguiente, lejos de los bordes; si esa diferencia es
// muchas veces la mediana de las demás filas y es "recta" (la mayoría de los
// píxeles de la fila cambian), es una costura. Costo: una llamada a ffmpeg y
// unos milisegundos de JS sobre 160 px de ancho.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

export async function esCollage(url: string): Promise<{ collage: boolean; motivo?: string }> {
  const W = 160, H = 284; // 9:16 reducido
  try {
    const { stdout } = await run(
      process.env.FFMPEG_PATH ?? "ffmpeg",
      ["-loglevel", "error", "-i", url, "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-pix_fmt", "gray", "-f", "rawvideo", "-"],
      { encoding: "buffer", maxBuffer: 1 << 24 },
    );
    const px = stdout as unknown as Buffer;
    if (px.length < W * H) return { collage: false };
    const at = (x: number, y: number) => px[y * W + x]!;
    // Costura horizontal: diferencia media entre la fila y y la y+1, y fracción
    // de columnas donde esa diferencia supera 24 niveles.
    const filas: Array<{ y: number; media: number; recta: number }> = [];
    for (let y = Math.round(H * 0.15); y < Math.round(H * 0.85); y++) {
      let s = 0, n = 0;
      for (let x = 0; x < W; x++) { const d = Math.abs(at(x, y + 1) - at(x, y)); s += d; if (d > 24) n++; }
      filas.push({ y, media: s / W, recta: n / W });
    }
    const cols: Array<{ x: number; media: number; recta: number }> = [];
    for (let x = Math.round(W * 0.15); x < Math.round(W * 0.85); x++) {
      let s = 0, n = 0;
      for (let y = 0; y < H; y++) { const d = Math.abs(at(x + 1, y) - at(x, y)); s += d; if (d > 24) n++; }
      cols.push({ x, media: s / H, recta: n / H });
    }
    const mediana = (a: number[]) => { const b = [...a].sort((p, q) => p - q); return b[Math.floor(b.length / 2)] ?? 0; };
    const mf = mediana(filas.map((f) => f.media)), mc = mediana(cols.map((c) => c.media));
    const peorF = filas.reduce((a, b) => (b.media > a.media ? b : a));
    const peorC = cols.reduce((a, b) => (b.media > a.media ? b : a));
    // Umbrales: la costura es ≥6× la mediana, ≥14 niveles de media, y recta en
    // ≥70% de su largo. Un horizonte o el borde de una mesa no llegan a los
    // tres a la vez (medido sobre cuadros normales: recta < 0.35).
    if (peorF.media >= Math.max(14, mf * 6) && peorF.recta >= 0.7) return { collage: true, motivo: `costura horizontal en y=${Math.round((peorF.y / H) * 100)}% (recta ${Math.round(peorF.recta * 100)}%)` };
    if (peorC.media >= Math.max(14, mc * 6) && peorC.recta >= 0.7) return { collage: true, motivo: `costura vertical en x=${Math.round((peorC.x / W) * 100)}% (recta ${Math.round(peorC.recta * 100)}%)` };
    return { collage: false };
  } catch {
    return { collage: false }; // sin ffmpeg o sin red: no se bloquea nada
  }
}
