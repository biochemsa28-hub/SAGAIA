import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const { buildDialogueDirection } = await import("../services/video/native-audio.ts");
const premisa = process.argv[2] === "baile"
  ? { niche: "chisme", topic: "tres mujeres bailando reggaeton en una azotea al atardecer, estilo TikTok", tone: "comedy", visual_style: "realistic" }
  : { niche: "terror", topic: "un muñeco antiguo actuando solo frente a la cámara de noche, se mueve cuando nadie lo ve", tone: "horror", visual_style: "realistic" };
const r = await storyGeneratorService.generate({ ...premisa, duration_target: "30s", language: "es", format: "escena" });
if (!r.success) { console.error("FALLO", r.error); process.exit(1); }
let habladas = 0, total = 0;
for (const s of r.data.scenes) {
  total++;
  const linea = (s.narration_text ?? "").trim();
  if (linea) habladas++;
  console.log(`#${s.scene_number}${s.is_peak?" ★":""} ${s.duration_seconds}s ${linea?`«${linea}»`:"(mudo)"} | acción: ${(s.physical_action??"").slice(0,90)} | amb: ${s.ambience ?? "-"} | cam: ${(s.camera_move??"").slice(0,50)}`);
}
console.log(`\n${total} escenas, ${habladas} con línea hablada · música: ${r.data.music_mood ?? "-"}`);
console.log("\nDIRECCIÓN SIN DIÁLOGO:", buildDialogueDirection([{ speaker: "x", text: "" }], 5).slice(0, 140), "…");
