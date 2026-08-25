// ─── Auditoría del video terminado ───────────────────────────────────────────
// Todos los defectos que encontramos en esta app se encontraron igual: bajando
// el mp4 y midiéndolo con ffmpeg. Congelados, planos eternos, volumen flojo,
// silencios — ninguno necesitó criterio artístico para detectarse, solo un
// número.
//
// El problema nunca fue que los defectos fueran sutiles. Fue el ciclo: se
// renderiza, se sube, alguien lo mira días después, sospecha algo, y recién ahí
// se mide. Esto cierra ese ciclo antes de subir el archivo.
//
// Medido: 3,7 segundos para auditar un video de 33s, porque el análisis corre
// sobre una copia de 160px de ancho. A esa escala los números siguen siendo los
// mismos que a resolución completa (34% de cuadros casi quietos contra 32%, los
// mismos cortes), así que no se pierde nada por ir rápido.
//
// NO BLOQUEA NADA. El video ya está pago y hecho: retenerlo no lo mejora. La
// auditoría escribe en el log lo que midió, y los defectos se anuncian solos en
// vez de esperar a que alguien los sienta.

import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

// ── Umbrales, cada uno con la medición que lo justifica ──────────────────────

// Un cuadro se considera QUIETO por debajo de 0.6 de diferencia media contra el
// anterior. No es arbitrario: un Ken Burns sobre una foto fija —o sea, el piso
// absoluto de lo que llamamos "movimiento"— mide entre 0,7 y 4,1. Por debajo de
// 0,6 el video se mueve MENOS que una foto quieta.
const QUIETO = 0.6;
// Un salto de más de 25 es un cambio de plano. Medido: los cortes reales dieron
// entre 42 y 90; el movimiento más vivo dentro de un plano no pasó de 24.
const CORTE = 25;
// Dos cuadros de corte separados por menos de medio segundo son el mismo corte
// (una transición dura varios cuadros).
const CORTE_MIN_SEP = 0.5;

// El drama vertical corta cada 1,5-3s, así que un plano de más de 6 es largo.
// Pero LARGO NO ES EL DEFECTO. Medido contra el clip del beso —el que funcionó—:
// dura 8 segundos enteros y está bien. Lo que lo salva es que se mueve sin parar.
const PLANO_LARGO = Math.max(3, Number(process.env.AUDIT_PLANO_LARGO ?? 6) || 6);

// El defecto real es el TARTAMUDEO: un plano que arranca, se frena, arranca.
// El movimiento MEDIO no lo detecta —el beso mide 2,61 y los planos malos entre
// 2,10 y 5,38, o sea que el bueno queda en el medio—. Lo que los separa es qué
// porcentaje de sus cuadros está quieto:
//   beso (funcionó)          1%
//   planos que se perdonan   19-24%
//   planos que se sienten    36-55%
// Por eso el umbral está en 30: entre lo que se tolera y lo que se nota.
const TARTAMUDEO_PCT = 30;
// Un tercio del video sin movimiento es lo que medimos en el video que "tenía
// algo raro". Se avisa a partir de un cuarto.
const QUIETO_PCT_MAX = 25;
// Un congelado de más de un segundo se ve. Medio segundo, no.
const CONGELADO_MIN = 1.0;
// Las plataformas normalizan alrededor de -14/-16 LUFS. Un video que sale a -28
// suena flojo contra todo lo demás del feed.
const VOLUMEN_MIN_DB = -26;

export type AuditoriaVideo = {
  segundos: number;
  planos: number;
  planoMasLargo: number;
  planosLargos: number;
  quietoPct: number;
  congelados: Array<{ desde: number; dura: number }>;
  volumenMedioDb: number | null;
  silencios: Array<{ desde: number; dura: number }>;
  avisos: string[];
  // Lo que antes se medía a mano con Whisper sobre el mp4 final: cuándo entra
  // la primera palabra, cuánto aire muerto hay entre réplicas y la densidad.
  // Sale gratis de los wordTimings que ya viajan con cada escena.
  dialogo?: { primeraPalabra: number; palabras: number; palPorSeg: number; aireInternoSeg: number; huecos: number };
};

