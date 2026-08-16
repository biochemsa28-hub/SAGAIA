// ¿Los guiones de todos los nichos salen con las señas del video aprobado?
// líneas cortas · gancho como situación · pico tarde · (listas) ítems según duración
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"")]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const CASOS = [
  ["horror",  "60s", "La niñera escucha al bebé reírse con alguien en el cuarto vacío"],
  ["comedy",  "60s", "Un yerno cae de cara en el pastel de tres pisos en la comida con la suegra"],
  ["drama",   "60s", "Una mesera atiende a un hombre que la trata como basura; de propina le deja su reloj: tiene grabado el nombre de su madre"],
  ["romance", "30s", "5 secretos para que tu esposo se despierte feliz"],
];
const res = await Promise.all(CASOS.map(([tone,dur,topic]) => storyGeneratorService.generate({ niche: tone, topic, tone, duration_target: dur, language:"es" })));
res.forEach((r,i) => {
  const [tone,dur,topic] = CASOS[i];
  if (!r.success) return console.log(`${tone}: FALLÓ ${r.error}`);
  const sc = r.data.scenes; const words = sc.map(s => (s.narration_text??"").trim().split(/\s+/).length);
  const largas = words.filter(w => w > 9).length; const prom = (words.reduce((a,b)=>a+b,0)/words.length).toFixed(1);
  const p = sc.findIndex(s=>s.is_peak); const pct = p<0?"—":Math.round((p+1)/sc.length*100)+"%";
  const items = (sc.map(s=>s.narration_text).join(" ").match(/\b(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa])\b/gi)??[]).map(x=>x.toLowerCase());
  console.log(`\n${tone.padEnd(8)} ${dur} · ${sc.length} esc · palabras/línea ${prom} · >9 palabras: ${largas} · pico ${pct}${items.length?` · ítems: ${[...new Set(items)].join(",")}`:""}`);
  console.log(`  gancho: "${sc[0].narration_text}"`);
  console.log(`  cierre: "${sc.at(-1).narration_text}"`);
});
