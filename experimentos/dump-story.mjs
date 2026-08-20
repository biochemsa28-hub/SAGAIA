import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const r = await storyGeneratorService.generate({ niche: "misterio", topic: "Una mujer compra una maleta perdida en una subasta; dentro hay $40,000 y fotos; al publicar una foto recibe decenas de mensajes: 'no busques a ese hombre'", tone: "mystery", duration_target: "60s", language: "es", visual_style: "realistic", format: "story" });
if (!r.success) { console.error("FALLO", r.error); process.exit(1); }
console.log("keys data:", Object.keys(r.data));
console.log("production_notes:", JSON.stringify(r.data.production_notes));
console.log("story.cta:", r.data.story?.cta);
console.log("ultima escena img:", (r.data.scenes.at(-1)?.image_prompt ?? "").slice(0,180));