// La serie de movimiento: para cada cuadro, cuánto cambió respecto del anterior.
async function serieDeMovimiento(path: string): Promise<{ valores: number[]; fps: number }> {
  // metadata=print:file=- escribe en STDOUT; la cabecera con los fps, en stderr.
  // Leer solo uno de los dos devuelve una serie vacía y una auditoría muda —
  // que es exactamente lo que hizo la primera versión de esta función.
  const { stdout, stderr } = await exec(
    FFMPEG,
    ["-hide_banner", "-i", path, "-an", "-vf",
     "scale=160:-2,tblend=all_mode=difference,signalstats,metadata=print:file=-",
     "-f", "null", "-"],
    { maxBuffer: 1 << 26 },
  ).catch((e: { stdout?: string; stderr?: string }) => ({ stdout: e.stdout ?? "", stderr: e.stderr ?? "" }));

  const valores: number[] = [];
  for (const linea of `${stdout ?? ""}\n${stderr ?? ""}`.split("\n")) {
    const m = linea.match(/YAVG=([\d.]+)/);
    if (m) valores.push(Number(m[1]));
  }
  const fps = Number((stderr ?? "").match(/,\s*([\d.]+)\s*fps,/)?.[1] ?? 30) || 30;
  return { valores, fps };
}

async function audio(path: string): Promise<{ medioDb: number | null; silencios: Array<{ desde: number; dura: number }> }> {
  const { stderr } = await exec(
    FFMPEG,
    ["-hide_banner", "-i", path, "-vn", "-af", "volumedetect,silencedetect=n=-45dB:d=1.2", "-f", "null", "-"],
    { maxBuffer: 1 << 24 },
  ).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));

  const medio = (stderr ?? "").match(/mean_volume:\s*(-?[\d.]+) dB/);
  const silencios: Array<{ desde: number; dura: number }> = [];
  for (const m of (stderr ?? "").matchAll(/silence_end:\s*([\d.]+)[^\n]*silence_duration:\s*([\d.]+)/g)) {
    const dura = Number(m[2]);
    silencios.push({ desde: Number(m[1]) - dura, dura });
  }
  return { medioDb: medio ? Number(medio[1]) : null, silencios };
}

// ── ¿SIRVIÓ LO QUE SE PAGÓ CARO? ─────────────────────────────────────────────
// Un clip de referencias cuesta ~6x por segundo. Medido en un video real: el
// bloque premium volvió con el 51% de sus cuadros quietos — el plano MÁS
// congelado de todo el video era justamente el único caro. Nadie se enteró hasta
// que alguien miró el resultado terminado, días después.
//
// Medir un clip suelto cuesta ~1 segundo. Si volvió congelado, se dice en el
// mismo momento en que se pagó, no en la próxima revisión.
export async function medirQuietud(path: string): Promise<{ quietoPct: number; segundos: number } | null> {
  try {
    const { valores, fps } = await serieDeMovimiento(path);
    if (!valores.length) return null;
    const quietos = valores.filter((v) => v < QUIETO).length;
    return { quietoPct: Math.round((quietos * 100) / valores.length), segundos: valores.length / fps };
  } catch {
    return null;
  }
}

/** Un clip caro que vuelve por encima de este porcentaje de cuadros quietos no
 *  hizo nada que el endpoint barato no hubiera hecho por la sexta parte. */
export const PREMIUM_QUIETO_MAX = TARTAMUDEO_PCT;

