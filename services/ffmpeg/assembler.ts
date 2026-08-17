// ─── Local FFmpeg assembler ──────────────────────────────────────────────────
// Renders the final vertical video on YOUR machine/server with FFmpeg instead of
// Shotstack. Cost per render: $0. No external dependency, no ephemeral URLs — the
// output goes straight to R2 (permanent). Enable with RENDER_ENGINE=ffmpeg.
//
// v1 covers the kenburns tier: per-scene image + voice → Ken Burns clip, concatenated,
// with background music ducked under the narration. (Subtitles: roadmap v2.)

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { uploadBuffer } from "@/services/storage";
import { auditarVideo , type AuditoriaVideo } from "@/services/quality/auditor";

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

// x264 NO ve el limite de memoria del contenedor: ve los nucleos del HOST y
// reserva bufers de fotogramas para cada hilo. En un nodo de muchos nucleos con
// un contenedor chico eso son cientos de MB antes de codificar el primer
// fotograma, y el contenedor mata el proceso: SIGKILL, sin una sola linea de
// error de ffmpeg, "frame= 0" en todas las escenas. Acotar los hilos cuesta algo
// de velocidad por escena; no acotarlos costaba el video entero.
const X264_THREADS = ["-threads", String(Math.max(1, Number(process.env.FFMPEG_THREADS ?? 1) || 1))];

// Cola sin dialogo: cuantos segundos mudos al final hacen falta para recortar, y
// cuantos se DEJAN igual (el CTA de "Parte 2" está quemado ahi — cortar al ras
// lo borraria).
// Cuánto cuadro congelado se tolera al final de un clip antes de repetirlo en
// bucle. Medido: 11s de estatua en el medio de un video real. Medio segundo es
// invisible y evita el corte seco; dos segundos ya se notan pero se perdonan.
const FREEZE_MAX = Math.max(0.5, Number(process.env.FREEZE_MAX_SECONDS ?? 2) || 2);

const TAIL_MIN = Math.max(1, Number(process.env.TAIL_SILENCE_MIN ?? 2.5) || 2.5);
const TAIL_KEEP = Math.max(0.5, Number(process.env.TAIL_SILENCE_KEEP ?? 2) || 2);
// Objetivo de sonoridad. TikTok, Reels y YouTube normalizan a -14 LUFS, y en
// la práctica solo BAJAN lo que llega más fuerte: lo que llega más bajo se
// queda bajo. A -16 el video sonaba 2 dB más flojo que todo lo demás del feed
// (medido: dos videos a -20 dB de media, picos a -0.8). -14 es el nivel del
// feed; el techo real de picos (-1.5 dBTP) sigue protegiendo de la distorsión.
const LOUDNORM_LUFS = Number(process.env.LOUDNORM_LUFS ?? -14) || -14;
// Objetivo POR CLIP antes de concatenar (ver el segmento con audio nativo). Un
// poco por debajo del final para dejar sitio a música y efectos en la mezcla.
const CLIP_LUFS = Number(process.env.CLIP_LUFS ?? -16) || -16;
// Living-atmosphere pass over still frames (grain that moves every frame). Off via
// ATMOSPHERE=off if you ever want perfectly clean stills.
// Ken Burns oversamples so the zoom does not pixelate. 2x (4K per scene) needs
// more memory than a small container has, and every segment died with a bare
// "Command failed" — the render worked on a laptop and could not work in
// production. 1.5x keeps the zoom clean at a third of the pixels.
// ── EL LOOK DEL GÉNERO ───────────────────────────────────────────────────────
// Lo que separa un video que parece generado de uno que parece filmado casi
// nunca es el modelo: es el color. Una película de terror es fría y con los
// negros aplastados; una de romance es cálida y con los blancos lavados. Eso no
// se le pide al generador de imágenes —que da una imagen distinta cada vez— se
// aplica DESPUÉS, igual a todo el video, y es lo que lo unifica.
//
// Cuesta $0 y milisegundos de CPU: son filtros de ffmpeg sobre un render que ya
// estábamos haciendo. Es la mejora de percepción más barata disponible.
//
// Se aplica ANTES de los subtítulos a propósito: el texto tiene que quedar
// limpio y a pleno contraste, no teñido ni con viñeta encima.
const LOOK: Record<string, string> = {
  terror:        "eq=contrast=1.14:saturation=0.80:gamma=0.93,colorbalance=rs=-0.05:gs=-0.02:bs=0.10,vignette=PI/4",
  misterio:      "eq=contrast=1.10:saturation=0.88:gamma=0.97,colorbalance=rs=-0.04:bs=0.08,vignette=PI/4.5",
  romance:       "eq=contrast=1.04:saturation=1.10:gamma=1.03,colorbalance=rs=0.06:gs=0.02:bs=-0.04,vignette=PI/6",
  inspiracional: "eq=contrast=1.06:saturation=1.08:gamma=1.05,colorbalance=rs=0.05:gs=0.03:bs=-0.02,vignette=PI/7",
  fantasia:      "eq=contrast=1.08:saturation=1.18:gamma=1.00,colorbalance=rs=0.03:bs=0.07,vignette=PI/5",
  historia:      "eq=contrast=1.06:saturation=0.82:gamma=0.99,colorbalance=rs=0.07:gs=0.03:bs=-0.06,vignette=PI/5",
  default:       "eq=contrast=1.06:saturation=1.00:gamma=1.00,vignette=PI/5",
};
const LOOK_ON = (process.env.LOOK ?? "on").toLowerCase() !== "off";

// ── EFECTOS DE MONTAJE ───────────────────────────────────────────────────────
// Lo que un editor hace en CapCut y el ensamblador no hacía: subrayar el pico
// y hacer que los primeros segundos se sientan EDITADOS, no pegados. Todo son
// recortes animados por tiempo sobre el mismo render — cuestan cero.
//
//   · PUNCH-IN EN EL PICO: la escena marcada is_peak entra a escala normal y en
//     su último tramo (donde vive el "después" del contacto) se acerca de 100 a
//     112 % en 0.4 s. El espectador no sabe por qué lo sintió; lo sintió.
//   · MICRO-ZOOM EN LOS PRIMEROS CORTES: cada plano de los primeros 6 s arranca
//     a 104 % y se asienta en 0.5 s. Es lo que hace que un montaje se lea como
//     hecho por alguien.
//   · SACUDIDA EN GOLPES: si el pico es un golpe/portazo/caída (la emoción o el
//     texto lo delatan), seis cuadros de sacudida en el punch-in.
//
// Se hace con crop animado (w=iw/z) seguido de scale de vuelta a 1080x1920. Un
// solo interruptor: EFECTOS=off.
const EFECTOS_ON = (process.env.EFECTOS ?? "on").toLowerCase() !== "off";
function efectosDeMontaje(
  scene: FfScene,
  deco: { isFirst?: boolean; startsAt?: number; niche?: string } | undefined,
  durSeg: number,
): string {
  if (!EFECTOS_ON || !(durSeg > 1.2)) return "";
  const partes: string[] = [];
  // Expresión de zoom z(t): base 1; en el pico sube al final; en los primeros
  // cortes arranca en 1.04 y baja. Se combinan sumando desvíos.
  const desvios: string[] = [];
  const t0 = Math.max(0.5, durSeg * 0.6);           // arranque del punch-in del pico
  if (scene.isPeak) desvios.push(`0.12*min(1,max(0,(t-${t0.toFixed(2)})/0.4))`);
  const temprano = (deco?.startsAt ?? 99) < 6 && !deco?.isFirst;
  if (temprano) desvios.push(`0.04*max(0,1-t/0.5)`);
  if (!desvios.length) return "";
  const z = `(1+${desvios.join("+")})`;
  // crop no evalúa w/h por cuadro (medido: "Error when evaluating the expression"
  // con t). scale con eval=frame sí acepta t: se AGRANDA el cuadro y se recorta
  // el centro a tamaño fijo. Verificado con un cuadrado blanco: área ×2.25 a
  // zoom 1.5, exacto.
  const zw = `trunc(1080*${z}/2)*2`;
  const zh = `trunc(1920*${z}/2)*2`;
  // Sacudida: solo en picos de golpe. Desplaza el recorte ±6 px durante 0.25 s
  // (x/y de crop sí se evalúan por cuadro).
  const golpe = scene.isPeak && /slap|hit|punch|slam|fall|crash|golpe|cachet|porta|ca[ií]d|estrell/i.test(`${scene.narrationText ?? ""} ${scene.emotion ?? ""}`);
  const sx = golpe ? `+if(between(t,${t0.toFixed(2)},${(t0 + 0.25).toFixed(2)}),6*sin(t*220),0)` : "";
  const sy = golpe ? `+if(between(t,${t0.toFixed(2)},${(t0 + 0.25).toFixed(2)}),4*cos(t*190),0)` : "";
  partes.push(`scale=w='${zw}':h='${zh}':eval=frame`);
  partes.push(`crop=1080:1920:'(iw-1080)/2${sx}':'(ih-1920)/2${sy}'`);
  return "," + partes.join(",");
}
function lookDe(niche?: string): string {
  if (!LOOK_ON) return "";
  const l = LOOK[(niche ?? "").toLowerCase()] ?? LOOK.default;
  return `,${l}`;
}

const OVERSAMPLE = Math.max(1, Math.min(2, Number(process.env.KENBURNS_OVERSAMPLE ?? 1.5) || 1.5));
const OVERSAMPLE_W = Math.round(1080 * OVERSAMPLE / 2) * 2;
const OVERSAMPLE_H = Math.round(1920 * OVERSAMPLE / 2) * 2;

// "Arial Black" does not exist on Linux: libass finds no family, falls back to
// nothing, and the whole filter chain fails. Liberation Sans Narrow Bold is the
// metric-compatible substitute shipped by ttf-liberation, which the Dockerfile
// now installs. Override with SUBTITLE_FONT if a nicer face is available.
const SUBTITLE_FONT = process.env.SUBTITLE_FONT ?? "Liberation Sans Narrow";

