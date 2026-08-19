const { replantearSobreElHombro, sinDescripcionDePersonaje } = await import("../services/fal/image-generator.ts");
const p = "Scarlet Bracamontes, seated across the candlelit table, hands folded calmly over the white tablecloth, looking directly at Ramiro with an unreadable half-smile, warm amber and crimson palette, elegant dining room with white tablecloth, single red rose in a vase, candle light casting sharp shadows under her cheekbones, medium close-up from Ramiro's side over his shoulder with his shoulder out of focus, Ramiro lips closed listening in soft blur, anime illustration style with dramatic shadow detail";
const r = replantearSobreElHombro(p);
console.log(r); console.log("---"); console.log(sinDescripcionDePersonaje(r));
console.log("---"); console.log(replantearSobreElHombro("Bianca in the doorway, seen over Ramiro's shoulder, Ramiro's back blurred in the foreground, warm light"));
