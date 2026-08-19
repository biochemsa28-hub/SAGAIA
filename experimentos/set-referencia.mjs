// Prueba real de "mismo decorado": retrato → escena líder (define el set) →
// dos escenas más del mismo lugar, UNA con la foto del set y OTRA sin ella.
// Cuesta ~4 imágenes (~$0.16). Descarga las 3 escenas para compararlas a ojo.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.FAL_API_KEY = env.FAL_API_KEY ?? env.FAL_KEY; process.env.FAL_KEY = process.env.FAL_API_KEY;
const { generateCharacterOptions, generateSceneImage } = await import("../services/fal/image-generator.ts");

const out = "experimentos/out/set"; mkdirSync(out, { recursive: true });
const bajar = async (url, nombre) => { const b = Buffer.from(await (await fetch(url)).arrayBuffer()); writeFileSync(`${out}/${nombre}.jpg`, b); console.log("  →", `${out}/${nombre}.jpg`); };

const r = await generateCharacterOptions({ description: "Marisol Ibarra, 29, warm brown skin, dark curly hair tied up, olive green linen shirt", niche: "drama", visualStyle: "realista", count: 1 });
const retrato = r.urls[0]; console.log("retrato", retrato);

const base = { projectId: "exp-set", niche: "drama", visualStyle: "realista", referenceImageUrl: retrato };
const lider = await generateSceneImage({ ...base, sceneNumber: 1, prompt: "Marisol Ibarra sits at a small kitchen table holding a folded letter, a chipped yellow mug and a bowl of oranges beside her, a window with a red checked curtain behind, morning light from the left, medium shot, eye level", emotion: "tristeza" });
console.log("líder", lider.url); await bajar(lider.url, "1-lider");

const prompt2 = "Marisol Ibarra stands up from the kitchen table and turns toward the window, letter crushed in her fist, the yellow mug and oranges on the table in the foreground, red checked curtain, morning light from the left, wide shot from behind the table";
const conSet = await generateSceneImage({ ...base, sceneNumber: 2, prompt: prompt2, emotion: "rabia", setReferenceUrl: lider.url });
console.log("con set", conSet.url); await bajar(conSet.url, "2-con-set");
const sinSet = await generateSceneImage({ ...base, sceneNumber: 3, prompt: prompt2, emotion: "rabia" });
console.log("sin set", sinSet.url); await bajar(sinSet.url, "3-sin-set");
