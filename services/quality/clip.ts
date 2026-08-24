// El JUEZ DE CLIP: mira el video ANIMADO, no el cuadro de partida.
//
// El juez de cuadro (cuadro.ts) revisa la imagen fija antes de animarla — pero
// Seedance puede romper un cuadro perfecto AL animarlo. Medido en un video
// terminado (la confesión de los insectos, realista): a mitad del clip el
// mentón salió con una textura arrugada deforme y los dedos quedaron
// pellizcando NADA — el insecto desapareció entre las manos entre un cuadro y
// el siguiente. La imagen de partida estaba bien; el clip no. Ningún juez lo
// miraba.
//
// Tres cuadros del clip (arranque, mitad, final) en UNA llamada de visión
// (~$0.01). Si el clip está roto, el worker lo vuelve a pedir UNA vez — el
// mismo circuito que ya usa la voz apartada del guion ([voz] en /api/videos).
//
// Apagable con CLIP_GATE=off. Se mide en logs como [clip].
import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const CLIP = (process.env.CLIP_GATE ?? "on").toLowerCase();

export interface VeredictoClip {
  ok: boolean;
  defecto?: "anatomia" | "objeto_fantasma" | "morph" | "figura_extra" | "otro";
  motivo?: string;
}

export async function revisarClip(url: string, escena: string): Promise<VeredictoClip> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (CLIP === "off" || !apiKey) return { ok: true };

  // Tres cuadros repartidos: 0s, 2s y 4s cubren un clip de 5-6s donde vive el
  // defecto medido (la deformación apareció a mitad del clip). A 360px los
  // defectos que importan se ven igual que a resolución completa.
  const stamp = Math.random().toString(36).slice(2, 8);
  const outs = [0, 2, 4].map((t, i) => ({ t, path: join(tmpdir(), `clip_${stamp}_${i}.jpg`) }));
  try {
    await Promise.all(outs.map((o) =>
      exec(FFMPEG, ["-y", "-loglevel", "error", "-ss", String(o.t), "-i", url, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", o.path]),
    ));
    const imagenes = outs
      .map((o) => { try { return readFileSync(o.path).toString("base64"); } catch { return null; } })
      .filter((b): b is string => Boolean(b));
    if (!imagenes.length) return { ok: true };

    const pedido =
      "Estos son 3 cuadros (arranque, mitad, final) de UN clip de video generado por IA para esta escena:\n" +
      `«${escena.slice(0, 400)}»\n\n` +
      "Decime SOLO si la ANIMACIÓN rompió el clip de alguna de estas formas:\n" +
      "- anatomia: una cara, mentón o boca se derrite o sale con textura arrugada deforme; dedos de más o de menos; miembros imposibles; un cuerpo que se dobla mal.\n" +
      "- objeto_fantasma: las manos sostienen, pellizcan o llevan a la boca NADA — el objeto que la escena describe desapareció entre un cuadro y otro, o flota sin que nadie lo toque.\n" +
      "- morph: la persona se convierte en OTRA entre los cuadros (cara distinta, pelo distinto) sin que la escena lo pida.\n" +
      "- figura_extra: aparece una persona o silueta que la escena no describe.\n" +
      "El estilo oscuro, el desenfoque de movimiento normal y la emoción intensa NO son defectos. " +
      "Criterio: ante la duda, APROBÁ — un falso defecto cuesta un clip pago entero.\n" +
      'Respondé SOLO este JSON: {"ok": true|false, "defecto": "anatomia|objeto_fantasma|morph|figura_extra|otro", "motivo": "una frase"}';

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 200,
        system: "Respondé SOLO con JSON válido, sin markdown.",
        messages: [{
          role: "user",
          content: [
            ...imagenes.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
            { type: "text", text: pedido },
          ],
        }],
      }),
    });
    if (!res.ok) { console.warn("[clip] no se pudo revisar:", res.status); return { ok: true }; }
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "{}";
    const m = /\{[\s\S]*\}/.exec(raw);
    const v = JSON.parse(m ? m[0] : "{}") as Partial<VeredictoClip>;
    return v.ok === false
      ? { ok: false, defecto: v.defecto ?? "otro", motivo: String(v.motivo ?? "").slice(0, 200) }
      : { ok: true };
  } catch (e) {
    // El juez JAMÁS puede costar un video. Mira o se calla.
    console.warn("[clip] error:", e instanceof Error ? e.message.slice(0, 120) : e);
    return { ok: true };
  } finally {
    for (const o of outs) { try { unlinkSync(o.path); } catch { /* ignore */ } }
  }
}
