import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"")]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const { ACCION_CLAVE } = await import("../lib/ai/accion-clave.ts");
const r = await storyGeneratorService.generate({ niche:"romance", topic:"como superar a mi ex?", tone:"romance", duration_target: process.argv[2] ?? "30s", language:"es", format:"consejo" });
if(!r.success){console.error(r.error);process.exit(1)}
const voseo=/\b(ten[eé]s|pod[eé]s|sab[eé]s|quer[eé]s|dec[ií]s|sos|vos|mir[aá]|and[aá]|eleg[ií]te|elig[ií]endote a vos)\b/i;
for (const s of r.data.scenes) console.log(`[${s.scene_number}]${s.is_peak?" ★":""} ${s.speaker}: "${s.narration_text}"${voseo.test(s.narration_text)?"  ⚠ VOSEO":""}\n    acción: ${(s.physical_action??"-").slice(0,120)}`);
const pico = r.data.scenes.find(s=>s.is_peak);
console.log("\npico:", pico?.physical_action, "\n¿beso en el pico?", /kiss|\blips?\b|bes[oa]/i.test(pico?.physical_action??"") ? "SÍ ❌" : "no ✓", "· ¿fuerte según ACCION_CLAVE?", ACCION_CLAVE.test(pico?.physical_action??""));
