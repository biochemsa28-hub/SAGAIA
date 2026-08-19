import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"").trim()]));
process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
const { revisarComoDirector } = await import("../services/quality/director.ts");
const L = "the living room";
const scenes = [
 { scene_number:1, speaker:"Delfina", location:L, narration_text:"Adrián, ¿por qué estás besando a Malena? ¿Qué está pasando aquí?", physical_action:"Adrián and Malena kissing, she freezes at the door | her hand grips the frame", image_prompt:"Adrián kissing Malena by the window, seen over Delfina's shoulder from the doorway" },
 { scene_number:2, speaker:"Adrián", location:L, narration_text:"Delfina, espera. Yo no sé cómo explicarte esto.", physical_action:"he steps toward her, hand raised | he stops", image_prompt:"Adrián alone, hand raised palm out, medium shot" },
 { scene_number:3, speaker:"Malena", location:L, narration_text:"Dele, lo siento. Pero esto lleva meses.", physical_action:"Malena looks down | she grips her dress", image_prompt:"Delfina center frame mouth open, Malena at the edge" },
 { scene_number:4, speaker:"Delfina", location:L, narration_text:"¿Meses? ¿Y yo, sin saber nada?", physical_action:"her hand goes to her chest | tears", image_prompt:"Delfina close-up crying" },
 { scene_number:5, speaker:"Adrián", location:L, narration_text:"Siempre te amé a ti, Delfina. Eso no cambia.", physical_action:"his hand cups her jaw, leaning close | he holds her face", image_prompt:"Adrián cupping Delfina's face, foreheads close" },
 { scene_number:6, speaker:"Delfina", location:L, narration_text:"Entonces, ¿por qué la besaste?", physical_action:"his hand still on her jaw | she looks up", image_prompt:"two-shot, his hand on her jaw, her eyes up" },
 { scene_number:7, speaker:"Adrián", location:L, narration_text:"Porque me perdí. Pero solo te quiero a ti.", physical_action:"his hand cups her jaw, leaning in | almost kiss", image_prompt:"Adrián cupping Delfina's face, lips close", is_peak:true },
 { scene_number:8, speaker:"Delfina", location:L, narration_text:"¿Y yo, Adrián? ¿Qué soy yo para ti?", physical_action:"his hands on her face | she closes her eyes", image_prompt:"Adrián holding her face, close" },
 { scene_number:9, speaker:"Malena", location:L, narration_text:"Eso, yo también quiero saber.", physical_action:"Malena steps forward | arms crossed", image_prompt:"the three of them standing, wide shot" },
];
const v = await revisarComoDirector({ topic:"mujer ve a su esposo besándose con su hermana", format:"story", niche:"drama", tone:"drama", durationTarget:"30s", cast:["Delfina","Adrián","Malena"], scenes });
console.log(JSON.stringify(v, null, 1));
