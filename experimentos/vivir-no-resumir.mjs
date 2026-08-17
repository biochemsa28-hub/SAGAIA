import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"")]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const r = await storyGeneratorService.generate({ niche:"historia", topic:"Una sobreviviente de un campo de concentración llega a México en 1946 sin idioma, sin dinero y sin nadie; una mujer mayor que también perdió a los suyos la recibe en su casa. Primera persona.", tone:"inspirational", duration_target:"60s", language:"es", visual_style:"realistic" });
if(!r.success){console.error(r.error);process.exit(1)}
for (const s of r.data.scenes) console.log(`[${s.scene_number}]${s.is_peak?" ★":""} ${s.speaker}: "${s.narration_text}"`);
