import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
const { corregirOrtografia } = await import("../services/quality/ortografia.ts");
const escenas = [
  { scene_number: 1, narration_text: "Anoche fui al faño. Vi su reflejo en el espejo." },
  { scene_number: 2, narration_text: "Fiorella, no me mires así." },
  { scene_number: 3, narration_text: "Te dije que no vinieras. Ahora es tarde." },
  { scene_number: 4, narration_text: "Que hases aqui, Cadavid?" },
  { scene_number: 5, narration_text: "Me temblaba todo el cuerpo." },
];
const r = await corregirOrtografia(escenas, ["Fiorella Cadavid", "Adrián"]);
console.log(JSON.stringify(r, null, 1));
console.log(escenas.map(e => e.narration_text));
