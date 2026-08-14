// ¿Está listo para cualquier escenario?
//
// La unica forma honesta de contestarlo: los ONCE picos de genero contra los DOS
// registros visuales, por el SERVICIO REAL —con su escalera, su corte por "|" y
// su bloque de estilo—, no con prompts sueltos. 22 combinaciones.
//
// Un rechazo del filtro no cuesta nada; solo se paga el intento que dibuja.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim()]));
process.env.FAL_KEY = env.FAL_KEY ?? env.FAL_API_KEY;

const { generarCuadroDestino } = await import("../services/video/peak-frame.ts");
const { PICO_POR_DEFECTO } = await import("../lib/ai/accion-clave.ts");

// Anime: el elenco vivo del proyecto. Foto: los dos adultos generados para esto.
const db = createClient({ url: "file:" + (env.DATABASE_PATH ?? "./db/vynavo.db").replace(/^\.\//, "") });
const a = await db.execute(`
  SELECT pc.reference_image_url u FROM project_cast pc JOIN projects p ON p.id = pc.project_id
  WHERE pc.reference_image_url IS NOT NULL AND p.visual_style = 'anime' ORDER BY pc.created_at LIMIT 2`);
const REFS = {
  anime: a.rows.map((x) => x.u),
  cinematic: JSON.parse(readFileSync("experimentos/salida/besofoto/retratos.json", "utf8")),
};

mkdirSync("experimentos/salida/matriz", { recursive: true });
const generos = Object.keys(PICO_POR_DEFECTO);
const fallos = [];
let dibujadas = 0;

for (const estilo of ["anime", "cinematic"]) {
  console.log(`\n━━━ ${estilo.toUpperCase()}`);
  for (const g of generos) {
    const url = await generarCuadroDestino({
      accionFisica: PICO_POR_DEFECTO[g], referencias: REFS[estilo], escena: 1, estiloVisual: estilo,
    });
    if (url) {
      dibujadas++;
      writeFileSync(`experimentos/salida/matriz/${estilo}_${g}.jpg`, Buffer.from(await (await fetch(url)).arrayBuffer()));
    } else fallos.push(`${estilo}/${g}`);
    console.log(`  ${url ? "OK " : "XX "}${g}`);
  }
}
console.log(`\n━━━ ${dibujadas}/${generos.length * 2} dibujadas · ~$${(dibujadas * 0.06).toFixed(2)}`);
if (fallos.length) console.log(`  bloqueadas: ${fallos.join(", ")}`);
