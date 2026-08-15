import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"")]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const r = await storyGeneratorService.generate({ niche:"drama", topic: process.argv[2] ?? "como superar a mi ex novio", tone: process.argv[3] ?? "drama", duration_target:"30s", language:"es" });
if(!r.success){console.error(r.error);process.exit(1)}
console.log("TÍTULO:", r.data.title, "\nHOOK:", r.data.hook ?? r.data.scenes[0]?.narration_text);
for (const s of r.data.scenes) console.log(`\n[${s.scene_number}]${s.is_peak?" ★PICO":""} ${s.speaker ?? ""}: "${s.narration_text}"\n    acción: ${s.physical_action ?? "-"}\n    imagen: ${(s.image_prompt??"").slice(0,140)}`);
