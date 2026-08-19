import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
const DIR = resolve("experimentos/salida/mezcla");
const srv = createServer((req, res) => { const p = resolve(DIR, "." + req.url); if (!existsSync(p)) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", p.endsWith(".mp4") ? "video/mp4" : "audio/mpeg"); res.end(readFileSync(p)); }).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
process.env.ASSEMBLE_LOCAL_OUT = resolve(DIR, "editor.mp4");
const { assembleWithFfmpeg } = await import("../services/ffmpeg/assembler.ts");
const wt = (t0, words) => words.map((w, k) => ({ word: w, start: t0 + k * 0.4, end: t0 + k * 0.4 + 0.35 }));
// caja.mp4 (cuadro blanco) x2 = mismo plano → fundido; clip1.mp4 (gris liso) = plano distinto → corte seco
await assembleWithFfmpeg({ scenes: [
  { videoUrl: `${base}/caja.mp4`, durationSeconds: 4, narrationText: "Otra vez tarde", wordTimings: wt(0.3, ["Otra","vez","tarde"]) },
  { videoUrl: `${base}/caja.mp4`, durationSeconds: 4, narrationText: "Y sin avisar", wordTimings: wt(0.3, ["Y","sin","avisar"]) },
  { videoUrl: `${base}/clip1.mp4`, durationSeconds: 4, narrationText: "No me mires así", wordTimings: wt(0.3, ["No","me","mires","así"]) },
], niche: "drama", watermark: false });
srv.close(); console.log("hecho");
