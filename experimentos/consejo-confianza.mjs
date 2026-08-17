import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"")]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const MARCA = /\b(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|consejo|paso|regla|señal|secreto|truco|clave|h[aá]bito|error)\b/i;
const dur = process.argv[2] ?? "30s";
const r = await storyGeneratorService.generate({ niche:"romance", topic:"como tener confianza en mi misma? primera persona.", tone:"romance", duration_target:dur, language:"es", format:"consejo" });
if(!r.success){console.error(r.error);process.exit(1)}
for (const s of r.data.scenes) console.log(`[${s.scene_number}]${s.is_peak?" ★":""} ${s.speaker}: "${s.narration_text}"`);
console.log("¿tiene consejos nombrados?", r.data.scenes.some(s=>MARCA.test(s.narration_text??"")));
