// ¿Las órdenes nuevas producen (1) personajes que se miran ENTRE SÍ sin ver al
// lente y (2) un clip cuya habla arranca temprano tras el recorte [ritmo]?
// Prueba real (~$0.35) antes de que el usuario pague un estreno a ciegas.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.FAL_KEY = env.FAL_API_KEY;
const { fal } = await import("@fal-ai/client");
fal.config({ credentials: env.FAL_API_KEY });
mkdirSync("experimentos/out/dialogo", { recursive: true });

// 1) CUADRO de diálogo con la orden DIALOGUE EYE-LINE (la misma que ahora viaja
//    en producción con 2+ en el elenco).
const escena = "Cinematic vertical 9:16 film still, warm kitchen at night, rain on the window. " +
  "Romina, a woman in her 30s wearing an apron, stands at the kitchen table gripping a crumpled bank receipt with both hands, thrusting it toward Esteban; " +
  "Esteban, a bearded man in a plaid shirt, stands across the table, arms open in explanation. Both in frame, tense argument mid-sentence. " +
  "DIALOGUE EYE-LINE: this is a conversation between characters — the subject looks AT the other person (or pointedly away from them), in three-quarter view, profile, two-shot or over-the-shoulder framing. NEVER looking into the camera lens; the camera observes, nobody addresses it.";
console.log("[1/3] generando cuadro de diálogo…");
const img = await fal.subscribe("fal-ai/nano-banana", { input: { prompt: escena, aspect_ratio: "9:16", num_images: 1 }, logs: false });
const imgUrl = img?.data?.images?.[0]?.url ?? img?.images?.[0]?.url;
if (!imgUrl) { console.error("sin imagen", JSON.stringify(img).slice(0,300)); process.exit(1); }
writeFileSync("experimentos/out/dialogo/cuadro.jpg", Buffer.from(await (await fetch(imgUrl)).arrayBuffer()));
console.log("cuadro guardado:", imgUrl.slice(0, 80));

// 2) CLIP Seedance con línea hablada AL OTRO (audio nativo).
console.log("[2/3] animando clip con línea hablada…");
const prompt = "Professional cinematic shot. Romina, furious but contained, shakes the receipt at Esteban and says to HIM in Spanish: \"Tres años pagando sola esta casa, Esteban. Tres años completos.\" She looks at Esteban the whole time, NEVER at the camera. Esteban lowers his gaze. Native audio: her voice sharp and hurt, the rain on the window, paper crumpling in her fist.";
const r = await fal.subscribe("fal-ai/bytedance/seedance/v1.5/pro/image-to-video", {
  input: { prompt, image_url: imgUrl, resolution: "720p", aspect_ratio: "9:16", duration: "5", enable_safety_checker: false, generate_audio: true },
  logs: false,
});
const url = r?.data?.video?.url ?? r?.video?.url;
if (!url) { console.error("sin clip"); process.exit(1); }
writeFileSync("experimentos/out/dialogo/clip.mp4", Buffer.from(await (await fetch(url)).arrayBuffer()));
console.log("clip guardado");

// 3) MEDIR: dónde arranca el habla, aplicar el recorte [ritmo] exacto del
//    ensamblador y volver a medir.
console.log("[3/3] midiendo habla y aplicando recorte [ritmo]…");
const f = new FormData();
f.append("file", new Blob([readFileSync("experimentos/out/dialogo/clip.mp4")]), "c.mp4");
f.append("model", "whisper-1"); f.append("response_format", "verbose_json"); f.append("language", "es");
f.append("timestamp_granularities[]", "word");
const w = await (await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + env.OPENAI_API_KEY }, body: f })).json();
if (w.error) { console.error(w.error.message); process.exit(1); }
const words = w.words ?? [];
if (!words.length) { console.log("TEXTO:", w.text, "— sin palabras medidas"); process.exit(0); }
const t0 = Math.min(...words.map(x => x.start));
const tFin = Math.max(...words.map(x => x.end));
const D = parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=nk=1:nw=1","experimentos/out/dialogo/clip.mp4"]).toString());
console.log(`TEXTO: ${w.text}`);
console.log(`ANTES: clip ${D.toFixed(1)}s · primera palabra ${t0.toFixed(2)}s · última ${tFin.toFixed(2)}s · aire=${(t0 + (D - tFin)).toFixed(1)}s`);
// El recorte del ensamblador, mismos márgenes:
const margenIni = 0.35;
const recIni = t0 > margenIni + 0.35 ? Math.min(t0 - margenIni, 4.5) : 0;
const resto = D - tFin;
const recFin = resto > 1.6 ? tFin + 0.9 : D;
if (recIni > 0.05 || recFin < D - 0.05) {
  execFileSync("ffmpeg", ["-y","-loglevel","error","-ss",recIni.toFixed(2),"-to",recFin.toFixed(2),"-i","experimentos/out/dialogo/clip.mp4","-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","experimentos/out/dialogo/clip_tight.mp4"]);
  const D2 = parseFloat(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=nk=1:nw=1","experimentos/out/dialogo/clip_tight.mp4"]).toString());
  console.log(`DESPUÉS: clip ${D2.toFixed(1)}s · la línea entra a los ${(t0 - recIni).toFixed(2)}s · recortado ${(D - D2).toFixed(1)}s de aire`);
} else {
  console.log("DESPUÉS: sin recorte necesario — el clip ya venía apretado");
}
