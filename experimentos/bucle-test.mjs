import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const r = await storyGeneratorService.generate({ niche: "romance", topic: 'En mi propia boda, mi papá me susurra al oído: "sonríe para las fotos… el novio es tu hermano"', tone: "drama", duration_target: "60s", language: "es", visual_style: "realistic", format: "story" });
if (!r.success) { console.error("FALLO", r.error); process.exit(1); }
const sc = r.data.scenes;
console.log("escenas:", sc.length);
const primeras = sc.slice(0, Math.ceil(sc.length/3));
console.log("\n— PRIMER TERCIO (buscar pista sembrada en image_prompt):");
primeras.forEach(s => console.log(`#${s.scene_number}: ${(s.image_prompt??"").slice(0,150)}`));
console.log("\n— ÚLTIMAS 3 ESCENAS:");
sc.slice(-3).forEach(s => console.log(`#${s.scene_number}${s.is_peak?" ★":""} [${s.speaker}] «${s.narration_text}»\n   img: ${(s.image_prompt??"").slice(0,170)}`));