export async function auditarVideo(path: string, contexto?: { escena?: string }): Promise<AuditoriaVideo | null> {
  try {
    const [{ valores, fps }, snd] = await Promise.all([serieDeMovimiento(path), audio(path)]);
    if (!valores.length) return null;
    const t = (i: number) => i / fps;
    const segundos = valores.length / fps;

    // ── Planos ───────────────────────────────────────────────────────────────
    const cortes: number[] = [];
    for (let i = 0; i < valores.length; i++) {
      if (valores[i]! > CORTE && (cortes.length === 0 || t(i) - cortes[cortes.length - 1]! > CORTE_MIN_SEP)) {
        cortes.push(t(i));
      }
    }
    const limites = [0, ...cortes, segundos];
    const planosDetalle = limites.slice(1)
      .map((fin, k) => {
        const desde = limites[k]!;
        // Se saltan dos cuadros después del corte: el salto de plano mismo es un
        // valor altísimo que ensucia la media del plano que empieza.
        const tramo = valores.slice(Math.round(desde * fps) + 2, Math.round(fin * fps));
        const quietosTramo = tramo.filter((v) => v < QUIETO).length;
        return {
          desde, dura: fin - desde,
          quietoPct: tramo.length ? Math.round((quietosTramo * 100) / tramo.length) : 0,
        };
      })
      .filter((p) => p.dura > 0.3);
    const duraciones = planosDetalle.map((p) => p.dura);
    const planoMasLargo = duraciones.length ? Math.max(...duraciones) : segundos;
    const tartamudos = planosDetalle.filter((p) => p.quietoPct > TARTAMUDEO_PCT);
    const planosLargos = planosDetalle.filter((p) => p.dura > PLANO_LARGO && p.quietoPct > TARTAMUDEO_PCT).length;

    // ── Movimiento y congelados ──────────────────────────────────────────────
    const quietos = valores.filter((v) => v < QUIETO).length;
    const quietoPct = Math.round((quietos * 100) / valores.length);
    const congelados: Array<{ desde: number; dura: number }> = [];
    let ini = -1;
    for (let i = 0; i <= valores.length; i++) {
      const casiCero = i < valores.length && valores[i]! < 0.08;
      if (casiCero && ini < 0) ini = i;
      if (!casiCero && ini >= 0) {
        if (t(i) - t(ini) >= CONGELADO_MIN) congelados.push({ desde: t(ini), dura: t(i) - t(ini) });
        ini = -1;
      }
    }

    // ── Avisos: solo lo que un espectador notaría ────────────────────────────
    const avisos: string[] = [];
    for (const p of tartamudos) {
      avisos.push(
        `plano de ${p.dura.toFixed(1)}s en ${p.desde.toFixed(1)}s con ${p.quietoPct}% de cuadros quietos` +
        (p.dura > PLANO_LARGO ? " — largo Y frenado, la peor combinación" : " — arranca y se frena"),
      );
    }
    if (quietoPct > QUIETO_PCT_MAX) {
      avisos.push(`${quietoPct}% del video se mueve menos que una foto fija con Ken Burns`);
    }
    for (const c of congelados) {
      avisos.push(`cuadro congelado ${c.dura.toFixed(1)}s desde ${c.desde.toFixed(1)}s`);
    }
    if (snd.medioDb !== null && snd.medioDb < VOLUMEN_MIN_DB) {
      avisos.push(`volumen medio ${snd.medioDb} dB — suena flojo contra el resto del feed`);
    }
    for (const s of snd.silencios.filter((x) => x.dura >= 1.5)) {
      avisos.push(`${s.dura.toFixed(1)}s de silencio desde ${s.desde.toFixed(1)}s`);
    }

    const informe: AuditoriaVideo = {
      segundos: Number(segundos.toFixed(2)), planos: duraciones.length, planoMasLargo: Number(planoMasLargo.toFixed(1)),
      planosLargos, quietoPct, congelados, volumenMedioDb: snd.medioDb, silencios: snd.silencios, avisos,
    };

    const etiqueta = contexto?.escena ? `[audit ${contexto.escena}]` : "[audit]";
    console.log(
      `${etiqueta} ${informe.segundos}s · ${informe.planos} plano(s) · más largo ${informe.planoMasLargo}s · ` +
      `${informe.quietoPct}% quieto · volumen ${informe.volumenMedioDb ?? "?"} dB`,
    );
    for (const a of avisos) console.warn(`${etiqueta} ⚠ ${a}`);
    if (!avisos.length) console.log(`${etiqueta} sin defectos medibles`);
    return informe;
  } catch (e) {
    // La auditoría JAMÁS puede costar un video. Mide o se calla.
    console.error("[audit] omitida:", e instanceof Error ? e.message.slice(0, 150) : e);
    return null;
  }
}
