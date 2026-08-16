// El beso POR EL SERVICIO DE PRODUCCIÓN, foto y anime, con la acción tal como
// la escribe el guionista. Guarda ambos para mirarlos.
import { readFileSync, writeFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.FAL_KEY = env.FAL_KEY ?? env.FAL_API_KEY; process.env.FAL_API_KEY = process.env.FAL_KEY;
const { generarCuadroDestino } = await import("../services/video/peak-frame.ts");
const ACCION = "they are kissing, her hand on his jaw, his fingers in her hair | she pulls back an inch, eyes still closed";
const foto = JSON.parse(readFileSync("experimentos/salida/besofoto/retratos.json","utf8"));
const casos = [["foto", foto, "realistic"]];
try { const a = JSON.parse(readFileSync("experimentos/salida/beso-retratos.json","utf8")); casos.push(["anime", a, "anime"]); } catch {}
for (const [nombre, refs, estilo] of casos) {
  const url = await generarCuadroDestino({ accionFisica: ACCION, referencias: refs, escena: 5, estiloVisual: estilo, tono: "romance" });
  if (!url) { console.log(`${nombre}: SIN CUADRO`); continue; }
  writeFileSync(`experimentos/salida/besofoto/servicio-${nombre}.jpg`, Buffer.from(await (await fetch(url)).arrayBuffer()));
  console.log(`${nombre}: guardado servicio-${nombre}.jpg`);
}
