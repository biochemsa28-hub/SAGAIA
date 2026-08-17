import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
const DIR = resolve("experimentos/salida/mezcla");
const srv = createServer((req, res) => { const p = resolve(DIR, "." + req.url); if (!existsSync(p)) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", p.endsWith(".mp4") ? "video/mp4" : "audio/mpeg"); res.end(readFileSync(p)); }).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
const { assembleWithFfmpeg } = await import("../services/ffmpeg/assembler.ts");
for (const nicho of ["romance", "terror", "consejo"]) {
  process.env.ASSEMBLE_LOCAL_OUT = resolve(DIR, `inicio-${nicho}.mp4`);
  await assembleWithFfmpeg({ scenes: [{ videoUrl: `${base}/clip1.mp4`, durationSeconds: 4 }, { videoUrl: `${base}/clip2.mp4`, durationSeconds: 4 }], sfxImpactUrl: `${base}/impact.mp3`, niche: nicho, watermark: false });
  console.log("hecho", nicho);
}
srv.close();
