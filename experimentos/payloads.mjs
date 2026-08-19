// Imprime lo que sale hacia fal en cada etapa, con FAL_LOG_PAYLOADS=on, sin gastar
// más que un retrato + un cuadro destino (~$0.12); el clip se construye y NO se envía.
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.FAL_API_KEY = env.FAL_API_KEY ?? env.FAL_KEY; process.env.FAL_KEY = process.env.FAL_API_KEY; process.env.FAL_LOG_PAYLOADS = "on";
const { generateCharacterOptions } = await import("../services/fal/image-generator.ts");
const { generarCuadroDestino } = await import("../services/video/peak-frame.ts");
const { buildDialogueDirection } = await import("../services/video/native-audio.ts");
console.log("\n===== 1) RETRATO =====");
const r = await generateCharacterOptions({ description: "Ariadna Ulloa, 24, striking pale woman with long jet-black hair and a mole by her left lip, black satin blouse, candlelit bar", niche: "terror", visualStyle: "anime", count: 1 });
console.log("\n===== 2) CUADRO DESTINO (pico) =====");
await generarCuadroDestino({ accionFisica: "she leans in and kisses him | she pulls back an inch", referencias: [r.urls[0], "https://pub-1e52181b6737481ba5bc03ad9bf43ff1.r2.dev/images/168b93cd-786c-46bb-b169-38ab735d2a0a.jpg"], escena: 5, estiloVisual: "anime", tono: "horror" });
console.log("\n===== 3) DIRECCIÓN DE VIDEO (texto que va en el prompt del clip) =====");
console.log(buildDialogueDirection([{ speaker: "Adrián", text: "Sus ojos… no eran ojos.", look: "young man in a dark navy blue hoodie", emotion: "terror", physicalAction: "he presses against the wall | his mouth opens as if to scream" }], 6));
