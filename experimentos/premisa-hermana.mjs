import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const r = await storyGeneratorService.generate({ niche: "drama", topic: "mujer ve a su esposo besándose con su hermana", tone: "drama", duration_target: "60s", language: "es", visual_style: "realistic", format: "story" });
if (!r.success) { console.error("FALLO", r.error); process.exit(1); }
const d = r.data;
console.log("GANCHO:", d.hook, "\nMUSICA:", d.music_mood, "\nCTA:", d.cta);
for (const s of d.scenes) console.log(`\n#${s.scene_number}${s.is_peak?" ★PICO":""} [${s.speaker}] @${s.location} | amb: ${s.ambience ?? "-"}\n  «${s.narration_text}»\n  acción: ${s.physical_action ?? "-"}\n  env: ${s.environment ?? "-"} | sfx: ${s.sfx_prompt ?? "-"} | cam: ${s.camera_move ?? "-"}\n  img: ${(s.image_prompt??"").slice(0,220)}…`);
