import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
const DIR = resolve("experimentos/salida/mezcla");
const srv = createServer((req, res) => { const p = resolve(DIR, "." + req.url); if (!existsSync(p)) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", "video/mp4"); res.end(readFileSync(p)); }).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
process.env.ASSEMBLE_LOCAL_OUT = resolve(DIR, "efectos.mp4");
const { assembleWithFfmpeg } = await import("../services/ffmpeg/assembler.ts");
const wt = (t0, words) => words.map((w, k) => ({ word: w, start: t0 + k * 0.4, end: t0 + k * 0.4 + 0.35 }));
await assembleWithFfmpeg({ scenes: [
  { videoUrl: `${base}/caja.mp4`, durationSeconds: 4, narrationText: "Otra vez llegas tarde", wordTimings: wt(0.3, ["Otra","vez","llegas","tarde"]) },
  { videoUrl: `${base}/caja.mp4`, durationSeconds: 4, narrationText: "La cachetada llega", wordTimings: wt(0.3, ["La","cachetada","llega"]), isPeak: true, emotion: "golpe" },
  { videoUrl: `${base}/caja.mp4`, durationSeconds: 4, narrationText: "No se ahorra cuando sobra se ahorra cuando duele", wordTimings: wt(0.3, "No se ahorra cuando sobra se ahorra cuando duele".split(" ")) },
], niche: "drama", watermark: false });
srv.close(); console.log("hecho");
