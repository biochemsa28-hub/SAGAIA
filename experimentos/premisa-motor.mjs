import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
const { evaluarPremisa } = await import("../services/quality/premisa.ts");
for (const [topic, format] of [["mi esposo me engaña", "story"], ["En mi propia boda, mi papá me susurra al oído: \"sonríe para las fotos… el novio es tu hermano\"", "story"]]) {
  const v = await evaluarPremisa({ topic, format, niche: "drama", tone: "drama" });
  console.log(`\n«${topic.slice(0,60)}» → ${v.total}/10 · ${v.veredicto}`);
  for (const e of v.ejes) console.log(`  ${e.eje.padEnd(15)} ${e.puntaje}  ${e.nota.slice(0,80)}`);
  v.mejoras.forEach((m,i)=>console.log(`  MEJORA ${i+1}: ${m}`));
}