const ATMOSPHERE_ON = (process.env.ATMOSPHERE ?? "on").toLowerCase() !== "off";

export interface FfScene {
  imageUrl?: string;
  videoUrl?: string;   // if a real motion clip exists, use it instead of Ken Burns
  audioUrl?: string;
  /** Several narrations laid end to end over ONE clip — a narrative block. */
  audioUrls?: string[];
  durationSeconds?: number;
  wordTimings?: Array<{ word: string; start: number; end: number }>; // for burned CapCut subs
  /** Lo que dice la escena. Respaldo para subtitular cuando no hay wordTimings. */
  narrationText?: string;
  /** Esta escena ocurre en OTRO lugar que la anterior — la transición debe leerse. */
  newLocation?: boolean;
  emotion?: string;    // drives the Ken Burns motion (direction, easing, anchor)
  shots?: string[];    // extra camera setups of this same beat → the edit cuts between them
  /** Esta escena es el pico físico del guion — el montaje la subraya. */
  isPeak?: boolean;
}

// ── CapCut-style burned subtitles via an ASS file ────────────────────────────
// Caption chunking: keep lines SHORT so they never overflow the 1080px frame.
const MAX_CHARS_PER_LINE = 28;   // ahora libass parte solo (WrapStyle 0): entran dos renglones
const MAX_WORDS_PER_CHUNK = 5;

// Palabras con las que un subtitulo NO puede terminar. Medido sobre un video
// real: con el limite anterior de 3 palabras salian "ESA RISA, LA", "LOS QUERIA
// A", "CONOZCO DE TODA" — cortes a mitad de sintagma que obligan a leer dos
// carteles para entender uno. El espectador no relee: se va.
const COLGANTES = new Set(
  ("a ante bajo con contra de del desde durante en entre hacia hasta mediante para por segun sin sobre tras " +
   "el la los las lo un una unos unas al " +
   "mi mis tu tus su sus nuestro nuestra nuestros nuestras " +
   "y e o u ni que qui quien como cuando donde porque si no se me te le les nos os muy mas tan").split(" "),
);
const MAX_CHUNK_SECONDS = 1.6;   // never hold one caption longer than this (keeps sync tight)

// Niche-flavoured highlight color (ASS uses &HBBGGRR — reversed from hex RGB).
const NICHE_COLOR: Record<string, string> = {
  terror: "&H0000E5FF",      // amarillo dorado
  horror: "&H0000E5FF",
  romance: "&H00B4A0FF",     // rosa
  misterio: "&H00FFD966",    // cian claro
  mystery: "&H00FFD966",
  thriller: "&H004DA6FF",    // naranja
  inspiracional: "&H0080FF80", // verde menta
  inspirational: "&H0080FF80",
  drama: "&H0000E5FF",
  publicidad: "&H0000E5FF",
  // Los nichos que se agregaron después caían al amarillo genérico, así que un
  // chisme y un video de terror se veían iguales. El color del subtítulo es la
  // primera señal de tono que recibe el espectador, antes de leer una palabra.
  chisme: "&H00FF8AE0",       // magenta — cómplice, de cotilleo
  confesion: "&H00E0E0E0",    // gris casi blanco — sobrio, sin adorno
  comedia: "&H0000D7FF",      // ámbar vivo
  comedy: "&H0000D7FF",
  documental: "&H00FFFFFF",   // blanco puro — autoridad, tipo informativo
  documentary: "&H00FFFFFF",
  fantasia: "&H00FFC080",     // lavanda
  fantasy: "&H00FFC080",
  historia: "&H0060C0FF",     // sepia dorado
  default: "&H0000E5FF",
};

// ── Ken Burns "director" ─────────────────────────────────────────────────────
// Applies real animation principles so the motion never feels mechanical:
//  • EASING — no linear moves (ease-in creeps, ease-out settles)
//  • VARIED TIMING — each emotion gets its own speed and direction
//  • ANCHOR POINT — pushes hold on the subject (upper third for faces), so the
//    frame doesn't "drift" or jump around
// Returns the zoompan z/x/y expressions for one scene. Cost: $0.
function kenBurnsMotion(emotion: string | undefined, frames: number): { z: string; x: string; y: string } {
  const e = (emotion ?? "").toLowerCase().trim();
  const t = `(on/${Math.max(1, frames)})`;            // normalized 0→1 progress
  const easeOut = `(1-pow(1-${t},3))`;                 // fast start, gentle settle
  const easeIn = `pow(${t},2)`;                        // slow creep, accelerating
  const easeInOut = `(0.5-0.5*cos(${t}*PI))`;          // smooth both ends

  // ORGANIC DRIFT — a real camera is never perfectly still. Two slow sine waves at
  // incommensurate periods never repeat, so the frame breathes instead of gliding on
  // rails. This is the single biggest reason a zoompan reads as "slideshow": it's
  // TOO smooth. Amplitude is a few pixels — felt, not seen.
  const driftX = `+7*sin(on/47)+4*sin(on/113)`;
  const driftY = `+6*cos(on/59)+3*sin(on/97)`;

  // Anchors: center, or upper third (where faces sit in vertical portraits).
  const cx = `iw/2-(iw/zoom/2)${driftX}`;
  const cyCenter = `ih/2-(ih/zoom/2)${driftY}`;
  const cyFace = `ih/2.6-(ih/zoom/2.6)${driftY}`;

  const group = (list: string[]) => list.includes(e);

  // DREAD/TERROR: slow inexorable creep toward the subject — the threat approaching.
  if (group(["terror", "miedo", "dread", "suspenso", "shock", "misterio", "mystery", "pista"]))
    return { z: `1+0.22*${easeIn}`, x: cx, y: cyFace };

  // REVELATION: pull back — the world opens up as the truth lands.
  if (group(["revelacion", "sorpresa", "traicion", "giro", "shock_reveal", "discovery"]))
    return { z: `1.26-0.24*${easeOut}`, x: cx, y: cyCenter };

  // ACTION/URGENCY: faster, decisive push with a settle.
  if (group(["accion", "urgencia", "escape", "thriller", "adrenalina", "rabia", "ira"]))
    return { z: `1+0.30*${easeOut}`, x: cx, y: cyCenter };

  // TENDERNESS/HOPE: gentle floating rise — the camera "breathes" upward.
  if (group(["ternura", "amor", "romance", "esperanza", "nostalgia", "intimidad", "triunfo", "inspiracion"]))
    return { z: `1+0.18*${easeInOut}`, x: cx, y: `ih/2-(ih/zoom/2)-40*${easeInOut}${driftY}` };

  // SADNESS/DRAMA: very slow, heavy push on the face.
  if (group(["tristeza", "duelo", "drama", "culpa", "verguenza"]))
    return { z: `1+0.16*${easeInOut}`, x: cx, y: cyFace };

  // Default: cinematic easeOut push, face-anchored.
  return { z: `1+0.20*${easeOut}`, x: cx, y: cyFace };
}

function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}
// Normaliza para comparar: sin tildes, sin puntuacion, en minusculas. Sirve para
// medir cuanto se parece lo que Whisper oyo a lo que el guion dice.
const normalizar = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

// Devuelve los tiempos con las palabras del GUION cuando la transcripcion no es
// de fiar. Ver el comentario largo en buildAssContent.
function conciliarConGuion(
  timings: Array<{ word: string; start: number; end: number }>,
  guion?: string,
): Array<{ word: string; start: number; end: number }> {
  const delGuion = (guion ?? "").trim();
  if (!timings.length || !delGuion) return timings;

  const oidas = normalizar(timings.map((t) => t.word).join(" "));
  const escritas = normalizar(delGuion);
  if (!escritas.length) return timings;

  // Cuantas palabras del guion aparecen de verdad en la transcripcion. Con 80% o
  // mas se confia en Whisper: acerto y su sincronia palabra-a-palabra es mejor
  // que cualquier reparto proporcional.
  const set = new Set(oidas);
  // ── LOS NOMBRES PROPIOS NO ADMITEN UMBRAL ──────────────────────────────────
  //
  // Con solo el 80% de coincidencia global, una frase que difiere en UNA palabra
  // pasaba el filtro y se conservaba la transcripción entera — con el error
  // adentro. Medido en producción: el guion decía "Alaia, ya no puedo seguir" y
  // el subtítulo salió "ALALIA, ya no puedo seguir"; el resto de la frase
  // coincidía, así que el umbral la dio por buena.
  //
  // Y esa única palabra es la que menos se puede equivocar: un nombre propio mal
  // escrito en pantalla es lo primero que el espectador nota, y lo lee como
  // descuido del producto entero.
  //
  // TODA palabra capitalizada del guion, sin excluir las que abren frase.
  //
  // La primera versión saltaba las iniciales de oración —para no confundir una
  // mayúscula gramatical con un nombre— y por eso dejó pasar "Alaia, ya no puedo
  // seguir": el vocativo casi siempre ABRE la frase, que es justo donde no
  // miraba.
  //
  // Incluirlas no genera falsos positivos: si Whisper oyó bien un "No" o un
  // "Entonces", la palabra está en lo transcripto y no dispara nada. Y si no la
  // oyó, desconfiar de la transcripción es exactamente lo correcto.
  const nombresDelGuion = (delGuion.match(/\p{Lu}\p{Ll}{2,}/gu) ?? [])
    .map((n) => normalizar(n)[0])
    .filter((n): n is string => Boolean(n));
  const oidasSet = new Set(oidas);
  const nombrePerdido = nombresDelGuion.find((n) => !oidasSet.has(n));
  if (nombrePerdido) {
    console.warn(`[subs] Whisper no oyó bien "${nombrePerdido}" — se usan las palabras del guion`);
    // cae al reparto desde el guion, más abajo
  } else {
    const aciertos = escritas.filter((p) => set.has(p)).length;
    // ── LAS PALABRAS DEL GUION, LOS TIEMPOS DE WHISPER ────────────────────
    // Antes, con ≥80% de coincidencia se devolvía la transcripción ENTERA — con
    // la palabra mal adentro: "ALIGIÉNDOTE", "BLOCALO", "SUPE SER SÍSMICO" en
    // pantalla. Ahora se alinean las dos secuencias (subsecuencia común más
    // larga) y se emite SIEMPRE el texto del guion: donde una palabra coincide
    // toma su tiempo medido; donde el guion tiene palabras que Whisper no oyó,
    // se reparten entre los vecinos alineados. Ortografía del guion, sincronía
    // de Whisper.
    if (aciertos / escritas.length >= 0.8) return alinearConGuion(timings, delGuion);
  }

  // Difiere demasiado: se conserva el TRAMO hablado que Whisper detecto y se
  // reparten sobre el las palabras reales del guion, ponderadas por largo —
  // las palabras largas se leen mas lento.
  const inicio = timings[0]!.start;
  const fin = timings[timings.length - 1]!.end;
  const span = Math.max(0.4, fin - inicio);
  const palabras = delGuion.split(/\s+/).filter(Boolean);
  const total = palabras.reduce((n, p) => n + p.length + 1, 0);
  let t = inicio;
  return palabras.map((p) => {
    const d = (span * (p.length + 1)) / total;
    const w = { word: p, start: t, end: t + d };
    t += d;
    return w;
  });
}

