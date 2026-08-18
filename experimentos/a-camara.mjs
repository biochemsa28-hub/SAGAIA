// Un clip real a cámara con la dirección nueva: ¿mira al lente, respira, se mueve como persona?
import { readFileSync, writeFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.FAL_API_KEY = env.FAL_API_KEY ?? env.FAL_KEY; process.env.FAL_KEY = process.env.FAL_API_KEY;
const { fal } = await import("@fal-ai/client"); fal.config({ credentials: process.env.FAL_API_KEY });
const { submitVideoJobs, checkVideoJob } = await import("../services/fal/video-generator.ts");
const { buildDialogueDirection } = await import("../services/video/native-audio.ts");
const img = await fal.storage.upload(new File([readFileSync("experimentos/salida/retrato-solo-1.jpg")], "p.jpg", { type: "image/jpeg" }));
const dir = buildDialogueDirection([{ speaker: "Thiago", text: "Lo primero que hice fue bloquearla. Me temblaba la mano. Y esa noche dormí.", look: "the man in the black shirt", emotion: "confesión, vulnerable" }], 6, { aCamara: true });
const [job] = await submitVideoJobs({ scenes: [{ scene_number: 1, animation_prompt: "Medium close-up, he is talking to the viewer." + dir, image_url: img, duration_seconds: 6, generate_audio: true }] });
const rid = job?.requestId ?? job?.request_id; let st;
for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 5000)); st = await checkVideoJob(rid, job.model); if (st.status === "completed" || st.status === "failed") break; }
if (st.status !== "completed") { console.error("falló", st); process.exit(1); }
writeFileSync("experimentos/salida/analisis/acamara.mp4", Buffer.from(await (await fetch(st.url)).arrayBuffer())); console.log("ok");
