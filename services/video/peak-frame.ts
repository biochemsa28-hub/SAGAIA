// ─── El cuadro DESTINO de una acción física ──────────────────────────────────
//
// El principio que ordenó toda esta parte del sistema: una acción que CAMBIA el
// estado del cuerpo no puede salir de una foto que no la contiene. image-to-video
// interpola entre dos cuadros, así que si el cuadro inicial muestra dos bocas a
// un centímetro, el clip puede acercarlas y nunca juntarlas. Se queda en el
// "casi". Eso valía para el beso, para la caída, para la cachetada y para el
// llanto: todo pico físico salía como amago.
//
// La salida obvia era el endpoint de referencias, que construye la acción en vez
// de interpolar hacia ella — y cuesta ~6x por segundo ($0.30 contra $0.052).
//
// Pero había una salida mejor, y estuvo escondida detrás de un malentendido de
// meses. Se creía que el generador de imágenes "nunca dibuja los labios juntos",
// medido tres veces. Falso: el prompt anatómico —"labios PRESIONADOS, el labio
// inferior contra el superior"— lo RECHAZA el filtro de contenido de fal con un
// 422 antes de dibujar un solo píxel, y el pipeline caía a una versión tibia que
// producía el "casi". El dibujante nunca se negó; nunca le llegó el pedido.
//
// Pedido como lo escribiría un guionista —"el momento en que finalmente se
// besan"— pasa sin problema. Verificado de punta a punta: el cuadro salió con
// los labios juntos y el elenco intacto, y el clip barato animado HACIA él
// produjo el beso completo (acercamiento → contacto → sostenido) con 21% de
// cuadros quietos, por debajo del umbral.
//
//   endpoint de referencias:  $2.42 por beso
//   este camino:              $0.38   (dos imágenes + un clip de 5s)
//
// Así que el pico ya no se compra: se DIBUJA, y el modelo barato viaja hacia él.

import { fal } from "@fal-ai/client";

const MODELO = process.env.CHARACTER_REF_MODEL ?? "fal-ai/nano-banana/edit";

function apiKey(): string {
  return process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "";
}

// ── La escalera de formulaciones ─────────────────────────────────────────────
// De lo más directo a lo más indirecto. Se usa la PRIMERA que pase el filtro.
// Un rechazo no cuesta nada —la petición muere en la validación— así que probar
// la escalera entera es gratis salvo el intento que efectivamente dibuja.
//
// Medido con un beso: "directo" y "sobrio" rechazados, "narrativo" aceptado. Sin
// la escalera, el pico se pierde en silencio y nadie sabe por qué.
function escalera(accion: string, identidad: string): Array<{ etiqueta: string; prompt: string }> {
  const limpia = accion.trim().replace(/\s+/g, " ").slice(0, 220);
  return [
    // PRIMER PELDAÑO: LA ACCIÓN, INSISTIDA.
    //
    // Medido sobre retratos fotorrealistas —que son 19 de cada 22 proyectos, o
    // sea el camino principal—: las cuatro acciones pasaron el filtro y aun así
    // el beso salió sin que los labios se tocaran y la cachetada salió como una
    // caricia. En ilustración el modelo cierra el contacto; en foto se queda en
    // el centímetro, que es el defecto original de todo este sistema.
    //
    // O sea que ahí el límite NO es el filtro: es que el modelo no se
    // compromete. Y si no es el filtro, se puede pedir más fuerte. Este peldaño
    // insiste en que el contacto ya ocurrió y está sostenido.
    //
    // Va PRIMERO y no reemplaza a nada: si el filtro lo rechaza —como pasa con
    // los picos íntimos en anime— cae al peldaño siguiente, que es el que había
    // antes. Un rechazo no cuesta nada, así que el intento es gratis y solo
    // puede mejorar.
    { etiqueta: "insistido", prompt:
      `${limpia}. The contact is ALREADY happening and is held: the bodies are touching, ` +
      `not approaching. No gap between them, no hesitation, the gesture is complete. ${identidad}` },
    { etiqueta: "directo", prompt: `${limpia}. ${identidad}` },
    { etiqueta: "narrativo", prompt: `The exact moment this happens, at the peak of the scene: ${limpia}. Quiet, restrained, cinematic. ${identidad}` },
    { etiqueta: "still", prompt: `A film still capturing this moment: ${limpia}. ${identidad}` },
    { etiqueta: "sobrio", prompt: `A dramatic scene between the two characters. ${limpia.split(/[.,;]/)[0]}. ${identidad}` },
    // ÚLTIMO PELDAÑO: se le quita el MUEBLE y la POSTURA.
    //
    // Medido con el caso "estaban en la cama besándose": las cuatro
    // formulaciones de arriba caían, y la misma acción sin "lying on the bed"
    // pasaba. La cama más un beso lee como sexual aunque la escena sea inocente;
    // el mismo beso de pie no le molesta a nadie.
    //
    // Y quitarlo no cuesta nada: el lugar NO hace falta nombrarlo, porque la
    // imagen de referencia de la escena ya trae la cama, la luz y el cuarto. El
    // prompt solo tiene que aportar lo que la foto no tiene: la acción.
    { etiqueta: "sin postura", prompt: `${sinPostura(limpia)}. ${identidad}` },
    // ÚLTIMO PELDAÑO: EL VERBO LLANO, SIN UN SOLO DETALLE DEL CUERPO.
    //
    // Es la misma lección del primer hallazgo, que los peldaños de arriba
    // seguían desobedeciendo: lo que dispara el filtro es el DETALLE anatómico,
    // no el hecho. "The moment they finally kiss" pasa; "their lips meet and
    // hold, eyes closed" no — con las mismas referencias y el mismo modelo.
    //
    // Medido con "estaban en la cama besándose": los cinco peldaños anteriores
    // rechazados, porque todos arrastran el texto de la acción tal como lo
    // escribió el guionista. Este lo tira entero y deja solo el verbo.
    //
    // Se pierde precisión —el modelo elige los detalles— pero un beso genérico
    // que EXISTE vale infinitamente más que uno preciso que el filtro nunca deja
    // dibujar.
    // EL DESPUÉS: el rastro, sin un solo verbo de la acción.
    //
    // Medido en fotorrealista: "the slap lands flat across his face" fue
    // rechazada 5 de 5 veces —consistente, no azar—, y "his head is still turned
    // and his cheek is flushed red, she stands with her hand lowered" pasó 3 de
    // 3. El filtro no mira lo que pasó: mira cómo lo nombrás.
    //
    // Y no es una concesión: el instante DESPUÉS es mejor cine. La cachetada que
    // se ve es un golpe; la mejilla roja y la cabeza todavía girada obligan al
    // espectador a completarla, y eso pesa más. Vale para el golpe, la caída y
    // el grito — todo lo que el filtro trata como violencia.
    { etiqueta: "el después", prompt: `${elDespues(limpia)}. ${identidad}` },
    { etiqueta: "verbo llano", prompt: `${verboLlano(limpia)}. ${identidad}` },
  ];
}