// Alineación por subsecuencia común más larga entre las palabras oídas y las
// del guion. Devuelve las palabras del GUION con tiempos: los medidos donde
// hubo coincidencia, interpolados entre vecinos donde no.
function alinearConGuion(
  timings: Array<{ word: string; start: number; end: number }>,
  guion: string,
): Array<{ word: string; start: number; end: number }> {
  const palabras = guion.split(/\s+/).filter(Boolean);
  const A = timings.map((t) => normalizar(t.word)[0] ?? "");
  const B = palabras.map((p) => normalizar(p)[0] ?? "");
  const n = A.length, m = B.length;
  if (!n || !m) return timings;
  // LCS
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i]![j] = A[i] && A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const match = new Array<number>(m).fill(-1); // índice de timing para cada palabra del guion
  for (let i = 0, j = 0; i < n && j < m;) {
    if (A[i] && A[i] === B[j]) { match[j] = i; i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  // Tiempos: coincidencia → medido; huecos → repartidos entre el fin del último
  // ancla y el inicio del siguiente (o los bordes del tramo hablado).
  const out: Array<{ word: string; start: number; end: number }> = [];
  const t0 = timings[0]!.start, tN = timings[n - 1]!.end;
  let j = 0;
  while (j < m) {
    if (match[j]! >= 0) { const t = timings[match[j]!]!; out.push({ word: palabras[j]!, start: t.start, end: t.end }); j++; continue; }
    // hueco j..k-1
    let k = j; while (k < m && match[k]! < 0) k++;
    const desde = j > 0 ? out[out.length - 1]!.end : t0;
    const hasta = k < m ? timings[match[k]!]!.start : tN;
    const span = Math.max(0.15 * (k - j), hasta - desde);
    const total = palabras.slice(j, k).reduce((acc, p) => acc + p.length + 1, 0);
    let t = desde;
    for (let q = j; q < k; q++) { const d = (span * (palabras[q]!.length + 1)) / total; out.push({ word: palabras[q]!, start: t, end: t + d }); t += d; }
    j = k;
  }
  return out;
}

// Build an ASS subtitle file for one scene: CapCut captions from word timings,
// plus optional watermark (free plan) and a CTA card on the closing seconds.
function buildAssContent(
  timings: Array<{ word: string; start: number; end: number }> | undefined,
  opts?: { durSec?: number; watermark?: boolean; cta?: string | null; niche?: string; guion?: string; isLast?: boolean },
): string {
  const hi = NICHE_COLOR[(opts?.niche ?? "").toLowerCase()] ?? NICHE_COLOR.default;
  const header =
    // WrapStyle 0, NO 2. Con 2 libass no parte las lineas nunca — solo respeta un
    // \N explicito — asi que el estilo CTA se salia del cuadro por los dos lados y
    // se leia "RTE 2 SI QUIERES SABER QUE H...". El comentario de los margenes de
    // abajo decia "wraps instead" y era falso: la cabecera lo impedia.
    "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n" +
    "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\n" +
    // Cap: heavy Arial Black, thick outline + drop shadow, wide side margins so a
    // long line NEVER runs off the 1080px frame (it wraps instead).
    `Style: Cap,${SUBTITLE_FONT},86,&H00FFFFFF,&H00000000,&H00000000,-1,0,1,8,4,2,110,110,400\n` +
    // Pop: same but in the niche's highlight color — used for the punch word.
    `Style: Pop,${SUBTITLE_FONT},90,${hi},&H00000000,&H00000000,-1,0,1,8,4,2,110,110,400\n` +
    "Style: Mark,Arial,38,&H60FFFFFF,&H60000000,&H00000000,-1,0,1,2,0,8,40,40,60\n" +
    // 74px no entraba: un CTA de hasta 60 caracteres a ese cuerpo mide bastante
    // mas que los 900px utiles. Con WrapStyle 0 ya parte solo, pero bajarlo a 58
    // evita que un cierre largo se coma media pantalla en tres renglones.
    `Style: CTA,Arial Black,58,${hi},&H00000000,&H00000000,-1,0,1,7,3,5,80,80,0\n` +
    // Lesson: la frase citable del cierre, más grande y al CENTRO del cuadro —
    // es la que la gente captura y comparte. Solo en la última escena.
    `Style: Lesson,${SUBTITLE_FONT},104,&H00FFFFFF,&H00000000,&H00000000,-1,0,1,9,5,2,90,90,620\n\n` +
    "[Events]\nFormat: Layer, Start, End, Style, MarginL, MarginR, Effect, Text\n";

  const lines: string[] = [];
  const crudo = (timings ?? []).filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end));
  // EL GUION MANDA SOBRE LA TRANSCRIPCION.
  //
  // Whisper transcribe el audio que genera el modelo de video, y se equivoca con
  // lo que mas importa: los nombres propios. Medido en un video real, el
  // subtitulo decia "ELÉ NUNCA DELIGIÓ, VALE." — dos palabras inventadas y
  // "Valeria" cortada a "Vale". Pero el texto correcto lo tenemos: es el guion
  // que nosotros mismos escribimos y que el personaje esta diciendo.
  //
  // Asi que Whisper aporta lo unico que el guion no sabe —CUANDO se habla— y el
  // guion aporta lo unico que Whisper no sabe: QUE se dice. Si la transcripcion
  // se parece bastante al guion se conserva tal cual (mantiene la precision
  // palabra por palabra); si difiere, se reparten las palabras del guion sobre
  // el tramo hablado que Whisper detecto.
  const clean = conciliarConGuion(crudo, opts?.guion);

  // ── Smart chunking ─────────────────────────────────────────────────────────
  // Break on: char budget, word count, long pause, OR sentence-ending punctuation.
  // This keeps captions short (no overflow) AND glued to the audio (no drift).
  type Chunk = { words: typeof clean; start: number; end: number };
  const chunks: Chunk[] = [];
  let cur: typeof clean = [];
  const esColgante = (w: { word: string }) =>
    COLGANTES.has(w.word.trim().toLowerCase().replace(/[^\p{L}]/gu, ""));
  // Cuando hay que cortar sí o sí —el cartel ya duró demasiado— estirarlo un
  // poco más lo desincroniza del audio. Así que en vez de alargar, se RETROCEDE:
  // las preposiciones y artículos del final se devuelven al cartel siguiente,
  // que es adonde pertenecen. "Es la hermana de mi / marido." pasa a ser
  // "Es la hermana / de mi marido." — mismo corte, del lado correcto.
  const flush = (hayMas = false) => {
    if (!cur.length) return;
    if (hayMas) {
      const devueltas: typeof clean = [];
      while (cur.length >= 3 && esColgante(cur[cur.length - 1]!)) devueltas.unshift(cur.pop()!);
      if (devueltas.length) {
        chunks.push({ words: cur, start: cur[0]!.start, end: cur[cur.length - 1]!.end });
        cur = devueltas;
        return;
      }
    }
    chunks.push({ words: cur, start: cur[0]!.start, end: cur[cur.length - 1]!.end });
    cur = [];
  };
  for (let i = 0; i < clean.length; i++) {
    const w = clean[i]!;
    const raw = w.word.trim();
    // Ellipsis/pause markers are dead weight on screen — drop standalone ones.
    if (/^[.…·—-]+$/.test(raw)) { flush(); continue; }
    cur.push(w);
    const text = cur.map((c) => c.word).join(" ");
    const next = clean[i + 1];
    const gapToNext = next ? next.start - w.end : 0;
    const spanTooLong = w.end - cur[0]!.start >= MAX_CHUNK_SECONDS;
    const endsSentence = /[.!?…]$/.test(raw);
    // Puntuacion y pausa mandan siempre: son limites reales del habla.
    // Una PAUSA no es un final de frase. El guion pide pausas dramáticas y el
    // modelo las actúa: con el umbral en 0.45s, cada respiración partía la
    // oración. Medido en un video real: "¿Qué hago ahora / con todo lo que /
    // construí para / nosotros?" — una sola frase en cuatro carteles, imposible
    // de leer como una idea.
    //
    // Ahora la pausa solo corta si además el cartel ya se sostiene solo (3+
    // palabras). La puntuación sigue mandando siempre: ahí sí terminó la frase.
    const corteDuro = endsSentence || (gapToNext > 0.6 && cur.length >= 3) || spanTooLong;
    // Los limites de tamaño, en cambio, son estéticos — y no valen un corte a
    // mitad de sintagma. Si la ultima palabra es un articulo o una preposicion,
    // se estira hasta la que la completa.
    const limite = text.length >= MAX_CHARS_PER_LINE || cur.length >= MAX_WORDS_PER_CHUNK;
    // Un cartel de UNA palabra tampoco se sostiene. Medido: "HAY" solo en pantalla
    // y, en el siguiente, "alguien parado junto a la cuna" — dos carteles para leer
    // una frase. Solo aplica al corte por tamaño: un "¡Sofía!" después de una pausa
    // real sigue saliendo solo, y así debe ser.
    const muyCorto = cur.length < 2;
    const quedaColgando =
      Boolean(next) && (muyCorto ||
        (COLGANTES.has(raw.toLowerCase().replace(/[^\p{L}]/gu, "")) && text.length < MAX_CHARS_PER_LINE + 12));
    // El guardia de palabra colgante valía SOLO para el corte por tamaño, y los
    // cortes duros son justamente donde más se nota. Medido: "SEIS MESES LO" /
    // "SIENTO, NATALIA" — una pausa al hablar partió "lo siento" en dos carteles.
    // Una respiración no convierte a "lo" en un final de cartel, y llegar al
    // segundo y medio tampoco. La puntuación sí manda siempre: ahí la frase
    // terminó de verdad, aunque termine en una palabra corta.
    const cortePorPausaOTiempo = !endsSentence && (corteDuro || limite);
    const puedeEstirarse = quedaColgando && w.end - cur[0]!.start < MAX_CHUNK_SECONDS + 0.8;
    if (endsSentence) flush();
    else if (cortePorPausaOTiempo && !puedeEstirarse) flush(Boolean(next));
  }
  flush();

  // ── NINGÚN CARTEL DE UNA SOLA PALABRA SIN PUNTUACIÓN ──────────────────────
  // El guardia de arriba cubre el corte por tamaño, pero no el flush final del
  // segmento ni el caso en que Whisper le asigna a una palabra un tramo que
  // abarca la pausa siguiente. Medido en un video terminado: "QUE" solo en
  // pantalla durante casi tres segundos, dos veces seguidas, en "Que no
  // estábamos juntos". Se fusiona con el cartel siguiente (o con el anterior si
  // es el último). Un "¡Sofía!" con signo se queda solo, como debe.
  for (let i = 0; i < chunks.length; ) {
    const c = chunks[i]!;
    const solaSinPunto = c.words.length === 1 && !/[.!?…]$/.test(c.words[0]!.word.trim());
    if (!solaSinPunto) { i++; continue; }
    if (chunks[i + 1]) {
      const n = chunks[i + 1]!;
      chunks.splice(i, 2, { words: [...c.words, ...n.words], start: c.start, end: n.end });
    } else if (chunks[i - 1]) {
      const p = chunks[i - 1]!;
      chunks.splice(i - 1, 2, { words: [...p.words, ...c.words], start: p.start, end: c.end });
    } else {
      i++;
    }
  }

  // ── Emit dialogue lines ────────────────────────────────────────────────────
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    const next = chunks[i + 1];
    const words = c.words.map((g) => g.word.toUpperCase().replace(/[{}\\]/g, "").replace(/^[…]+|[…]+$/g, "").trim()).filter(Boolean);
    if (!words.length) continue;
    const text = words.join(" ");
    // Hold the caption until the next one starts (max +0.35s) so there are no gaps
    // and it never lags behind the voice.
    const end = next ? Math.min(next.start, c.end + 0.35) : c.end + 0.25;
    // Punch styling: emphasize lines that carry a question/exclamation.
    const isPunch = /[!?¡¿]/.test(text);
    // ── LA LECCIÓN COMO TEXTO CINÉTICO ───────────────────────────────────
    // En la última escena, la frase de cierre (la citable) sube al centro,
    // más grande, y ENTRA palabra por palabra con un pop — como un cartel de
    // CapCut, no como un subtítulo. Es lo que la gente captura. El resto de
    // los carteles de esa escena siguen abajo, normales.
    const esLeccion = Boolean(opts?.isLast) && i === chunks.length - 1 && words.length >= 3;
    if (esLeccion) {
      const paso = Math.max(0.12, Math.min(0.32, (c.end - c.start) / words.length));
      const partes = words.map((w, k) => {
        const t = Math.round(k * paso * 1000);
        return `{\\alpha&HFF&\\t(${t},${t + 90},\\alpha&H00&)}{\\fscx88\\fscy88\\t(${t},${t + 110},\\fscx100\\fscy100)}${w}`;
      });
      lines.push(`Dialogue: 1,${assTime(c.start)},${assTime(Math.max(end + 0.6, c.start + 1.2))},Lesson,,,,${partes.join(" ")}`);
      continue;
    }
    const style = isPunch ? "Pop" : "Cap";
    // Subtle pop-in scale so each caption "snaps" like CapCut.
    lines.push(`Dialogue: 0,${assTime(c.start)},${assTime(Math.max(end, c.start + 0.25))},${style},,,,{\\fscx92\\fscy92\\t(0,90,\\fscx100\\fscy100)}${text}`);
  }
  const dur = Math.max(1, opts?.durSec ?? 60);
  if (opts?.watermark) {
    lines.push(`Dialogue: 0,${assTime(0)},${assTime(dur)},Mark,,,,VYNAVO`);
  }
  if (opts?.cta) {
    const ctaText = opts.cta.replace(/[{}\\]/g, "").slice(0, 60).toUpperCase();
    // EL CTA ESPERA A QUE EL DIALOGO TERMINE.
    //
    // Arrancaba siempre a dur-2.6 sin mirar si aún se estaba hablando. Medido en
    // un video real: a los 28s aparecía "COMENTA PARTE 2..." mientras el
    // subtítulo seguía diciendo "construí para / nosotros?" — dos textos
    // compitiendo en pantalla justo en el remate emocional, que es el peor
    // momento posible para dividir la atención.
    const finDialogo = chunks.length ? chunks[chunks.length - 1]!.end : 0;
    // Si el diálogo llega hasta el final, el CTA se muestra igual sobre el último
    // segundo: perderlo sería perder la llamada a la acción.
    const start = Math.min(Math.max(dur - 2.6, finDialogo + 0.2), Math.max(0, dur - 0.9));
    lines.push(`Dialogue: 1,${assTime(start)},${assTime(dur)},CTA,,,,{\\fad(250,0)}${ctaText}`);
  }
  return header + lines.join("\n") + "\n";
}

