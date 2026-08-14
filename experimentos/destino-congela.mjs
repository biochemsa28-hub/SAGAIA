// ¿EL CUADRO DESTINO CONGELA EL CLIP?
//
// El video con tres cuadros destino midió 37% de cuadros quietos; el anterior,
// sin ninguno, midió 20%. Y los tres avisos decían "arranca y se frena", que es
// exactamente lo que pasaría si el clip corre hacia el fotograma final, LLEGA
// ANTES DE TIEMPO y se queda ahí el resto.
//
// Si es cierto, el cuadro destino arregla la acción y rompe el movimiento — y
// eso hay que saberlo antes de proponer nada.
//
// La prueba: el MISMO cuadro inicial y el MISMO prompt, con y sin destino.
// Lo único que cambia es end_image_url.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fal } from "@fal-ai/client";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim()]));
fal.config({ credentials: env.FAL_KEY ?? env.FAL_API_KEY });
process.env.FAL_KEY = env.FAL_KEY ?? env.FAL_API_KEY;

const { generarCuadroDestino } = await import("../services/video/peak-frame.ts");
const { medirQuietud } = await import("../services/quality/auditor.ts");
mkdirSync("experimentos/salida/congela", { recursive: true });

const retratos = JSON.parse(readFileSync("experimentos/salida/besofoto/retratos.json", "utf8"));

// ── El cuadro INICIAL: los dos discutiendo, sin contacto ────────────────────
console.log("1) cuadro inicial...");
const r1 = await fal.subscribe("fal-ai/nano-banana/edit", { input: {
  prompt: "The two of them standing a step apart in a living room at night, arguing, her hand half raised. " +
          "Hard side light, cold background. Same two people as the reference images: identical faces, hair and clothing. " +
          "Vertical 9:16, cinematic film still, shallow depth of field.",
  image_urls: retratos, num_images: 1, enable_safety_checker: false }, logs: false });
const inicio = (r1.data ?? r1).images?.[0]?.url;
if (!inicio) throw new Error("sin cuadro inicial");
console.log("   ok");

// ── El cuadro DESTINO, por el servicio real ─────────────────────────────────
console.log("2) cuadro destino...");
const destino = await generarCuadroDestino({
  accionFisica: "her hand goes to the back of his neck, their lips meet and hold | they part an inch",
  referencias: [...retratos, inicio], escena: 1, estiloVisual: "cinematic", tono: "romance",
});
if (!destino) throw new Error("sin cuadro destino");
console.log("   ok");

// ── Los dos clips: idénticos salvo end_image_url ────────────────────────────
const PROMPT =
  "ONE CONTINUOUS SHOT. She closes the distance and they kiss. " +
  "Slow push in that arrives and settles; the shot never freezes: breath, hair and light keep moving throughout.";

async function clip(nombre, conDestino) {
  const r = await fal.subscribe("fal-ai/bytedance/seedance/v1.5/pro/image-to-video", { input: {
    prompt: PROMPT, image_url: inicio, resolution: "720p", aspect_ratio: "9:16",
    duration: "5", generate_audio: false, enable_safety_checker: false,
    ...(conDestino ? { end_image_url: destino } : {}),
  }, logs: false });
  const url = (r.data ?? r).video?.url;
  if (!url) throw new Error("sin clip " + nombre);
  const ruta = `experimentos/salida/congela/${nombre}.mp4`;
  writeFileSync(ruta, Buffer.from(await (await fetch(url)).arrayBuffer()));
  const m = await medirQuietud(ruta);
  console.log(`   ${nombre.padEnd(12)} ${m ? `${m.quietoPct}% quieto en ${m.segundos.toFixed(1)}s` : "no se pudo medir"}`);
  return m?.quietoPct ?? null;
}

console.log("\n3) los dos clips (~$0.52)...");
const sin = await clip("sin-destino", false);
const con = await clip("con-destino", true);

console.log("\n━━━ VEREDICTO");
if (sin !== null && con !== null) {
  const dif = con - sin;
  console.log(`   sin destino: ${sin}%   ·   con destino: ${con}%   ·   diferencia: ${dif > 0 ? "+" : ""}${dif} puntos`);
  console.log(dif >= 10
    ? "   → EL DESTINO CONGELA. La hipótesis se confirma."
    : dif <= -10
      ? "   → el destino MEJORA el movimiento. La hipótesis era falsa."
      : "   → sin diferencia clara. El 37% viene de otra cosa.");
}