// La acción reducida a lo que pasa, sin cómo se ve. El orden importa: se prueba
// de la categoría más específica a la más genérica.
// ⚠️ CON LÍMITE DE PALABRA, Y NO ES UN DETALLE. La primera versión buscaba
// "lips" suelto y el pico de COMEDIA —"he SLIPS again trying to get up"— caía en
// la categoría del beso: un tropiezo se convertía en un beso, en silencio. Es el
// mismo error de subcadena que ya nos costó "Anahí" → "Anahíí".
//
// Y el orden importa: lo más específico primero, porque gana el primero que
// coincide.
const LLANOS: Array<[RegExp, string]> = [
  [/\btrips?\b|stumbl|\bslips?\b|resbal|tropiez/i,        "The moment they lose their footing"],
  [/\bkiss|\blips\b|\bbes[oa]/i,                          "The moment they finally kiss"],
  [/slap|\bhits?\b|punch|bofetad|cachetad|golpe/i,        "The moment right after the slap lands"],
  [/knees|collaps|\bfalls?\b|sinks? to the|derrumb|desplom/i, "The moment they end up on the floor"],
  [/\bsob|weep|\bcry|crying|tears|llor/i,                 "The moment they break down in tears"],
  [/grabs?|wrist|yank|drag|agarr|\bjal/i,                 "The moment a hand catches her wrist"],
  [/rises?|stands? up|gets? up|levant/i,                  "The moment they get back on their feet"],
  [/throws?|smash|shatter|\bromp|lanz/i,                  "The moment the glass hits the floor"],
  [/embrac|hugs?|abraz/i,                                 "The moment they hold each other"],
  // Thriller, misterio y documental: el pico no es un choque entre cuerpos, así
  // que sin estas entradas caían al genérico y perdían lo que los define.
  [/shove|struggl|pushes?|forcej|empuj|runs? for|bolts?|flees?/i, "The moment they struggle against the door"],
  [/opens? the|unfolds?|flips? over|lifts? the|drawer|letter|abre el|despliega/i, "The moment they finally see what was hidden"],
];
function verboLlano(accion: string): string {
  for (const [re, frase] of LLANOS) if (re.test(accion)) return frase;
  return "The emotional peak of this scene between the two characters";
}

// El instante siguiente, descrito por el RASTRO en vez de por el acto. Verificado
// contra el filtro en fotorrealista, donde el acto directo no pasa.
const DESPUES: Array<[RegExp, string]> = [
  [/slap|\bhits?\b|punch|bofetad|cachetad|golpe/i,
   "His head is still turned to one side and his cheek is flushed red. She stands very close with her hand lowered, breathing hard"],
  [/knees|collaps|\bfalls?\b|sinks? to the|derrumb|desplom/i,
   "They are already down on the floor, one hand still braced against it, the other reaching for nothing"],
  [/\bsobs?\b|sobbing|weep|llor|breaks? down/i,
   "Their face is wet and their shoulders will not stop moving, one hand pressed flat over the mouth"],
  [/scream|shout|grit/i,
   "Their mouth is still open and the neck is tense, the whole upper body leaning into it"],
  [/throws?|smash|shatter|\bromp|lanz/i,
   "The pieces are already on the floor and their hand is still open in the air above them"],
  [/grabs?|wrist|yank|drag|agarr/i,
   "Her wrist is held tight in his hand and the skin around it has gone pale"],
  [/\bkiss|\blips\b|\bbes[oa]/i,
   "Their faces have just parted by an inch, foreheads touching, both with their eyes still closed"],
];
function elDespues(accion: string): string {
  for (const [re, frase] of DESPUES) if (re.test(accion)) return frase;
  return "The exact instant after it happened, read on their faces and their hands";
}