async function download(url: string, path: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url.slice(0, 60)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buf);

  // A .jpg URL does not guarantee JPEG bytes: fal serves WebP and AVIF behind
  // those names, and the minimal ffmpeg in an Alpine image may lack the decoder.
  // The failure is silent and looks like nothing at all — the encoder starts, the
  // filters configure, and zero frames ever appear. Naming the real format turns
  // that into a one-line diagnosis instead of hours of guessing.
  const nombre = path.split(/[/]/).pop() ?? path;
  // Solo las IMAGENES. El chequeo marcaba cada clip descargado como
  // "NO es jpeg/png -> avif/heic" porque 'ftyp' es tambien la firma de un MP4
  // sano: cuatro alarmas rojas por render, todas falsas, justo en los logs que
  // usamos para diagnosticar. Un diagnostico que grita cuando no pasa nada
  // entrena a ignorarlo.
  if (/\.(mp4|mov|webm|m4v|mp3|m4a|aac|wav)$/i.test(nombre)) return;
  const m = buf.subarray(0, 12);
  const tipo =
    m[0] === 0xff && m[1] === 0xd8 ? "jpeg" :
    m.subarray(0, 4).toString("hex") === "89504e47" ? "png" :
    m.subarray(8, 12).toString("ascii") === "WEBP" ? "webp" :
    m.subarray(4, 8).toString("ascii") === "ftyp" ? "avif/heic" :
    "desconocido:" + m.subarray(0, 4).toString("hex");
  if (tipo !== "jpeg" && tipo !== "png") {
    console.warn("[download] " + nombre + " NO es jpeg/png -> " + tipo + " (" + buf.length + " bytes)");
  } else if (buf.length < 1024) {
    console.warn("[download] " + nombre + " pesa solo " + buf.length + " bytes");
  }
}

// Reparte el texto de una escena a lo largo de su duración cuando no hay tiempos
// medidos. No compite con Whisper: las palabras largas ocupan proporcionalmente
// más, y nada más. Alcanza para que el cartel esté en pantalla mientras se dice
// la línea, que es el 90% del valor de un subtítulo en un feed sin sonido.
function repartirPalabras(texto: string | undefined, durSec: number): Array<{ word: string; start: number; end: number }> {
  const palabras = (texto ?? "").trim().split(/\s+/).filter(Boolean);
  if (!palabras.length || durSec <= 0) return [];
  const pesos = palabras.map((w) => Math.max(2, w.length));
  const total = pesos.reduce((a, b) => a + b, 0);
  // Un respiro al final: la voz casi nunca ocupa el segmento entero.
  const util = Math.max(0.5, durSec - 0.25);
  let t = 0;
  return palabras.map((w, k) => {
    const dur = (pesos[k]! / total) * util;
    const start = t;
    t += dur;
    return { word: w, start, end: t };
  });
}

// ¿El archivo trae pista de audio? Un clip generado puede venir sin ella, y el
// concat con -c copy no perdona esa diferencia: apenas aparece un segmento mudo,
// el audio del video entero se corta ahí.
async function tieneAudio(path: string): Promise<boolean> {
  try {
    const { stdout } = await exec(FFPROBE, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path]);
    return stdout.trim().length > 0;
  } catch { return false; }
}

