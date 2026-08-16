import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"")]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const { generateCast } = await import("../lib/ai/casting.ts");
const topic = process.argv[2] ?? "5 consejos para mantener una relación sana";
const c = await generateCast({ niche:"romance", topic, tone:"romance", language:"es", visual_style:"anime" });
console.log(`ELENCO (${c.cast.cast.length}): ${c.cast.cast.map(x=>x.name).join(", ")}`);
const elenco = "[ELENCO DISEÑADO]: " + c.cast.cast.map(x=>`${x.name} (${x.role})`).join("; ");
const r = await storyGeneratorService.generate({ niche:"romance", topic, tone:"romance", duration_target:"60s", language:"es", format:"consejo", additional_instructions: elenco });
if(!r.success){console.error(r.error);process.exit(1)}
const sc = r.data.scenes; const p = sc.findIndex(s=>s.is_peak);
console.log(`${sc.length} escenas · pico en ${p+1} (${Math.round((p+1)/sc.length*100)}%) · hablan: ${[...new Set(sc.map(s=>s.speaker))].join(", ")}`);
console.log(`primera: ${sc[0].speaker}: "${sc[0].narration_text}"`);
console.log(`última:  ${sc.at(-1).speaker}: "${sc.at(-1).narration_text}"`);
console.log(`pico:    ${sc[p]?.speaker}: "${sc[p]?.narration_text}" — ${(sc[p]?.physical_action??"").slice(0,90)}`);