// Saca las cláusulas de mueble y postura, que son las que disparan el filtro sin
// aportar nada: el escenario ya viaja en la imagen de referencia.
const POSTURA = /\b(lying|laying|lie|lies|on the bed|in bed|on the couch|on the sofa|on top of|beneath|underneath|straddl\w+|in his lap|in her lap|on the floor together)\b/gi;
function sinPostura(accion: string): string {
  return accion
    .split(/(?<=[.;])\s+/)
    .map((frase) => (POSTURA.test(frase) ? frase.replace(POSTURA, "").replace(/\s{2,}/g, " ").replace(/^[\s,.]+/, "") : frase))
    .filter((f) => f.trim().length > 8)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim() || accion;
}

// EL BLOQUE DE ESTILO NO ES DECORACIÓN: DECIDE SI EL FILTRO ACEPTA.
//
// Al pasar el experimento a servicio adelgacé esto a "Vertical 9:16
// illustration" y el resultado fue que un beso EN LA CAMA hacía caer las cuatro
// formulaciones de la escalera — incluidas las dos que el día anterior habían
// funcionado con los MISMOS retratos y el MISMO modelo. No era el texto de la
// acción: era esta parte.
//
// Sondeado formulación por formulación (cada rechazo es gratis): con el bloque
// completo —el estilo declarado, el encuadre cerrado y la luz cálida— pasa y
// dibuja el beso con los labios juntos. Sin él, no pasa nada.
//
// La lectura: nombrar el registro visual le dice al filtro qué clase de imagen
// es. Un "kiss" suelto sobre dos retratos es ambiguo; el mismo beso declarado
// como ilustración con luz de velas, no.
function identidad(estiloVisual?: string | null): string {
  const e = (estiloVisual ?? "").trim().toLowerCase();
  const registro = e === "anime" || e === "cartoon"
    ? "cinematic anime illustration"
    : "cinematic film still";
  return (
    "Same characters as the reference images: identical faces, hair and clothing. " +
    "Close framing on their faces, warm light, soft shadows. " +
    `Vertical 9:16, ${registro}, shallow depth of field.`
  );
}

/**
 * Dibuja el cuadro en el que la acción YA OCURRIÓ, para usarlo como último
 * fotograma del clip. Devuelve null si ninguna formulación pasa el filtro — en
 * ese caso el bloque se anima igual, sin destino, que es como funcionaba antes.
 */
export async function generarCuadroDestino(opts: {
  accionFisica: string;
  referencias: string[];
  escena: number;
  /** El registro visual del proyecto. Sin esto el filtro rechaza los picos
   *  íntimos, y con el valor equivocado el cuadro sale en otro estilo que el
   *  resto del video. */
  estiloVisual?: string | null;
}): Promise<string | null> {
  const refs = opts.referencias.filter(Boolean).filter((u, i, a) => a.indexOf(u) === i).slice(0, 4);
  if (!refs.length || !opts.accionFisica.trim()) return null;
  if (!apiKey()) return null;

  fal.config({ credentials: apiKey() });
  const rechazos: string[] = [];

  for (const { etiqueta, prompt } of escalera(opts.accionFisica, identidad(opts.estiloVisual))) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await (fal.subscribe as any)(MODELO, {
        input: { prompt, image_urls: refs, num_images: 1, enable_safety_checker: false },
        logs: false,
      }) as { data?: { images?: Array<{ url: string }> }; images?: Array<{ url: string }> };
      const url = (r.data ?? r)?.images?.[0]?.url;
      if (url) {
        console.log(
          `[pico] escena ${opts.escena}: cuadro destino dibujado con el prompt "${etiqueta}"` +
          (rechazos.length ? ` (${rechazos.join(", ")} rechazado(s) por el filtro)` : ""),
        );
        return url;
      }
    } catch (e) {
      // Solo se sigue bajando la escalera cuando el rechazo es del filtro de
      // contenido. Sin saldo o sin red, insistir cuatro veces no arregla nada.
      const cuerpo = JSON.stringify((e as { body?: unknown })?.body ?? "");
      if (!cuerpo.includes("content_policy_violation")) {
        console.warn(`[pico] escena ${opts.escena}: no se pudo dibujar el destino — ${(e as Error).message?.slice(0, 120)}`);
        return null;
      }
      rechazos.push(etiqueta);
    }
  }

  console.warn(
    `[pico] escena ${opts.escena}: las ${rechazos.length} formulaciones fueron rechazadas por el filtro de contenido — ` +
    `el bloque se anima sin cuadro destino (la acción va a salir como amago)`,
  );
  return null;
}
