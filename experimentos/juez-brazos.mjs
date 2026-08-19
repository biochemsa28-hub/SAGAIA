import { readFileSync } from "node:fs"; import http from "node:http";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
const { revisarCuadro } = await import("../services/quality/cuadro.ts");
const srv = http.createServer((q,r)=>{ try { r.end(readFileSync("experimentos/out/set/"+q.url.slice(1))); } catch { r.statusCode=404; r.end(); } }).listen(8766);
console.log(JSON.stringify(await revisarCuadro("http://127.0.0.1:8766/brazos.jpg", "Ramiro stepping forward with one hand raised palm out, Bianca standing behind him to the left, warm living room, medium shot")));
srv.close();
