// ¿Cuántos personajes devuelve el casting cuando la premisa nombra DOS?
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"")]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { generateCast } = await import("../lib/ai/casting.ts");
const CASOS = process.argv[2] ? [["premisa", process.argv[2]]] : [
  ["2 nombrados", "Lorenzo Elizondo, un hombre que construyó su vida solo, descubre que Simón, el chico de la calle al que echó de su taller, es su hijo"],
  ["2 descritos", "Una mujer y su jefe quedan encerrados en la oficina la noche que ella iba a renunciar"],
  ["1 solo",      "Un hombre solo en un faro escucha su propio nombre en la radio, en una transmisión de hace 40 años"],
  ["3 nombrados", "Marta invita a cenar a su ex Julián y a su nueva pareja Iván la misma noche"],
];
const res = await Promise.all(CASOS.map(([,topic]) => generateCast({ niche:"drama", topic, tone:"drama", language:"es", visual_style:"anime" })));
res.forEach((r,i) => {
  if (!r.success) return console.log(`${CASOS[i][0]}: FALLÓ ${r.error}`);
  const c = r.cast.cast;
  console.log(`${CASOS[i][0].padEnd(12)} → ${c.length} personajes: ${c.map(x => `${x.name} [${x.role}]`).join(" · ")}`);
});
