import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"")]));
for (const k of ["ANTHROPIC_API_KEY","OPENAI_API_KEY"]) if (env[k]) process.env[k]=env[k];
const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const MARCA = /\b(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|consejo|paso|regla|señal|secreto|truco|clave|h[aá]bito|error)\b/i;
const topic = process.argv[2] ?? "cómo ahorrar dinero cuando ganas poco";
const base = { niche:"drama", topic, tone:"drama", duration_target:"30s", language:"es" };
const show = (r,t) => { console.log(`--- ${t}`); for (const s of r.data.scenes) console.log(`[${s.scene_number}]${s.is_peak?" ★":""} ${s.speaker}: "${s.narration_text}"`); };
let r = await storyGeneratorService.generate(base);
show(r, "primer intento");
const sin = !r.data.scenes.some(s => MARCA.test(s.narration_text ?? ""));
console.log("¿sin consejos?", sin);
if (sin) {
  r = await storyGeneratorService.generate({ ...base, additional_instructions: "[CORRECCIÓN DE ESCENAS] Reescribí el guion COMPLETO corrigiendo esto: El usuario pidió un CONSEJO y el guion no contiene NINGÚN consejo dicho en voz alta: es un drama. Reescribilo para que un personaje diga, nombrados y con detalle concreto (número, tiempo, mecanismo), los pasos que el profesional del tema daría — y que el espectador pueda anotar. La emoción se queda; la respuesta se agrega." });
  show(r, "reintento con corrección");
  console.log("¿sin consejos?", !r.data.scenes.some(s => MARCA.test(s.narration_text ?? "")));
}
