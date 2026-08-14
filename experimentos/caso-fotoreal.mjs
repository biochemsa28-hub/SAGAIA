// ¿La técnica del cuadro destino funciona en FOTORREALISTA, o solo en anime?
//
// Todo lo verificado hasta acá —el beso, la cama, los cinco géneros, la comedia—
// se probó con retratos anime. Pero 19 de 22 proyectos de la base son
// "cinematic". O sea que la mayoría de la producción va por un camino que nunca
// se probó, y hay motivo para sospechar: los filtros de contenido son más duros
// con caras que parecen reales que con ilustraciones.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim()]));
process.env.FAL_KEY = env.FAL_KEY ?? env.FAL_API_KEY;

const { generarCuadroDestino } = await import("../services/video/peak-frame.ts");
const { PICO_POR_DEFECTO } = await import("../lib/ai/accion-clave.ts");

const db = createClient({ url: "file:" + (env.DATABASE_PATH ?? "./db/vynavo.db").replace(/^\.\//, "") });
const r = await db.execute(`
  SELECT pc.reference_image_url u FROM project_cast pc JOIN projects p ON p.id = pc.project_id
  WHERE pc.reference_image_url IS NOT NULL AND p.visual_style = 'cinematic'
  ORDER BY pc.created_at DESC LIMIT 2`);
const refs = r.rows.map((x) => x.u);
console.log("retratos cinematic:", refs.map((u) => String(u).slice(-20)).join("  "), "\n");

// Los picos de cuatro géneros, tal como los inyecta la red de seguridad.
const CASOS = [
  ["romance", PICO_POR_DEFECTO.romance],
  ["drama", PICO_POR_DEFECTO.drama],
  ["confesion", PICO_POR_DEFECTO.confesion],
  ["horror", PICO_POR_DEFECTO.horror],
];

mkdirSync("experimentos/salida/foto", { recursive: true });
let dibujadas = 0;
for (const [genero, accion] of CASOS) {
  const url = await generarCuadroDestino({
    accionFisica: accion, referencias: refs, escena: 1,
    estiloVisual: "cinematic",     // <- el camino que nunca se probó
  });
  if (url) {
    dibujadas++;
    writeFileSync(`experimentos/salida/foto/${genero}.jpg`, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  console.log(`  ${url ? "DIBUJADA " : "BLOQUEADA"} ${genero}`);
}
console.log(`\n${dibujadas}/${CASOS.length} en fotorrealista`);