async function probeDuration(path: string): Promise<number> {
  try {
    const { stdout } = await exec(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", path]);
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch { return 0; }
}

// Build ONE scene clip: Ken Burns over the image (or use the video clip) + its audio.
// `deco` adds the finishing touches: crossfade-in, watermark, and the closing CTA.
async function buildSceneClip(
  dir: string, i: number, scene: FfScene,
  deco?: { watermark?: boolean; cta?: string | null; isFirst?: boolean; isLast?: boolean; niche?: string; startsAt?: number },
): Promise<string | null> {
  const out = join(dir, `scene_${i}.mp4`);
  const audioPath = join(dir, `a_${i}.mp3`);
  let hasAudio = false;
  // A narrative block covers several scenes with ONE clip, so their narrations
  // play back to back over it. Concatenated here rather than upstream so the
  // duration probe below measures the real combined length.
  if (scene.audioUrls && scene.audioUrls.length > 1) {
    try {
      const parts: string[] = [];
      for (let k = 0; k < scene.audioUrls.length; k++) {
        const part = join(dir, `a_${i}_${k}.mp3`);
        await download(scene.audioUrls[k]!, part);
        parts.push(part);
      }
      const listPath = join(dir, `alist_${i}.txt`);
      writeFileSync(listPath, parts.map((f) => `file '${f.split(String.fromCharCode(92)).join("/")}'`).join(String.fromCharCode(10)));
      // Re-encode on concat: the parts can differ in bitrate, and -c copy would
      // produce a file whose duration probe lies.
      await exec(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:a", "libmp3lame", "-b:a", "128k", audioPath], { maxBuffer: 1 << 26, cwd: dir });
      hasAudio = true;
    } catch { hasAudio = false; }
  } else if (scene.audioUrl) {
    try { await download(scene.audioUrl, audioPath); hasAudio = true; } catch { hasAudio = false; }
  }
  // EL CLIP SE DESCARGA ACÁ, ANTES DE MEDIR.
  //
  // La duración de abajo alimenta el archivo de subtítulos: cuánto dura la marca de
  // agua y en qué segundo arranca el CTA. Con audio nativo no hay pista de
  // narración que medir y `durationSeconds` viaja sin valor a propósito —manda el
  // clip— así que caía al respaldo de 4 segundos.
  //
  // Medido sobre un video real de 22s: la marca de agua desaparecía a los 4s de
  // cada segmento, y el CTA de "Parte 2" salía a los 12 segundos en vez del final,
  // porque se calculaba como "4 - 2.6" sobre un clip que en realidad duraba 10.
  const vidPath = scene.videoUrl ? join(dir, `v_${i}.mp4`) : null;
  if (vidPath) {
    try { await download(scene.videoUrl!, vidPath); } catch { /* la rama de abajo reintenta y falla ahí */ }
  }
  const dur = hasAudio
    ? Math.max(1.5, (await probeDuration(audioPath)) + 0.3)
    : vidPath
      ? Math.max(2, (await probeDuration(vidPath).catch(() => 0)) || (scene.durationSeconds ?? 4))
      : Math.max(2, scene.durationSeconds ?? 4);
  const frames = Math.round(dur * 30);

  // CapCut subtitles + watermark + CTA: one per-scene .ass file (relative name so
  // Windows path escaping in the ffmpeg filter is a non-issue — we set cwd=dir).
  // RED DE SEGURIDAD DE SUBTÍTULOS. Medido en un video real de 97s: cero líneas de
  // texto en las doce muestras que revisé. La marca de agua sí aparecía, o sea que
  // el archivo .ass se creaba — llegaba vacío de diálogo porque wordTimings venía
  // sin nada (Whisper falló, o la transcripción no viajó hasta acá).
  //
  // En Reels y Shorts la mayoría mira SIN SONIDO. Un video sin subtítulos pierde a
  // esa gente entera, y el diálogo es justo lo mejor que tiene este producto. Así
  // que si no hay tiempos medidos, se reparten desde el texto del guion: quedan
  // menos ajustados que los de Whisper, pero existen.
  const timings = scene.wordTimings?.length
    ? scene.wordTimings
    : repartirPalabras(scene.narrationText, dur);
  if (!scene.wordTimings?.length && timings.length) {
    console.warn(`[subs] escena ${i}: sin tiempos medidos — subtítulos repartidos desde el guion (${timings.length} palabras)`);
  }

  const needAss = Boolean(timings.length || deco?.watermark || (deco?.isLast && deco?.cta));
  let assName: string | null = null;
  if (needAss) {
    assName = `s_${i}.ass`;
    writeFileSync(join(dir, assName), buildAssContent(timings, {
      durSec: dur,
      watermark: deco?.watermark,
      cta: deco?.isLast ? deco?.cta ?? null : null,
      niche: deco?.niche,
      // El guion de esta escena: la verdad sobre QUÉ se dice, para corregir a
      // Whisper cuando inventa palabras o parte los nombres propios.
      guion: scene.narrationText,
      isLast: deco?.isLast,
    }));
  }
  const subFilter = assName ? `,ass=${assName}` : "";
  // Smooth scene transitions: quick fade-in on every scene after the first,
  // and a gentle fade-out to close the video.
  // Un corte dentro del mismo lugar es un cambio de ángulo y se sostiene solo: 0.4s
  // apenas suaviza el empalme. Un CAMBIO DE ESCENARIO es otra cosa — el espectador
  // tiene que entender que se movió en el espacio o en el tiempo, y para eso el
  // fundido tiene que durar lo suficiente como para leerse. Sin esta distinción
  // todos los cortes pesan igual y el video se siente desarmado.
  // CORTE SECO, no fundido desde negro.
  //
  // Antes cada segmento arrancaba con fade=t=in, así que TODOS los empalmes
  // pasaban por oscuridad. Medido sobre un video real: en el corte del segundo
  // 25.12 el brillo iba 51 → 0 → 0 → 2 → 15 → 51. Dos décimas de negro absoluto
  // en cada junta.
  //
  // En cine un fundido a negro significa "pasó el tiempo" o "terminó el acto".
  // Entre dos planos de la misma escena va CORTE SECO — es lo que hace que se lea
  // como una edición y no como clips pegados. Usarlo en cada corte es justo lo que
  // hace que un montaje se sienta amateur.
  //
  // Se conserva un fundido corto SOLO cuando cambia el escenario, que es el único
  // caso donde el negro significa algo: el espectador se movió en el espacio.
  const fadeIn = deco?.isFirst || !scene.newLocation
    ? ""
    : ",fade=t=in:st=0:d=0.35";
  const fadeOut = deco?.isLast ? `,fade=t=out:st=${Math.max(0, dur - 0.5).toFixed(2)}:d=0.5` : "";
  const transition = `${fadeIn}${fadeOut}`;
  const opts = { maxBuffer: 1 << 26, cwd: dir };

  // ── TODOS LOS SEGMENTOS TIENEN QUE SALIR IDÉNTICOS ──────────────────────────
  // El montaje final los pega con `-c copy`, que no recodifica nada: se limita a
  // apilar paquetes. Eso es rapidísimo y gratis, pero exige que los segmentos
  // compartan fps, tasa de muestreo y disposición de pistas. No las compartían:
  //
  //   · un clip de Seedance venía a 24 fps y CON audio
  //   · una imagen con Ken Burns salía a 30 fps y SIN pista de audio
  //
  // Medido sobre dos videos reales: el audio se cortaba en seco a los 62 segundos
  // —justo donde se acaban los clips y empiezan las imágenes— y los últimos 42
  // segundos quedaban mudos. Además los tiempos se estiraban, porque el contenedor
  // adopta el fps del primer segmento: 10 fotogramas repartidos en 16 segundos, y
  // un video pedido de 60s terminando en 104.
  //
  // La solución no es dejar de copiar (recodificar 100s cuesta minutos de CPU):
  // es que cada segmento nazca igual. 30 fps, 48 kHz estéreo, y SIEMPRE una pista
  // de audio — silenciosa si la escena no tiene sonido propio.
  const FPS = "30";
  const SILENCIO = ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];
  const SALIDA_UNIFORME = ["-r", FPS, "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k"];

  try {
    if (scene.videoUrl) {
      // Real motion clip → scale/pad to 1080x1920 + burn subtitles + mux audio.
      // Ya se descargó arriba para poder medirlo antes de armar los subtítulos;
      // bajarlo dos veces costaría una descarga entera por escena.
      const vid = vidPath!;
      if (!existsSync(vid)) await download(scene.videoUrl, vid);

      // With native character audio there is no narration track to measure, so the
      // segment lasts exactly as long as the clip. Without this the fade-out was
      // computed from a 4s fallback and landed halfway through an 8s take.
      let outro = transition;
      if (!hasAudio) {
        const realDur = await probeDuration(vid).catch(() => 0);
        if (realDur > 1) {
          const fo = deco?.isLast ? `,fade=t=out:st=${Math.max(0, realDur - 0.5).toFixed(2)}:d=0.5` : "";
          outro = `${fadeIn}${fo}`;
        }
      }
      // ¿Cuánto más larga es la narración que el clip? De eso depende TODO lo de
      // abajo. Medido en un video real: un clip de 8s bajo 19s de narración dejaba
      // 11 SEGUNDOS de foto quieta en el medio del video — el 11% del total, justo
      // donde se decide si alguien sigue mirando.
      // La duración real del clip SIEMPRE se mide: los efectos de montaje la
      // necesitan también con audio nativo (antes era 0 en ese camino y el
      // punch-in nunca se aplicaba — medido).
      const durVideo = await probeDuration(vid).catch(() => 0);
      const clipDur = hasAudio ? durVideo : 0;
      const audioDur = hasAudio ? await probeDuration(audioPath).catch(() => 0) : 0;
      const sobra = clipDur > 0 && audioDur > clipDur ? audioDur - clipDur : 0;

      const args = ["-y"];
      // Si falta MUCHO video, se REPITE el clip en vez de congelarlo. Un bucle se
      // nota; once segundos de estatua se abandonan. tpad sigue existiendo para el
      // resto — clonar medio segundo al final es invisible y evita el corte seco.
      if (sobra > FREEZE_MAX) args.push("-stream_loop", "-1");
      args.push("-i", vid);
      if (hasAudio) args.push("-i", audioPath);
      // Silencio como ÚLTIMA entrada, siempre presente. Si ni la narración ni el
      // clip traen audio, el segmento igual sale con pista: un solo segmento mudo
      // corta el audio del video entero en el concat.
      const clipConAudio = await tieneAudio(vid);
      const idxSilencio = (hasAudio ? 2 : 1);
      if (!hasAudio && !clipConAudio) args.push(...SILENCIO);
      const relleno = hasAudio
        ? (sobra > FREEZE_MAX ? "" : `,tpad=stop_mode=clone:stop_duration=${Math.min(FREEZE_MAX, Math.max(0.2, sobra) + 0.3).toFixed(2)}`)
        : "";
      if (sobra > FREEZE_MAX) {
        // El bucle es infinito: la duración la fija la narración.
        args.push("-t", audioDur.toFixed(2));
        console.log(`[ffmpeg] escena ${i}: clip ${clipDur.toFixed(1)}s bajo ${audioDur.toFixed(1)}s de audio → se repite en bucle (antes: ${sobra.toFixed(1)}s congelados)`);
      }
      args.push(
        // La narración manda sobre la duración del segmento: un bloque narrativo
        // apila varias escenas sobre una sola generación, y cortar con -shortest
        // se comía líneas enteras. Pero el relleno ya no es una estatua indefinida.
        // ── CADA CLIP A LA MISMA SONORIDAD ───────────────────────────────
        // Cada generación de Seedance sale con su propio volumen de voz, y el
        // loudnorm del final empareja el PROMEDIO del video, no las diferencias
        // entre escenas. Medido en un video terminado: -14.6 dB en una línea y
        // -20.2 dB en la siguiente — 5.6 dB de salto entre dos réplicas, que
        // se oye como "ahora grita, ahora susurra" sin que el guion lo pida.
        // Se normaliza AQUÍ, clip por clip, a un objetivo fijo: determinista y
        // sin bombeo. Solo aplica al audio nativo del clip; la narración de
        // ElevenLabs ya sale pareja.
        "-filter_complex",
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1${relleno}${efectosDeMontaje(scene, deco, hasAudio ? audioDur : durVideo)}${lookDe(deco?.niche)}${subFilter}${outro}[v]` +
        (!hasAudio && clipConAudio ? `;[0:a]loudnorm=I=${CLIP_LUFS}:TP=-1.5:LRA=7[a]` : ""),
        "-map", "[v]",
        "-map", hasAudio ? "1:a" : (clipConAudio ? "[a]" : `${idxSilencio}:a`),
        ...X264_THREADS, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        ...SALIDA_UNIFORME, "-shortest", out,
      );
      await exec(FFMPEG, args, opts);

      // ── RALENTÍ DEL "DESPUÉS" EN EL PICO ────────────────────────────────
      // El segundo que la gente captura es el que sigue al contacto: la mano que
      // aterriza, los labios que se separan, el cuerpo que cae. Se estira SOLO
      // el tramo posterior a la última palabra (0.6×), así la voz queda intacta
      // y el audio de esa cola —room tone— se silencia (la música lo cubre).
      // Solo en géneros de acción y solo si hay al menos 1.2 s de cola.
      // Post-proceso sobre el segmento ya hecho: si falla, se conserva el
      // original y no se pierde nada.
      if (EFECTOS_ON && scene.isPeak && !hasAudio && clipConAudio && /drama|terror|horror|thriller|comedia|comedy|misterio|mystery|accion|action/i.test(deco?.niche ?? "")) {
        const finVoz = scene.wordTimings?.length ? Math.max(...scene.wordTimings.map((w) => w.end)) : 0;
        const durSeg = await probeDuration(out).catch(() => 0);
        if (finVoz > 0.5 && durSeg - finVoz >= 1.2) {
          const lento = join(dir, `s_${i}_slow.mp4`);
          const f = 0.6; // velocidad de la cola
          try {
            await exec(FFMPEG, [
              "-y", "-i", out,
              "-filter_complex",
              `[0:v]trim=0:${finVoz.toFixed(2)},setpts=PTS-STARTPTS[v1];` +
              `[0:v]trim=${finVoz.toFixed(2)},setpts=(PTS-STARTPTS)/${f}[v2];` +
              `[0:a]atrim=0:${finVoz.toFixed(2)},asetpts=PTS-STARTPTS[a1];` +
              `anullsrc=r=48000:cl=stereo,atrim=0:${((durSeg - finVoz) / f).toFixed(2)}[a2];` +
              `[v1][v2]concat=n=2:v=1:a=0[v];[a1][a2]concat=n=2:v=0:a=1[a]`,
              "-map", "[v]", "-map", "[a]",
              ...X264_THREADS, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
              ...SALIDA_UNIFORME, lento,
            ], opts);
            if (existsSync(lento) && (await probeDuration(lento).catch(() => 0)) > durSeg) {
              writeFileSync(out, readFileSync(lento));
              console.log(`[efectos] escena ${i}: pico — cola de ${(durSeg - finVoz).toFixed(1)}s ralentizada a ${f}×`);
            }
          } catch (e) {
            console.warn(`[efectos] escena ${i}: ralentí omitido — ${e instanceof Error ? e.message.slice(0, 120) : e}`);
          }
        }
      }
    } else if (scene.imageUrl && (scene.shots?.length ?? 0) > 0) {
      // ── MULTI-SHOT: cut between camera setups inside this one scene ───────────
      // Build a silent Ken Burns segment per shot, concat them, THEN lay the scene's
      // narration + captions over the whole cut. Cutting every ~1.5s is what gives
      // limited-budget animation its energy — and the cuts also hide the small
      // drift between independently generated frames.
      const urls = [scene.imageUrl, ...(scene.shots ?? [])];
      const per = dur / urls.length;
      const perFrames = Math.max(12, Math.round(per * 30));
      const atmo = ATMOSPHERE_ON ? `,noise=alls=6:allf=t+u` : "";
      const segs: string[] = [];
      for (let k = 0; k < urls.length; k++) {
        const shotImg = join(dir, `i_${i}_${k}.jpg`);
        await download(urls[k]!, shotImg);
        const smo = kenBurnsMotion(scene.emotion, perFrames);
        const seg = join(dir, `seg_${i}_${k}.mp4`);
        await exec(FFMPEG, [
          "-y", "-loop", "1", "-i", shotImg,
          "-filter_complex",
          `[0:v]scale=${OVERSAMPLE_W}:${OVERSAMPLE_H}:force_original_aspect_ratio=increase,crop=${OVERSAMPLE_W}:${OVERSAMPLE_H},` +
          `zoompan=z='${smo.z}':x='${smo.x}':y='${smo.y}':d=${perFrames}:s=1080x1920:fps=30,setsar=1${atmo}${lookDe(deco?.niche)}[v]`,
          "-map", "[v]", "-t", per.toFixed(3),
          ...X264_THREADS, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", seg,
        ], opts);
        segs.push(seg);
      }
      // Concat the shots into this scene's silent video track.
      const shotList = join(dir, `shots_${i}.txt`);
      writeFileSync(shotList, segs.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
      const track = join(dir, `track_${i}.mp4`);
      await exec(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", shotList, "-c", "copy", track], opts);

      // Lay narration + burned captions over the finished cut.
      const args2 = ["-y", "-i", track];
      if (hasAudio) args2.push("-i", audioPath);
      // Igual que las otras dos ramas: nunca un segmento sin pista de audio.
      if (!hasAudio) args2.push(...SILENCIO);
      args2.push("-filter_complex", `[0:v]setsar=1${lookDe(deco?.niche)}${subFilter}${transition}[v]`, "-map", "[v]");
      args2.push("-map", "1:a", "-shortest");
      args2.push(...X264_THREADS, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", ...SALIDA_UNIFORME, out);
      await exec(FFMPEG, args2, opts);
    } else if (scene.imageUrl) {
      const img = join(dir, `i_${i}.jpg`);
      await download(scene.imageUrl, img);
      // Eased, emotion-driven, anchored Ken Burns (see kenBurnsMotion). Upscaling
      // 2x before zoompan avoids the shimmer/jitter zoompan has on 1:1 sources.
      const mo = kenBurnsMotion(scene.emotion, frames);
      // Film grain texture over the still. Measured: it does alter the frame, but it
      // does NOT meaningfully add frame-to-frame motion (x264 smooths it away). Keep
      // it for texture — do not mistake it for making the shot feel alive. Real
      // aliveness needs a video model (see ANIMATE_HERO_SCENES).
      const atmo = ATMOSPHERE_ON ? `,noise=alls=6:allf=t+u` : "";
      const kb = `[0:v]scale=${OVERSAMPLE_W}:${OVERSAMPLE_H}:force_original_aspect_ratio=increase,crop=${OVERSAMPLE_W}:${OVERSAMPLE_H},` +
        `zoompan=z='${mo.z}':x='${mo.x}':y='${mo.y}':d=1:s=1080x1920:fps=30,setsar=1${atmo}${lookDe(deco?.niche)}${subFilter}${transition}[v]`;
      // d=1, NOT d=frames. With -loop 1 the input never ends, so d=frames asks
      // zoompan for 150 output frames PER input frame — it buffers forever and
      // never emits the first one, which is the "frame= 0" every scene died on.
      // With d=1 each looped frame yields one output frame and the z/x/y
      // expressions advance through `on`, which is what they already use.
      const args = ["-y", "-loop", "1", "-framerate", "30", "-t", String(dur), "-i", img];
      if (hasAudio) args.push("-i", audioPath);
      // ESTA es la rama que rompía el audio del video entero. Una imagen no tiene
      // pista de sonido, así que sin narración el segmento salía mudo — y el concat
      // con -c copy corta el audio en el primer segmento sin pista. Medido: el audio
      // moría a los 62s, justo donde se acababan los clips, y los últimos 42
      // segundos del video quedaban en silencio.
      if (!hasAudio) args.push(...SILENCIO);
      args.push("-filter_complex", kb, "-map", "[v]");
      // En los dos casos la entrada 1 es el audio: la narración, o el silencio.
      args.push("-map", "1:a", "-shortest");
      args.push(...X264_THREADS, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", ...SALIDA_UNIFORME, out);
      try {
        await exec(FFMPEG, args, opts);
      } catch (e) {
        // Burned captions are the most fragile link: they depend on libass, on
        // fontconfig, and on a font that actually exists in the image. A video
        // without captions still ships; a failed render ships nothing and throws
        // away images and clips that were already paid for. So if the subtitle
        // pass fails, retry the same segment plain.
        if (!subFilter) throw e;
        console.warn("[ffmpeg] scene " + i + ": reintentando SIN subtitulos");
        const plano = kb.split(subFilter).join("");
        const args2 = args.map((x) => (x === kb ? plano : x));
        await exec(FFMPEG, args2, opts);
      }
    } else {
      return null;
    }
    return out;
  } catch (e) {
    // Include ffmpeg's OWN stderr, not just the wrapper's "Command failed": the
    // useful line (out of memory, invalid filter, missing codec) lives there, and
    // truncating to 160 chars threw it away every time.
    const detalle = (e as { stderr?: string })?.stderr;
    // EXIT CODE + SIGNAL FIRST. Sin esto no se distingue el caso que nos costó
    // horas: ffmpeg que FALLA (imprime la causa en stderr, exit 1) de ffmpeg que
    // es MATADO por el contenedor (stderr sin una sola linea de error, sin exit
    // code, signal=SIGKILL). Los dos se ven identicos como "Command failed:".
    const err = e as { code?: number | string; signal?: string };
    console.error(
      `[ffmpeg] scene ${i} failed: exit=${err?.code ?? "-"} signal=${err?.signal ?? "-"}`,
      (e instanceof Error ? e.message : String(e)).slice(0, 200),
    );
    if (detalle) {
      // Progress lines (frame= fps= size=) are 95% of ffmpeg stderr and say
      // nothing. Showing the tail buried the one line that matters — the parse
      // error or the resource failure — under a wall of "frame= 0".
      const lineas = String(detalle).split(String.fromCharCode(10));
      const util = lineas
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .filter((l) => !l.startsWith("frame=") && !l.startsWith("video:") && !l.startsWith("size="))
        .filter((l) => /error|invalid|failed|no such|cannot|unable|undefined|killed|memory|Conversion/i.test(l))
        .slice(-6);
      // Sin coincidencias, la cola son puras lineas de progreso y no dice nada.
      // Los fallos de configuracion del grafo de filtros salen al PRINCIPIO, antes
      // de que arranque el encoder — por eso el fallback mira los dos extremos.
      const limpias = lineas.map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("frame="));
      const fallback = limpias.length > 10
        ? [...limpias.slice(0, 6), "…", ...limpias.slice(-4)]
        : limpias;
      console.error("[ffmpeg] scene " + i + " causa:", (util.length ? util : fallback).join(" | "));
    }
    return null;
  }
}

// Assemble the whole project → one MP4 → upload to R2. Returns the durable URL.
export async function assembleWithFfmpeg(params: {
  scenes: FfScene[];
  musicUrl?: string | null;
  cta?: string | null;        // closing call-to-action card
  watermark?: boolean;        // free-plan brand mark
  niche?: string;             // drives the caption highlight color
  sfxWhooshUrl?: string | null;  // transition whoosh on every cut
  sfxImpactUrl?: string | null;  // impact hit on the opening hook
  // El ruido propio de cada escena (puerta, vidrio, pasos), posicionado por índice
  // dentro de `scenes` — no por scene_number, porque los bloques absorben escenas y
  // los números dejan de ser correlativos con la línea de tiempo.
  sceneSfx?: Array<{ sceneIndex: number; url: string }>;
}): Promise<{ url: string; provider: "ffmpeg"; audit?: AuditoriaVideo | null }> {
  const dir = join(tmpdir(), `vynavo_${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  try {
    // 1) Per-scene clips (sequential — keeps memory sane on a small box).
    const clips: string[] = [];
    const boundaries: number[] = [];   // absolute start time of each scene (for SFX)
    let elapsed = 0;
    const last = params.scenes.length - 1;
    for (let i = 0; i < params.scenes.length; i++) {
      const c = await buildSceneClip(dir, i, params.scenes[i]!, {
        watermark: params.watermark,
        cta: params.cta ?? null,
        isFirst: i === 0,
        isLast: i === last,
        niche: params.niche,
        startsAt: elapsed,
      });
      if (c) {
        clips.push(c);
        boundaries.push(elapsed);
        elapsed += await probeDuration(c);
      }
    }
    if (!clips.length) throw new Error("No scene clips could be built");

    // 2) Concatenate.
    const listPath = join(dir, "list.txt");
    writeFileSync(listPath, clips.map((c) => `file '${c.replace(/\\/g, "/")}'`).join("\n"));
    const concatOut = join(dir, "concat.mp4");
    await exec(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concatOut], { maxBuffer: 1 << 26 });

    // ¿El audio llegó hasta el final? Con -c copy, un solo segmento con distinto
    // formato de pista trunca el audio del resto sin que ffmpeg falle: el render
    // termina "bien" y el video sale mudo desde la mitad. Medido en dos videos
    // seguidos — el audio moría a los 62s de 104. Compararlo cuesta una llamada a
    // ffprobe y convierte ese fallo mudo en una línea de log.
    try {
      const { stdout: aEnd } = await exec(FFPROBE, [
        "-v", "error", "-select_streams", "a", "-show_entries", "stream=duration",
        "-of", "default=nk=1:nw=1", concatOut,
      ]);
      const audioDur = parseFloat(aEnd.trim());
      const videoDur = await probeDuration(concatOut);
      if (Number.isFinite(audioDur) && videoDur > 0 && videoDur - audioDur > 2) {
        console.error(
          `[concat] AUDIO TRUNCADO: video ${videoDur.toFixed(1)}s pero audio ${audioDur.toFixed(1)}s — ` +
          `${(videoDur - audioDur).toFixed(1)}s del final salen mudos. Algún segmento no comparte formato de audio.`,
        );
      } else {
        console.log(`[concat] ${videoDur.toFixed(1)}s de video, ${audioDur.toFixed(1)}s de audio — alineados`);
      }
    } catch { /* la verificación no puede tumbar el render */ }

    // 3) SOUND DESIGN + music in ONE mix pass.
    //    • impact hit on the hook (scene 1) — lands the first punch
    //    • whoosh on every scene cut — the cuts read as *edited*, not as a slideshow
    //    • music bed ducked under the narration
    //    Sound design is a huge share of perceived production value in horror/drama.
    let finalOut = concatOut;
    try {
      const inputs: string[] = ["-i", concatOut];
      const filters: string[] = [];
      const mixLabels: string[] = ["[0:a]"];
      let idx = 1;

      if (params.musicUrl) {
        const music = join(dir, "music.mp3");
        await download(params.musicUrl, music);
        // EN BUCLE. La pista se pide con una duración estimada que puede quedar
        // corta, y cuando queda corta el video termina en silencio: medido, los
        // últimos 7.6 segundos de un video de terror —el clímax— sin una sola nota,
        // y 17 de los últimos 22 casi mudos. Repetirla cuesta cero y hace que la
        // música cubra el video sea cual sea su largo; amix corta con la duración
        // del primer input, así que el bucle nunca alarga el resultado.
        inputs.push("-stream_loop", "-1", "-i", music);
        filters.push(`[${idx}:a]volume=0.12[mus]`);
        mixLabels.push("[mus]");
        idx++;
      }

      // ── WHOOSH: SOLO EN LOS SALTOS DE LUGAR, NO EN CADA CORTE ──────────────
      //
      // Antes sonaba el MISMO whoosh en cada corte de escena: en un video de 64s
      // con 12 escenas, once veces el mismo ruido. Medido sobre el mp4: en los
      // cortes la energía de alta frecuencia salta ×5-6 sobre la base — es el
      // whoosh — y el usuario lo describió exacto: "hay mismo efectos de sonido".
      //
      // El whoosh en cada corte es un hábito de slideshow. El drama vertical de
      // verdad corta en seco dentro de una escena (el diálogo nativo ya lleva el
      // corte) y solo marca con sonido el CAMBIO DE LUGAR o de tiempo. Así que:
      //   · solo donde la escena marca newLocation (dato que ya viene del guion)
      //   · nunca dos en menos de 6s (dos saltos seguidos suenan a metralleta)
      //   · más bajo (0.38 → 0.24): acompaña el corte, no lo tapa
      // Si el guion no trae ninguna newLocation, no suena ninguno — un video sin
      // whoosh es normal; con once, no.
      const cuts = boundaries.slice(1);
      const saltos: number[] = [];
      let ultimo = -Infinity;
      cuts.forEach((t, k) => {
        const esc = params.scenes[k + 1];
        if (!esc?.newLocation) return;
        if (t - ultimo < 6) return;
        saltos.push(t); ultimo = t;
      });
      if (params.sfxWhooshUrl && saltos.length) {
        const w = join(dir, "whoosh.mp3");
        await download(params.sfxWhooshUrl, w);
        inputs.push("-i", w);
        const wi = idx++;
        const outs = saltos.map((_, k) => `[w${k}]`).join("");
        filters.push(`[${wi}:a]asplit=${saltos.length}${outs}`);
        saltos.forEach((t, k) => {
          const ms = Math.max(0, Math.round((t - 0.12) * 1000));  // land just before the cut
          filters.push(`[w${k}]adelay=${ms}|${ms},volume=0.24[wd${k}]`);
          mixLabels.push(`[wd${k}]`);
        });
        console.log(`[audio] whoosh en ${saltos.length} salto(s) de lugar de ${cuts.length} cortes`);
      } else if (cuts.length) {
        console.log(`[audio] sin whoosh: ${cuts.length} cortes, ninguno cambia de lugar`);
      }

      // ── SONIDO DE CADA ESCENA ──────────────────────────────────────────────
      // Suena DENTRO de la escena, no en el corte: la puerta se abre medio segundo
      // después de que empieza el plano, no exactamente al entrar. Ese pequeño
      // retraso es lo que lo hace sonar parte de la escena y no un efecto pegado.
      //
      // Volumen por debajo del whoosh: compite con el diálogo nativo, y una puerta
      // que tapa una línea cuesta más de lo que aporta.
      //
      // Y EL MISMO SONIDO NO SUENA DOS VECES. La caché de efectos es por texto:
      // dos escenas que piden "door creaking" reciben el MISMO archivo, y el
      // espectador oye la misma puerta idéntica dos veces — que suena a error,
      // no a diseño. Se toca la primera vez; las repeticiones se saltan.
      const yaSono = new Set<string>();
      for (const s of params.sceneSfx ?? []) {
        const i = params.scenes.findIndex((_, k) => k === s.sceneIndex);
        if (i < 0 || !s.url) continue;
        if (yaSono.has(s.url)) { console.log(`[audio] sfx repetido en escena ${i + 1}, se omite`); continue; }
        yaSono.add(s.url);
        try {
          const f = join(dir, `sfx_${i}.mp3`);
          await download(s.url, f);
          inputs.push("-i", f);
          const ms = Math.max(0, Math.round(((boundaries[i] ?? 0) + 0.45) * 1000));
          // Más bajo (0.32 → 0.22) y con entrada/salida suaves: un efecto que
          // arranca en seco sobre el ambiente del clip se oye como un pop.
          filters.push(`[${idx}:a]afade=t=in:d=0.06,afade=t=out:st=1.1:d=0.4,adelay=${ms}|${ms},volume=0.22[sx${i}]`);
          mixLabels.push(`[sx${i}]`);
          idx++;
        } catch { /* un efecto que no baja no vale el render entero */ }
      }

      // Impact on the opening beat — the "stop scrolling" punch.
      //
      // A 0.5 era EL ELEMENTO MÁS FUERTE DE TODA LA MEZCLA, antes de la primera
      // palabra. Medido en cinco videos terminados: el primer segundo suena
      // entre 5 y 12 dB más fuerte que el cuerpo del video (terror: -9.6 dB
      // contra -21; el romance aprobado: pico a -1.4 dB, casi al clip). Un boom
      // de tráiler sobre una confesión íntima — y el usuario lo describió
      // exacto: "al inicio todos los videos salen con un sonido muy mal".
      //
      // El golpe existe para marcar el arranque, no para asustar: en géneros
      // oscuros baja a 0.22 (sigue leyéndose como golpe), en el resto a 0.10
      // (un acento, no un impacto). Y en el formato consejo/UGC no va: nadie
      // te da un consejo con un boom.
      const nicho = (params.niche ?? "").toLowerCase();
      const oscuro = /terror|horror|thriller|misterio|mystery|crimen|crime/.test(nicho);
      const sinGolpe = /consejo|publicidad|ads?\b|ugc/.test(nicho);
      if (params.sfxImpactUrl && !sinGolpe) {
        const im = join(dir, "impact.mp3");
        await download(params.sfxImpactUrl, im);
        inputs.push("-i", im);
        const vol = oscuro ? 0.22 : 0.10;
        filters.push(`[${idx}:a]adelay=150|150,volume=${vol}[imp]`);
        mixLabels.push("[imp]");
        idx++;
        console.log(`[audio] golpe de apertura a ${vol} (${oscuro ? "género oscuro" : "género suave"})`);
      } else if (params.sfxImpactUrl) {
        console.log(`[audio] sin golpe de apertura (${nicho})`);
      }

      if (mixLabels.length > 1) {
        filters.push(`${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0:normalize=0[a]`);
        const mixed = join(dir, "final.mp4");
        await exec(FFMPEG, [
          "-y", ...inputs,
          "-filter_complex", filters.join(";"),
          "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-shortest", mixed,
        ], { maxBuffer: 1 << 26 });
        finalOut = mixed;
      }
    } catch (e) {
      // Never lose the video over an audio-sweetening failure.
      console.error("[ffmpeg] sound design skipped:", e instanceof Error ? e.message.slice(0, 150) : e);
    }

    // 3.5) VOLUMEN + COLA MUDA ────────────────────────────────────────────────
    // VOLUMEN: medido sobre un video real, -28.1 dB de media cuando las
    // plataformas normalizan a ~-14/-16 LUFS. Sonaba flojo contra cualquier otro
    // video del feed. Esto sí actúa siempre.
    //
    // COLA: el mismo video terminaba con ~6s (20% del total) sin una sola línea
    // de diálogo — solo una mano en un picaporte. OJO: ese tramo NO está en
    // silencio. Medido, la cola da -29.5 dB de media contra -28.1 dB del video
    // entero, porque la música y el ambiente siguen sonando; silencedetect no
    // encuentra nada ni bajando el umbral a -30 dB.
    //
    // Así que este recorte solo actúa sobre colas realmente MUDAS (un clip sin
    // pista de audio, un fallo de la música). Para la cola sin DIÁLOGO hace falta
    // otra señal: los tiempos de palabra que ya devuelve transcribeClip — el fin
    // de la última palabra del último bloque. Eso vive en el metadata del asset y
    // todavía no llega hasta acá.
    //
    // Se conservan TAIL_KEEP segundos a propósito: el CTA de "Parte 2" está
    // quemado ahí y recortar al ras lo borraría.
    try {
      const totalDur = await probeDuration(finalOut);

      // Fin del DIALOGO, no del silencio: la ultima palabra transcrita de la
      // ultima escena que tenga texto, llevada a tiempo absoluto con boundaries.
      // Whisper ya devolvio estos tiempos al recolectar cada clip, asi que el dato
      // esta y no cuesta nada — solo no llegaba hasta aca.
      // SOLO el ULTIMO segmento decide. Recorrer hacia atras buscando "el ultimo
      // que tenga transcripcion" destruyo un video real: los segmentos finales no
      // llevaban wordTimings, el bucle retrocedio hasta el PRIMERO, y tomo sus
      // 7.4s como fin del dialogo — 36.2s quedaron en 9.4s. Un dato faltante no
      // es evidencia de silencio, y la respuesta correcta ante la duda es no
      // tocar nada: un video con cola de mas se publica, uno mutilado no.
      const ultimo = params.scenes[params.scenes.length - 1];
      const tFinal = ultimo?.wordTimings;
      let finDialogo = 0;
      if (tFinal?.length) {
        const ultima = tFinal.reduce((mx: number, w) => (Number.isFinite(w.end) && w.end > mx ? w.end : mx), 0);
        if (ultima > 0) finDialogo = (boundaries[params.scenes.length - 1] ?? 0) + ultima;
      }

      let cutAt = 0;
      if (finDialogo > 0 && totalDur > 0 && totalDur - finDialogo > TAIL_MIN) {
        cutAt = Math.min(totalDur, finDialogo + TAIL_KEEP);
      }
      // Tope de seguridad: por muy convencido que este el calculo, nunca borrar
      // mas de un tercio del video. Un recorte asi es un sintoma, no una mejora.
      if (cutAt > 0 && cutAt < totalDur * 0.66) {
        console.warn(`[cola] recorte a ${cutAt.toFixed(1)}s de ${totalDur.toFixed(1)}s descartado por excesivo — revisar wordTimings del ultimo segmento`);
        cutAt = 0;
      }

      const necesitaCorte = cutAt > 0 && totalDur - cutAt > 0.4;
      const recortado = join(dir, "tail.mp4");
      const args = ["-y", "-i", finalOut];
      if (necesitaCorte) args.push("-t", cutAt.toFixed(2));
      args.push(
        "-map", "0:v", "-map", "0:a?",
        "-c:v", "copy",
        "-af", `loudnorm=I=${LOUDNORM_LUFS}:TP=-1.5:LRA=11`,
        ...X264_THREADS, "-c:a", "aac", "-b:a", "192k", recortado,
      );
      await exec(FFMPEG, args, { maxBuffer: 1 << 26 });
      finalOut = recortado;
      console.log(
        `[cola] ${necesitaCorte
          ? `recortados ${(totalDur - cutAt).toFixed(1)}s sin diálogo (${totalDur.toFixed(1)}s → ${cutAt.toFixed(1)}s, última palabra en ${finDialogo.toFixed(1)}s)`
          : `sin cola muerta (diálogo hasta ${finDialogo.toFixed(1)}s de ${totalDur.toFixed(1)}s)`}` +
        ` · volumen normalizado a ${LOUDNORM_LUFS} LUFS`,
      );
    } catch (e) {
      // Igual que el diseño sonoro: nunca perder el video por un retoque de audio.
      console.error("[cola] omitido:", e instanceof Error ? e.message.slice(0, 150) : e);
    }

    // 3.5) Auditar ANTES de subir. El archivo está acá, en disco, y medirlo
    // cuesta ~4 segundos y cero dólares. Todo defecto que descubrimos mirando
    // videos terminados —planos eternos, congelados, volumen flojo— sale de
    // estos números, así que a partir de ahora se anuncian solos en el log.
    const audit = await auditarVideo(finalOut);

    // Salida local para PROBAR el ensamblador sin subir nada: con
    // ASSEMBLE_LOCAL_OUT=<ruta.mp4> el archivo se copia ahí y se devuelve como
    // file:// — es lo que permite medir el mezclado de audio en un experimento.
    if (process.env.ASSEMBLE_LOCAL_OUT) {
      writeFileSync(process.env.ASSEMBLE_LOCAL_OUT, readFileSync(finalOut));
      return { url: `file://${process.env.ASSEMBLE_LOCAL_OUT}`, provider: "ffmpeg", audit };
    }

    // 4) Upload to durable R2.
    const buffer = readFileSync(finalOut);
    const { url } = await uploadBuffer({ buffer, ext: "mp4", contentType: "video/mp4", folder: "finals" });
    return { url, provider: "ffmpeg", audit };
  } finally {
    if (!process.env.ASSEMBLE_KEEP_TMP) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } } else { console.log("[ffmpeg] temp conservado:", dir); }
  }
}
