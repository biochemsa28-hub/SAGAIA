// Segunda vuelta del caso de comedia, con el pico QUE PIDIO EL USUARIO:
// la mancha visible en el pantalón, explícita, en un lugar público.
//
// La vez anterior probé la versión "elegante" (el frenazo, la reacción) y el
// usuario corrigió: el chiste ES ver la mancha. Así que se prueba eso.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim()]));
process.env.FAL_KEY = env.FAL_KEY ?? env.FAL_API_KEY;

const { ACCION_CLAVE } = await import("../lib/ai/accion-clave.ts");
const { generarCuadroDestino } = await import("../services/video/peak-frame.ts");

// De lo más explícito a lo más encuadrado, todas en lugar público y todas con
// la mancha VISIBLE — que es el pedido.
const VERSIONES = [
  ["explícito",   "a large brown stain spreading across the seat of his trousers while a crowd on the street points and laughs at him"],
  ["mancha+calle","he stands frozen on a busy sidewalk with the back of his trousers visibly soiled, everyone around him laughing"],
  ["gag",         "a slapstick gross-out gag: the visible mess on the back of his pants as the whole bus queue bursts out laughing"],
  ["humillación", "he covers the back of his trousers with both hands, too late, as the crowd photographs him laughing"],
];

console.log("PASO A — ¿la regla lo reconoce como pico?\n");
for (const [e, a] of VERSIONES) console.log(`  ${ACCION_CLAVE.test(a) ? "PICO " : "sutil"}  ${e.padEnd(13)} ${a.slice(0, 58)}`);

if (!process.argv.includes("--imagen")) { console.log("\n(--imagen para dibujar)"); process.exit(0); }

const db = createClient({ url: "file:" + (env.DATABASE_PATH ?? "./db/vynavo.db").replace(/^\.\//, "") });
const r = await db.execute(`
  SELECT reference_image_url u FROM project_cast
  WHERE reference_image_url IS NOT NULL AND project_id = (
    SELECT project_id FROM project_cast WHERE reference_image_url IS NOT NULL
    ORDER BY created_at DESC LIMIT 1) ORDER BY created_at LIMIT 1`);
const refs = r.rows.map((x) => x.u);

mkdirSync("experimentos/salida", { recursive: true });
console.log("\nPASO B — dibujando...\n");
for (const [etiqueta, accion] of VERSIONES) {
  const url = await generarCuadroDestino({ accionFisica: accion, referencias: refs, escena: 1, estiloVisual: "anime" });
  if (url) {
    writeFileSync(`experimentos/salida/gag_${etiqueta.replace(/[^a-z]/gi, "")}.jpg`, Buffer.from(await (await fetch(url)).arrayBuffer()));
    console.log(`  DIBUJADA  ${etiqueta}`);
  } else console.log(`  BLOQUEADA ${etiqueta}`);
}
