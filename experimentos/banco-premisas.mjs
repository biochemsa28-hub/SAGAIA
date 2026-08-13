// ─── Banco de pruebas de premisas ────────────────────────────────────────────
//
// Probar una premisa produciendo el video cuesta ~$2 y tarda minutos. Pero lo
// FRÁGIL de una premisa no es la historia —el guion sale barato y sale bien—:
// es si sus dos cuadros decisivos se pueden DIBUJAR.
//
//   EL GANCHO: el primer segundo. Es lo único que decide si alguien deja de
//   scrollear. Si el cuadro de apertura no detiene el pulgar, el resto del video
//   no existe.
//
//   EL PICO: el momento que se captura y se reenvía. Si el filtro de contenido
//   lo rechaza —y rechaza más de lo que uno cree, como el beso en la cama— la
//   premisa no se puede contar con este sistema por más buena que sea.
//
// Los dos se dibujan por $0.06 cada uno, sin animar un solo segundo. Ocho
// premisas completas cuestan menos de un dólar y se deciden mirando.
//
//   node experimentos/banco-premisas.mjs            → solo los picos ($0.06 c/u)
//   node experimentos/banco-premisas.mjs --gancho   → gancho + pico ($0.12 c/u)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
process.env.FAL_KEY = env.FAL_KEY ?? env.FAL_API_KEY;

const { generarCuadroDestino } = await import("../services/video/peak-frame.ts");
const { ACCION_CLAVE } = await import("../lib/ai/accion-clave.ts");

// Cada premisa con SUS DOS CUADROS. El gancho se escribe como una imagen que ya
// plantea la pregunta; el pico, como el cuerpo ejecutando la respuesta.
const PREMISAS = [
  { id: "vestido",   tono: "drama",
    gancho: "A woman in a coat stands frozen in a doorway, keys still in her hand, staring at something off to the side",
    pico:   "she tears the veil off the other woman's head in one pull" },
  { id: "mesero",    tono: "drama",
    gancho: "A young waiter on his knees picking up broken glass while seated guests look down at him",
    pico:   "he drops a heavy folder flat on the dinner table and everyone stops" },
  { id: "ojos",      tono: "mystery",
    gancho: "A woman on a park bench staring at a small boy playing, her hand halfway to her mouth",
    pico:   "the mother grabs the boy's wrist and pulls him away" },
  { id: "velorio",   tono: "horror",
    gancho: "Mourners crying around an open casket, and one phone screen glowing inside it",
    pico:   "the body sits up inside the casket" },
  { id: "adn",       tono: "drama",
    gancho: "A family dinner where one woman places a sealed envelope on the tablecloth and says nothing",
    pico:   "the father stands up so fast his chair goes over backwards" },
  { id: "ascensor",  tono: "romance",
    gancho: "Two people alone in an elevator, standing too far apart, both watching the floor numbers",
    pico:   "the moment they finally kiss as the doors close" },
  { id: "labios",    tono: "drama",
    gancho: "A cleaner wiping a glass wall while executives talk on the other side, her hand gone still",
    pico:   "she drops the cloth and walks in without knocking" },
  { id: "mensaje",   tono: "confesion",
    gancho: "A woman holding a phone that is not hers, the screen lighting up her face in the dark",
    pico:   "the phone slips out of her hands and hits the floor" },
];

const db = createClient({ url: "file:" + (env.DATABASE_PATH ?? "./db/vynavo.db").replace(/^\.\//, "") });
const r = await db.execute(`
  SELECT reference_image_url u FROM project_cast
  WHERE reference_image_url IS NOT NULL AND project_id = (
    SELECT project_id FROM project_cast WHERE reference_image_url IS NOT NULL
    ORDER BY created_at DESC LIMIT 1) ORDER BY created_at LIMIT 2`);
const refs = r.rows.map((x) => x.u);
const conGancho = process.argv.includes("--gancho");
mkdirSync("experimentos/salida/premisas", { recursive: true });

const dibujar = async (accion, id, cual) => {
  const url = await generarCuadroDestino({ accionFisica: accion, referencias: refs, escena: 1, estiloVisual: "anime" });
  if (!url) return false;
  writeFileSync(`experimentos/salida/premisas/${id}_${cual}.jpg`, Buffer.from(await (await fetch(url)).arrayBuffer()));
  return true;
};

let gastado = 0;
for (const p of PREMISAS) {
  // Antes de gastar: ¿el pico siquiera cuenta como pico para el enrutador? Si no,
  // el video nunca le dibujaría un cuadro destino y la premisa no sirve para este
  // sistema por más linda que suene.
  const cuenta = ACCION_CLAVE.test(p.pico);
  const pico = await dibujar(p.pico, p.id, "pico");
  if (pico) gastado += 0.06;
  let gancho = null;
  if (conGancho) { gancho = await dibujar(p.gancho, p.id, "gancho"); if (gancho) gastado += 0.06; }
  console.log(
    `${pico ? "OK " : "XX "}${p.id.padEnd(10)} pico:${pico ? "dibujado" : "RECHAZADO"}` +
    `${conGancho ? ` · gancho:${gancho ? "dibujado" : "RECHAZADO"}` : ""}` +
    ` · el enrutador lo ve como pico: ${cuenta ? "sí" : "NO"}`,
  );
}
console.log(`\ngastado ~$${gastado.toFixed(2)} · imágenes en experimentos/salida/premisas/`);
