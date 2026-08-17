// ¿La dirección de pronunciación funciona? Un clip real con las palabras que
// fallaron, transcrito con Whisper. Y ¿el clip trae música/efectos propios?
import { readFileSync, writeFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.FAL_API_KEY = env.FAL_API_KEY ?? env.FAL_KEY; process.env.FAL_KEY = process.env.FAL_API_KEY;
const { fal } = await import("@fal-ai/client"); fal.config({ credentials: process.env.FAL_API_KEY });
const { submitVideoJobs, checkVideoJob } = await import("../services/fal/video-generator.ts");
const { buildDialogueDirection } = await import("../services/video/native-audio.ts");
const { transcribeClip } = await import("../services/video/native-audio.ts");
const { similitudVoz } = await import("../services/quality/voz.ts");
const img = await fal.storage.upload(new File([readFileSync("experimentos/salida/retrato-solo-1.jpg")], "p.jpg", { type: "image/jpeg" }));
const texto = "Kiara, no me toques. Genaro y Fabricio ya lo sabían.";
const dir = buildDialogueDirection([{ speaker: "Thiago", text: texto, look: "the man in the black shirt", emotion: "tense" }], 6);
const [job] = await submitVideoJobs({ scenes: [{ scene_number: 1, animation_prompt: "Medium shot, he looks at the camera and speaks." + dir, image_url: img, duration_seconds: 6, generate_audio: true }] });
const rid = job?.requestId ?? job?.request_id; if (!rid) { console.error("no job", job); process.exit(1); }
let st; for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 5000)); st = await checkVideoJob(rid, job.model); if (st.status === "completed" || st.status === "failed") break; }
if (st.status !== "completed") { console.error("falló", st); process.exit(1); }
writeFileSync("experimentos/salida/analisis/diccion.mp4", Buffer.from(await (await fetch(st.url)).arrayBuffer()));
const t = await transcribeClip(st.url, "es");
console.log("guion:  ", texto); console.log("oído:   ", t?.text); console.log("similitud:", similitudVoz(texto, t?.text ?? "").toFixed(2));
