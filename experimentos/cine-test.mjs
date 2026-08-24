import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
const { tratamientoVisual } = await import("../services/quality/cinematografo.ts");
const t = await tratamientoVisual({ topic: "una mujer come insectos convencida de que son caramelos", niche: "terror", tone: "horror", durationTarget: "30s" });
console.log(t);
