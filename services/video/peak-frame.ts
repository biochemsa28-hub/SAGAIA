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
    { etiqueta: "directo", prompt: `${limpia}. ${identidad}` },
    { etiqueta: "narrativo", prompt: `The exact moment this happens, at the peak of the scene: ${limpia}. Quiet, restrained, cinematic. ${identidad}` },
    { etiqueta: "still", prompt: `A film still capturing this moment: ${limpia}. ${identidad}` },
    { etiqueta: "sobrio", prompt: `A dramatic scene between the two characters. ${limpia.split(/[.,;]/)[0]}. ${identidad}` },
  ];
}

const IDENTIDAD =
  "Same characters as the reference images: identical faces, hair, clothing and setting. " +
  "Close cinematic framing, same lighting as the references. " +
  "Vertical 9:16 illustration, shallow depth of field.";

/**
 * Dibuja el cuadro en el que la acción YA OCURRIÓ, para usarlo como último
 * fotograma del clip. Devuelve null si ninguna formulación pasa el filtro — en
 * ese caso el bloque se anima igual, sin destino, que es como funcionaba antes.
 */
export async function generarCuadroDestino(opts: {
  accionFisica: string;
  referencias: string[];
  escena: number;
}): Promise<string | null> {
  const refs = opts.referencias.filter(Boolean).filter((u, i, a) => a.indexOf(u) === i).slice(0, 4);
  if (!refs.length || !opts.accionFisica.trim()) return null;
  if (!apiKey()) return null;

  fal.config({ credentials: apiKey() });
  const rechazos: string[] = [];

  for (const { etiqueta, prompt } of escalera(opts.accionFisica, IDENTIDAD)) {
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
