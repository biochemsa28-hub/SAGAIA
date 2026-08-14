// ─── Prueba: la REGLA #2.7 nueva produce guiones sin duplicados ni desbordes ──
//
// El video de la isla salió con dos defectos que el guion ya traía:
//   · escenas 4 y 5 con image_prompt casi idéntico → imágenes duplicadas →
//     el portero de continuidad BLOQUEÓ la producción
//   · escena 4 con 7.1s de diálogo para un clip de 6s → plano largo y quieto
//
// Esta prueba regenera LA MISMA premisa con la regla reescrita y le pasa el
// mismo detector que ahora corre en producción. Cuesta centavos (solo texto).
//
//   node experimentos/guion-escenas.mjs

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) if (env[k]) process.env[k] = env[k];

const { storyGeneratorService } = await import("../services/openai/story-generator.ts");
const { BLOCK_TARGET_SECONDS } = await import("../lib/config.ts");
const { CHARS_PER_SECOND } = await import("../services/video/narrative-blocks.ts");

// El mismo detector que corre en app/api/generate/story/route.ts
const TECHO = Math.round(BLOCK_TARGET_SECONDS * CHARS_PER_SECOND * 1.15);
const palabras = (t) => new Set(t.toLowerCase().match(/[a-záéíóúñü]{4,}/gi) ?? []);
const parecidos = (a, b) => {
  const A = palabras(a), B = palabras(b);
  if (!A.size || !B.size) return 0;
  let c = 0; for (const w of A) if (B.has(w)) c++;
  return c / (A.size + B.size - c);
};

const PREMISA = {
  niche: "misterio",
  topic: "Un hombre pierde el camino de regreso al yate en una isla selvática. Pasa tres veces por la misma roca marcada. Un viejo aparece entre los árboles: lleva 40 años en la isla. 'La isla decide quién sale. Bienvenido.'",
  tone: "mystery",
  duration_target: "30s",
  language: "es",
};

const r = await storyGeneratorService.generate(PREMISA);
if (!r.success || !r.data?.scenes?.length) {
  console.error("FALLO la generación:", r.error ?? "sin escenas");
  process.exit(1);
}

let defectos = 0;
console.log(`\n${r.data.scenes.length} escenas · techo por escena ${TECHO} car.\n`);
for (const s of r.data.scenes) {
  const n = (s.narration_text ?? "").trim().length;
  const seg = (n / CHARS_PER_SECOND).toFixed(1);
  const larga = n > TECHO;
  if (larga) defectos++;
  console.log(`  escena ${s.scene_number}: ${String(n).padStart(3)} car. (${seg}s) ${larga ? "❌ DESBORDA" : "✓"}`);
}
for (let i = 1; i < r.data.scenes.length; i++) {
  const a = (r.data.scenes[i - 1].image_prompt ?? "").trim();
  const b = (r.data.scenes[i].image_prompt ?? "").trim();
  const sim = parecidos(a, b);
  if (sim >= 0.65) {
    defectos++;
    console.log(`  ❌ escenas ${r.data.scenes[i - 1].scene_number}-${r.data.scenes[i].scene_number} image_prompt duplicado (${sim.toFixed(2)})`);
  } else {
    console.log(`  similitud ${r.data.scenes[i - 1].scene_number}→${r.data.scenes[i].scene_number}: ${sim.toFixed(2)} ✓`);
  }
}
if (!defectos) {
  console.log("\n✅ guion limpio a la primera: sin duplicados ni desbordes");
  process.exit(0);
}

// ── SIMULAR EL REINTENTO DE PRODUCCIÓN ───────────────────────────────────────
// La ruta regenera UNA vez nombrando las escenas defectuosas. Acá se prueba esa
// segunda mitad: que la instrucción de corrección de verdad corrige.
const largas = r.data.scenes
  .filter((s) => (s.narration_text ?? "").trim().length > TECHO)
  .map((s) => `${s.scene_number} (${(s.narration_text ?? "").trim().length} car.)`);
const correccion =
  "\n[CORRECCIÓN DE ESCENAS] Reescribí el guion COMPLETO corrigiendo esto:" +
  ` Las escenas ${largas.join(", ")} tienen narration_text demasiado largo — ` +
  `ninguna escena puede pasar de ${Math.round(BLOCK_TARGET_SECONDS * CHARS_PER_SECOND)} caracteres (${BLOCK_TARGET_SECONDS} segundos hablados); ` +
  "partí el parlamento en DOS escenas con encuadres distintos.";
console.log(`\n${defectos} defecto(s) — simulando el reintento de producción…`);
const r2 = await storyGeneratorService.generate({ ...PREMISA, additional_instructions: correccion });
if (!r2.success || !r2.data?.scenes?.length) {
  console.error("FALLO el reintento:", r2.error ?? "sin escenas");
  process.exit(1);
}
let defectos2 = 0;
for (const s of r2.data.scenes) {
  const n = (s.narration_text ?? "").trim().length;
  const larga = n > TECHO;
  if (larga) defectos2++;
  console.log(`  escena ${s.scene_number}: ${String(n).padStart(3)} car. (${(n / CHARS_PER_SECOND).toFixed(1)}s) ${larga ? "❌ DESBORDA" : "✓"}`);
}
for (let i = 1; i < r2.data.scenes.length; i++) {
  const sim = parecidos((r2.data.scenes[i - 1].image_prompt ?? "").trim(), (r2.data.scenes[i].image_prompt ?? "").trim());
  if (sim >= 0.65) { defectos2++; console.log(`  ❌ escenas ${r2.data.scenes[i - 1].scene_number}-${r2.data.scenes[i].scene_number} duplicadas (${sim.toFixed(2)})`); }
}
console.log(defectos2 < defectos
  ? `\n✅ el reintento corrige: ${defectos} defecto(s) → ${defectos2}`
  : `\n❌ el reintento no mejoró (${defectos2} defecto[s])`);
