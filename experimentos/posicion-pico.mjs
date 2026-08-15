import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"")]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const CASOS = [
  ["drama","Una mujer descubre que su esposo tiene otra familia en la ciudad de al lado"],
  ["horror","La niñera escucha al bebé reírse con alguien en el cuarto vacío"],
  ["romance","Dos ex se quedan encerrados en el ascensor del edificio donde vivieron juntos"],
  ["mystery","Un hombre recibe cartas de su padre muerto, con fecha de esta semana"],
  ["comedy","Un hombre se caga en el pantalón en la fila del banco y todos lo ven"],
  ["thriller","Ella descubre que el taxista tiene su foto pegada en el tablero"],
];
const res = await Promise.all(CASOS.map(([tone, topic]) => storyGeneratorService.generate({ niche: tone, topic, tone, duration_target: "60s", language: "es" })));
for (let i = 0; i < CASOS.length; i++) {
  const r = res[i]; if (!r.success) { console.log(`${CASOS[i][0]}: FALLÓ ${r.error}`); continue; }
  const sc = r.data.scenes; const n = sc.length;
  const p = sc.findIndex(s => s.is_peak);
  const pct = p < 0 ? null : Math.round(((p + 1) / n) * 100);
  console.log(`${CASOS[i][0].padEnd(9)} ${n} escenas · pico en escena ${p < 0 ? "—" : p + 1} (${pct === null ? "sin marca" : pct + "%"}) ${pct !== null && pct < 65 ? "❌ TEMPRANO" : "✓"}`);
}
