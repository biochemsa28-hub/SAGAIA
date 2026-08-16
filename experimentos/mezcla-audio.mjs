// Prueba del mezclador de audio: whoosh SOLO en el salto de lugar, sfx sin repetir.
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.FAL_API_KEY = env.FAL_API_KEY ?? env.FAL_KEY;
const DIR = resolve("experimentos/salida/mezcla");
process.env.ASSEMBLE_LOCAL_OUT = resolve(DIR, "salida.mp4");
const srv = createServer((req, res) => { const p = resolve(DIR, "." + req.url); if (!existsSync(p)) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", p.endsWith(".mp4") ? "video/mp4" : "audio/mpeg"); res.end(readFileSync(p)); }).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
const { assembleWithFfmpeg } = await import("../services/ffmpeg/assembler.ts");
const r = await assembleWithFfmpeg({
  scenes: [
    { videoUrl: `${base}/clip1.mp4`, durationSeconds: 4, narrationText: "uno" },
    { videoUrl: `${base}/clip2.mp4`, durationSeconds: 4, narrationText: "dos", newLocation: false },
    { videoUrl: `${base}/clip3.mp4`, durationSeconds: 4, narrationText: "tres", newLocation: true },
  ],
  sfxWhooshUrl: `${base}/whoosh.mp3`,
  sceneSfx: [{ sceneIndex: 0, url: `${base}/sfx.mp3` }, { sceneIndex: 1, url: `${base}/sfx.mp3` }],
  watermark: false,
});
console.log("salida:", r.url);
srv.close();
