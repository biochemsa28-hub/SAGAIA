// ¿Está roto este cuadro? — el último paso antes de animar una imagen.
//
// Medido en producción (anime, terror): la escena pedía "extreme close-up on her
// lips… the candle on the table in the background" y el modelo resolvió la
// contradicción como DOBLE EXPOSICIÓN: una cara gigante translúcida encima del
// salón. La imagen se animó y salió peor. Ni el detector de collage (busca
// costuras rectas) ni la puerta de continuidad (pregunta si es la misma persona)
// lo ven. Solo se ve MIRANDO la imagen, así que eso es lo que se hace: una
// pasada de visión, barata (miniatura de 384 px), con una sola pregunta —
// ¿hay algo en el cuadro que la escena no describe?
//
// Defectos que atrapa: doble exposición / cara superpuesta o transparente,
// silueta, figura, sombra humana o criatura de más, más personas que las
// descritas, collage o paneles, texto/letras. Ante la duda aprueba: un falso
// positivo cuesta una imagen; un falso negativo cuesta un clip.
export interface VeredictoCuadro {
  ok: boolean;
  defecto?: "doble_exposicion" | "figura_extra" | "duplicado" | "anatomia" | "collage" | "texto" | "utileria" | "otro";
  motivo?: string;
}

const CUADRO_GATE = (process.env.CUADRO_GATE ?? "on").toLowerCase();

async function miniaturaB64(url: string): Promise<{ data: string; media: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Sin ffmpeg acá: fal devuelve PNG/JPG de ~1–2 MB. Con imágenes >3 MB
    // se recorta el gasto simplemente no juzgando (aprobado por defecto).
    if (buf.length > 3_500_000) return null;
    const media = buf[0] === 0x89 ? "image/png" : buf[0] === 0xff ? "image/jpeg" : buf.slice(0, 4).toString() === "RIFF" ? "image/webp" : "image/jpeg";
    return { data: buf.toString("base64"), media };
  } catch { return null; }
}

export async function revisarCuadro(url: string, escena: string): Promise<VeredictoCuadro> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (CUADRO_GATE === "off" || !apiKey) return { ok: true };
  const img = await miniaturaB64(url);
  if (!img) return { ok: true };

  const pregunta =
    "Esta imagen es un fotograma generado para un microdrama. La escena que se pidió fue:\n" +
    `«${escena.slice(0, 700)}»\n\n` +
    "Decime SOLO si la imagen está ROTA de alguna de estas formas:\n" +
    "- doble_exposicion: una cara o cuerpo superpuesto, translúcido o fantasmal encima de otra imagen (dos capas).\n" +
    "- figura_extra: hay una persona, silueta, sombra humana, reflejo de persona o criatura que la escena NO describe, o hay MÁS personas de las que la escena nombra.\n" +
    "- duplicado: la MISMA persona aparece dos veces en el cuadro (por ejemplo de frente al fondo y además su hombro/espalda en primer plano con la misma ropa). MIRÁ LOS BORDES del cuadro: un hombro, una manga o una nuca en primer término, cortada por el borde, con la misma ropa o pelo que alguien que ya está al fondo, es un duplicado.\n" +
    "- anatomia: brazos, manos o piernas DE MÁS (tres o cuatro brazos, una mano que no es de nadie), dedos fundidos o deformes, caras o cuerpos deformados. Medido: una mujer sentada en la cama con cuatro brazos.\n" +
    "- collage: paneles, viñetas, cuadrícula o varias vistas lado a lado.\n" +
    "- texto: letras, palabras o logos legibles.\n" +
    "- utileria: un objeto de utilería que la escena NO describe pegado o flotando junto a la cara o el cuerpo — un micrófono de diadema o de solapa, un auricular, un cable. Medido: la actriz salió con un micrófono flotante pegado a los labios porque el guion decía 'confiesa a cámara'.\n" +
    "Estilo, calidad, ángulo, expresión, ropa, luz u objetos distintos NO cuentan. Una escena de terror con la amenaza parcial (una mano, una sombra fuera de foco) que la escena SÍ describe está bien. Ante la duda respondé ok=true.\n" +
    'Respondé SOLO este JSON: {"ok": true|false, "defecto": "doble_exposicion|figura_extra|duplicado|anatomia|collage|texto|otro", "motivo": "una frase"}';

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 150,
        system: "Respondé SOLO con JSON válido, sin markdown.",
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: img.media, data: img.data } },
            { type: "text", text: pregunta },
          ],
        }],
      }),
    });
    if (!res.ok) {
      console.warn("[cuadro] no se pudo revisar:", res.status);
      return { ok: true };
    }
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "{}";
    const m = /\{[\s\S]*\}/.exec(raw);
    const v = JSON.parse(m ? m[0] : "{}") as VeredictoCuadro;
    if (v.ok === false) return { ok: false, defecto: v.defecto ?? "otro", motivo: v.motivo };
    return { ok: true };
  } catch (e) {
    console.warn("[cuadro] error:", e instanceof Error ? e.message.slice(0, 120) : e);
    return { ok: true };
  }
}

// Lo que se le agrega al prompt cuando el primer intento salió roto.
export function ordenDeCuadroLimpio(defecto?: VeredictoCuadro["defecto"]): string {
  const base = " SINGLE EXPOSURE, ONE clean shot: only the people and objects the scene describes, fully opaque, NO superimposed, transparent or ghosted faces, NO extra people, silhouettes, human shadows, reflections of people or creatures, NO split panels, NO text or letters.";
  if (defecto === "doble_exposicion") return base + " If the scene asks for a close-up, frame the close-up ONLY — do not layer it over a wide shot.";
  if (defecto === "duplicado") return base + " Each person appears EXACTLY ONCE in the frame: if someone is seen from behind in the foreground, they are NOT also standing in the background.";
  if (defecto === "anatomia") return base + " Correct anatomy: each person has exactly two arms, two hands with five fingers, two legs; no stray limbs; if someone is seen from behind in the foreground, show only their shoulder and head, not their arms.";
  if (defecto === "utileria") return base + " NO microphone, headset, lavalier, earpiece, cable or any recording equipment anywhere in the frame — the person speaks naturally with nothing attached to their face or clothes.";
  return base;
}
