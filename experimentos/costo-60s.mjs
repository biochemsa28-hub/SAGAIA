// Costo real estimado de UN video de 60s con el pipeline de HOY, pieza por pieza,
// contra el TIER_COST_USD fijado (que fue medido el 6 de agosto).
const { costoClipSeedance } = await import("../lib/costs.ts");
const { TIER_COST_USD, MARGIN_MULTIPLIER, NAVOS_PER_USD, CREDIT_COST_BY_TIER } = await import("../lib/config.ts");
const seg = 60, escenas = 12, personajes = 2;
const clips = costoClipSeedance({ segundos: seg, resolucion: "720p", conAudio: true });   // 60s animados
const img = 0.039;                        // nano-banana / edit por imagen (precio fal)
const imagenes = escenas * img;           // 12 cuadros de escena
const casting = personajes * 2 * img;     // 2 retratos por personaje
const pico = 3 * img;                     // escalera del cuadro destino: hasta ~3 intentos
const claude = 0.06 * 2 + 0.02;           // guion (~20k tok sonnet in+out ≈ $0.06) ×2 por reintento + casting
const sfx = 6 * 0.02 + 0.04;              // ~6 efectos + whoosh/impacto (ElevenLabs sound-generation)
const musica = 0.05;
const rehost = 0.0;                       // R2 despreciable
const total = clips + imagenes + casting + pico + claude + sfx + musica;
console.log({ clips: +clips.toFixed(2), imagenes: +imagenes.toFixed(2), casting: +casting.toFixed(2), pico: +pico.toFixed(2), claude: +claude.toFixed(2), sfx: +sfx.toFixed(2), musica, total: +total.toFixed(2) });
console.log("fijado en config:", TIER_COST_USD.kenburns, "→", CREDIT_COST_BY_TIER.kenburns, "NAVOS");
console.log("estimado hoy:", total.toFixed(2), "→", Math.round(total*MARGIN_MULTIPLIER*NAVOS_PER_USD), "NAVOS a margen", MARGIN_MULTIPLIER+"x");
console.log("margen real si se cobra 12.240:", (12.24/total).toFixed(2)+"x");
