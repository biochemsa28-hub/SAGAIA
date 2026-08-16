// ¿El retrato trae UNA sola persona aunque la descripción hable de otros?
import { readFileSync, writeFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.FAL_API_KEY = env.FAL_API_KEY ?? env.FAL_KEY;
const { generateCharacterOptions } = await import("../services/fal/image-generator.ts");
const r = await generateCharacterOptions({
  description: "Thiago, 29, the kind of man who convinces every woman she is the only one. Sharp jaw, black hair swept back, black shirt open at the collar with a lipstick smudge on the inside; his wife Ariadna beside him never suspects. Confident half-smile.",
  niche: "drama", visualStyle: "anime", count: 2,
});
console.log(r.success ? `${r.urls.length} retratos` : "FALLÓ " + r.error);
for (let i = 0; i < r.urls.length; i++) writeFileSync(`experimentos/salida/retrato-solo-${i+1}.jpg`, Buffer.from(await (await fetch(r.urls[i])).arrayBuffer()));
