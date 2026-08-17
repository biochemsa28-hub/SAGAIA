// El subtítulo muestra las palabras del GUION con los tiempos de Whisper.
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
const DIR = resolve("experimentos/salida/mezcla");
const srv = createServer((req, res) => { const p = resolve(DIR, "." + req.url); if (!existsSync(p)) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", "video/mp4"); res.end(readFileSync(p)); }).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
process.env.ASSEMBLE_LOCAL_OUT = resolve(DIR, "subs.mp4"); process.env.ASSEMBLE_KEEP_TMP = "1";
const { assembleWithFfmpeg } = await import("../services/ffmpeg/assembler.ts");
// Whisper oyó "no se supera esperando se supera aligiendote a vos" — el guion dice "eligiéndote"
const oido = "no se supera esperando se supera aligiendote a vos".split(" ");
const wt = oido.map((w, k) => ({ word: w, start: 0.3 + k * 0.35, end: 0.3 + k * 0.35 + 0.3 }));
await assembleWithFfmpeg({ scenes: [{ videoUrl: `${base}/caja.mp4`, durationSeconds: 4, narrationText: "No se supera esperando, se supera eligiéndote a vos.", wordTimings: wt }], niche: "drama", watermark: false });
srv.close();
