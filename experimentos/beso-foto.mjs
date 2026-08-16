// EL BESO EN FOTORREALISTA, hasta que los labios se toquen.
//
// En anime cierra. En foto, con las mismas formulaciones, se queda en el
// centímetro — y NO es el filtro (pasa) sino que el modelo es conservador con
// caras que parecen reales. Acá se prueban formulaciones progresivamente más
// dirigidas hasta encontrar la que cierra.
//
//   node experimentos/beso-foto.mjs --retratos   → genera dos adultos (~$0.12)
//   node experimentos/beso-foto.mjs              → prueba los besos (~$0.06 c/u)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fal } from "@fal-ai/client";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim()]));
fal.config({ credentials: env.FAL_KEY ?? env.FAL_API_KEY });
mkdirSync("experimentos/salida/besofoto", { recursive: true });
const GUARDA = "experimentos/salida/besofoto/retratos.json";

// ── Dos protagónicos ADULTOS, fotorrealistas ────────────────────────────────
async function retratos() {
  if (existsSync(GUARDA) && !process.argv.includes("--retratos")) return JSON.parse(readFileSync(GUARDA, "utf8"));
  const gente = [
    "Cinematic portrait photograph of a woman in her early thirties, dark wavy shoulder-length hair, warm brown eyes, wearing a deep green silk blouse. Neutral expression, looking at camera. Soft window light from the left, shallow depth of field, vertical 9:16, photorealistic.",
    "Cinematic portrait photograph of a man in his mid thirties, short dark hair, light stubble, wearing an unbuttoned white linen shirt. Neutral expression, looking at camera. Soft window light from the left, shallow depth of field, vertical 9:16, photorealistic.",
  ];
  const urls = [];
  for (const prompt of gente) {
    const r = await fal.subscribe("fal-ai/nano-banana", { input: { prompt, num_images: 1 }, logs: false });
    const u = (r.data ?? r).images?.[0]?.url;
    if (!u) throw new Error("no salió el retrato");
    urls.push(u);
    console.log("  retrato:", u.slice(-24));
  }
  writeFileSync(GUARDA, JSON.stringify(urls));
  return urls;
}

const IDENT = "Same two people as the reference images: identical faces, hair and clothing. " +
  "Warm lamplight, soft shadows. Vertical 9:16, cinematic film still, shallow depth of field.";

// De lo que ya sabemos que NO cierra, a lo progresivamente más dirigido.
// La hipótesis: en foto hay que quitarle al modelo la opción de dejar espacio,
// describiendo el encuadre desde el punto de contacto en vez de desde la pareja.
const INTENTOS = [
  ["4-desde-el-punto", "EXTREME CLOSE-UP framed on the point where their two mouths meet, filling the frame. Eyes closed, heads tilted opposite ways, her hand on his jaw. " + IDENT],
  ["5-perfil",     "Tight profile shot of a couple kissing, seen from the side so both mouths are visible and pressed together. Eyes closed. " + IDENT],
  ["6-mid-kiss",   "Mid-kiss: their mouths are pressed together, lips compressed against each other, no air between the faces. Heads tilted opposite ways, eyes closed, his hand cupping the back of her head. Photographed from the side at mouth height. " + IDENT],
  ["7-wedding",    "A wedding-photography style kiss: the couple kissing on the mouth, lips locked, eyes closed, heads tilted, framed tight from chest up. Romantic, tasteful, editorial. " + IDENT],
  ["8-noun",       "A passionate kiss on the lips between the two of them — lips locked together — photographed as a tight profile two-shot. Eyes closed. " + IDENT],
];

const refs = await retratos();
if (process.argv.includes("--retratos")) { console.log("retratos listos."); process.exit(0); }

for (const [etiqueta, prompt] of INTENTOS) {
  try {
    const r = await fal.subscribe("fal-ai/nano-banana/edit", {
      input: { prompt, image_urls: refs, num_images: 1, enable_safety_checker: false }, logs: false });
    const u = (r.data ?? r).images?.[0]?.url;
    if (u) {
      writeFileSync(`experimentos/salida/besofoto/${etiqueta}.jpg`, Buffer.from(await (await fetch(u)).arrayBuffer()));
      console.log(`  DIBUJADA  ${etiqueta}`);
    } else console.log(`  sin imagen ${etiqueta}`);
  } catch (e) {
    console.log(`  ${JSON.stringify(e?.body ?? "").includes("content_policy_violation") ? "RECHAZADA" : "ERROR    "} ${etiqueta}`);
  }
}
