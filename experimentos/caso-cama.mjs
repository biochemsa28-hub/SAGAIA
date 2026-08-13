// CASO DE PRUEBA DEL USUARIO: "estaban en la cama besándose".
// ¿El sistema produce un beso de verdad, de punta a punta?
//
// Paso A (gratis): ¿la regla reconoce como el guionista escribiria esa accion?
// Paso B ($0.06): el cuadro destino — que es lo que decide si el video lo ejecuta.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
process.env.FAL_KEY = env.FAL_KEY ?? env.FAL_API_KEY;

const { ACCION_CLAVE, picoPorDefecto } = await import("../lib/ai/accion-clave.ts");

// ── PASO A: como escribiria el guionista "estaban en la cama besandose" ──────
// El campo physical_action pide formato "antes | despues", en ingles, escrito
// como se EJECUTA. Estas son formulaciones plausibles del modelo.
const FORMAS = [
  "they are kissing on the bed, she pulls back an inch to speak | their foreheads stay touching",
  "her hand goes to the back of his neck, their lips meet and hold | they part an inch, breathing hard",
  "lying on the bed, their lips meet and stay together | she turns her face away into the pillow",
  "they kiss slowly, his hand on her waist | he pulls back to look at her",
  // Y una que NO deberia contar: solo miradas, sin contacto.
  "they lie side by side without touching | their eyes meet and neither looks away",
];
console.log("PASO A — ¿la regla reconoce el beso?\n");
for (const f of FORMAS) {
  console.log(`  ${ACCION_CLAVE.test(f) ? "PICO   " : "sutil  "} ${f.slice(0, 68)}`);
}
console.log(`\n  respaldo del genero romance: ${ACCION_CLAVE.test(picoPorDefecto("romance")) ? "válido" : "ROTO"}`);

// ── PASO B: el cuadro destino de ese beso, en una cama ───────────────────────
if (!process.argv.includes("--imagen")) {
  console.log("\n(agregá --imagen para dibujar el cuadro destino, ~$0.06)");
  process.exit(0);
}

const db = createClient({ url: "file:" + (env.DATABASE_PATH ?? "./db/vynavo.db").replace(/^\.\//, "") });
const r = await db.execute(`
  SELECT reference_image_url u FROM project_cast
  WHERE reference_image_url IS NOT NULL AND project_id = (
    SELECT project_id FROM project_cast WHERE reference_image_url IS NOT NULL
    ORDER BY created_at DESC LIMIT 1) ORDER BY created_at LIMIT 2`);
const refs = r.rows.map((x) => x.u);

const { generarCuadroDestino } = await import("../services/video/peak-frame.ts");
console.log("\nPASO B — dibujando el cuadro destino (~$0.06)...");
const url = await generarCuadroDestino({
  // Tal cual la escribiria el guion para esta premisa.
  accionFisica: "They are lying on the bed. Her hand goes to the back of his neck, their lips meet and hold, eyes closed",
  referencias: refs,
  escena: 1,
  estiloVisual: "anime",
});
if (!url) { console.log("  ninguna formulación pasó el filtro"); process.exit(1); }
mkdirSync("experimentos/salida", { recursive: true });
writeFileSync("experimentos/salida/cama.jpg", Buffer.from(await (await fetch(url)).arrayBuffer()));
console.log("  imagen: experimentos/salida/cama.jpg");
