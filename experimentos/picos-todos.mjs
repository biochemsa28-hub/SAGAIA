// ¿La técnica del cuadro destino sirve para TODOS los géneros, o solo para el
// beso? Las acciones violentas son las que más riesgo tienen con el filtro de
// contenido, y si caen, esos géneros se quedan sin pico.
//
// Cada rechazo es gratis (muere en la validación); solo se paga el intento que
// dibuja. Peor caso: ~$0.06 por acción.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
process.env.FAL_KEY = env.FAL_KEY ?? env.FAL_API_KEY;
process.env.CHARACTER_REF_MODEL = env.CHARACTER_REF_MODEL ?? "fal-ai/nano-banana/edit";

const { generarCuadroDestino } = await import("../services/video/peak-frame.ts");

const db = createClient({ url: "file:" + (env.DATABASE_PATH ?? "./db/vynavo.db").replace(/^\.\//, "") });
const r = await db.execute(`
  SELECT reference_image_url u FROM project_cast
  WHERE reference_image_url IS NOT NULL AND project_id = (
    SELECT project_id FROM project_cast WHERE reference_image_url IS NOT NULL
    ORDER BY created_at DESC LIMIT 1) ORDER BY created_at LIMIT 2`);
const refs = r.rows.map((x) => x.u);

// Un pico por género, tal como los escribiría el guionista en physical_action.
const CASOS = [
  ["drama",         "She slaps him across the face and he turns away"],
  ["terror",        "A hand reaches out of the dark and grabs her wrist, pulling her back"],
  ["confesion",     "Her knees give way and she sinks to the floor, sobbing into her hands"],
  ["inspiracional", "He pushes off the ground with both hands and rises to his feet"],
  ["comedia",       "He trips over his own foot and lands flat on the floor"],
];

mkdirSync("experimentos/salida/picos", { recursive: true });
let ok = 0;
for (const [genero, accion] of CASOS) {
  const url = await generarCuadroDestino({ accionFisica: accion, referencias: refs, escena: 1 });
  if (url) {
    ok++;
    writeFileSync(`experimentos/salida/picos/${genero}.jpg`, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  console.log(`  ${url ? "OK " : "XX "}${genero.padEnd(14)} ${accion.slice(0, 52)}`);
}
console.log(`\n${ok}/${CASOS.length} géneros con cuadro destino · ~$${(ok * 0.06).toFixed(2)}`);
