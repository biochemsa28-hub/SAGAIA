// CASO DEL USUARIO: un hombre corre al baño, no llega, y la multitud se burla.
//
// Dos preguntas: ¿la regla lo reconoce como pico? y ¿el filtro deja dibujarlo?
// La comedia escatológica es territorio nuevo — el filtro puede rechazarla por
// motivos distintos a los del beso.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim()]));
process.env.FAL_KEY = env.FAL_KEY ?? env.FAL_API_KEY;

const { ACCION_CLAVE } = await import("../lib/ai/accion-clave.ts");
const { generarCuadroDestino } = await import("../services/video/peak-frame.ts");

// Cómo lo escribiría el guionista, de lo más explícito a lo más dirigido.
// El pico REAL de la escena no es el accidente: es el cuerpo que se detiene en
// seco y la multitud que se da vuelta. Eso se dibuja y además es más gracioso.
const VERSIONES = [
  ["explícito",  "he soils his pants mid-run and freezes in front of everyone"],
  ["el frenazo", "he stops dead mid-stride, legs locked together, hands frozen in the air"],
  ["la reacción","he stops dead mid-stride and everyone around him turns to look and starts laughing"],
  ["la caída",   "he trips and goes down flat two steps from the bathroom door while the crowd laughs"],
];

console.log("PASO A — ¿la regla lo reconoce como pico?\n");
for (const [etiqueta, accion] of VERSIONES) {
  console.log(`  ${ACCION_CLAVE.test(accion) ? "PICO " : "sutil"}  ${etiqueta.padEnd(12)} ${accion.slice(0, 62)}`);
}

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

mkdirSync("experimentos/salida", { recursive: true });
console.log("\nPASO B — dibujando el cuadro destino...\n");
for (const [etiqueta, accion] of VERSIONES) {
  const url = await generarCuadroDestino({ accionFisica: accion, referencias: refs, escena: 1, estiloVisual: "anime" });
  if (url) {
    writeFileSync(`experimentos/salida/comedia_${etiqueta.replace(/\s/g, "_")}.jpg`,
      Buffer.from(await (await fetch(url)).arrayBuffer()));
    console.log(`  DIBUJADA  ${etiqueta}`);
  } else {
    console.log(`  BLOQUEADA ${etiqueta}`);
  }
}
