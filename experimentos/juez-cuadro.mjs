import { readFileSync } from "node:fs";
import http from "node:http";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
const { revisarCuadro } = await import("../services/quality/cuadro.ts");
// servidor local para servir las imágenes por URL
const srv = http.createServer((q,r)=>{ try { r.end(readFileSync("experimentos/out/set/"+q.url.slice(1))); } catch { r.statusCode=404; r.end(); } }).listen(8765);
const escena = "Marisol Ibarra sits at a small kitchen table holding a folded letter, a chipped yellow mug and a bowl of oranges beside her, a window with a red checked curtain behind, morning light, medium shot";
for (const f of ["1-lider.jpg","2-con-set.jpg","3-sin-set.jpg","doble.jpg"]) {
  const t=Date.now(); const v = await revisarCuadro(`http://127.0.0.1:8765/${f}`, escena);
  console.log(f.padEnd(14), JSON.stringify(v), `${Date.now()-t}ms`);
}
srv.close();
