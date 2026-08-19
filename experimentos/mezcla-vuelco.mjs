import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
const DIR = resolve("experimentos/salida/mezcla");
const srv = createServer((req, res) => { const p = resolve(DIR, "." + req.url); if (!existsSync(p)) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", p.endsWith(".mp4") ? "video/mp4" : "audio/mpeg"); res.end(readFileSync(p)); }).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
process.env.ASSEMBLE_LOCAL_OUT = resolve(DIR, "vuelco.mp4");
const { assembleWithFfmpeg } = await import("../services/ffmpeg/assembler.ts");
await assembleWithFfmpeg({ scenes: [
  { videoUrl: `${base}/mudo.mp4`, durationSeconds: 4 },
  { videoUrl: `${base}/mudo.mp4`, durationSeconds: 4, isPeak: true },
  { videoUrl: `${base}/mudo.mp4`, durationSeconds: 4 },
], musicUrl: `${base}/musA.mp3`, musicTurnUrl: `${base}/musB.mp3`, sfxImpactUrl: `${base}/impact.mp3`, niche: "terror", watermark: false });
srv.close(); console.log("hecho");
