import { fal } from "@fal-ai/client";
import { writeFileSync, mkdirSync } from "fs";
import { join, isAbsolute, resolve } from "path";
import { getStyleConfig, type StyleConfig } from "./style-presets";
import { esCollage } from "@/services/quality/collage";
import { revisarCuadro, ordenDeCuadroLimpio } from "@/services/quality/cuadro";
import { logPayload } from "./log-payload";

export interface ImageGenerationResult {
  success: boolean;
  filePath?: string;
  url?: string;
  sceneNumber?: number;
  durationMs?: number;
  error?: string;
  mock?: boolean;
}

export interface SceneImageResult extends ImageGenerationResult {
  sceneNumber: number;
}

function getStorageDir(): string {
  if (process.env.VERCEL) return "/tmp/storage";
  const raw = process.env.STORAGE_PATH ?? "./storage";
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

// Turn a scene emotion (usually written in Spanish by the story AI) into concrete
// ENGLISH photographic direction — how that feeling should LOOK in the frame.
// Substring matching keeps it robust against long phrases like "horror de lo imposible".
const EMOTION_VISUAL: Array<[RegExp, string]> = [
  [/terror|miedo|horror|panico|pánico|dread/i, "raw visible fear in the eyes, tense jaw, body frozen mid-motion, cold desaturated shadows swallowing the edges of the frame"],
  [/suspens|tensi|inquiet|nervios/i, "held breath, alert eyes scanning off-frame, taut posture, deep shadows and one hard light source"],
  [/revelaci|compren|descubr|dar[sn]e cuenta|shock|sorpres/i, "the exact instant of realization, eyes widening, lips parting, blood draining from the face"],
  [/traici|engan|engaño|rabia|ira|furia/i, "jaw clenched, eyes burning, controlled fury, harsh directional light carving the face"],
  [/trist|duelo|dolor|perdida|pérdida|llanto/i, "grief weighing the whole body down, glassy eyes, soft desaturated light, hollow gaze"],
  [/amor|ternur|intim|cariñ|carin/i, "warm intimate closeness, soft golden light, gentle unguarded expression, shallow dreamy focus"],
  [/esperanz|alivio|triunf|orgullo|inspira/i, "light breaking across the face, chin lifting, quiet strength, warm hopeful glow"],
  [/culpa|verguenz|vergüenz|arrepent/i, "eyes cast down, shoulders curled inward, face half in shadow"],
  [/urgenc|accion|acción|escape|huid|correr/i, "caught mid-action with motion energy, off-balance stance, dynamic angle"],
  [/soledad|vacio|vacío|abandon/i, "small figure isolated in a large empty frame, cold negative space around them"],
];
function emotionToVisualDirection(emotion?: string): string | null {
  if (!emotion) return null;
  for (const [re, direction] of EMOTION_VISUAL) if (re.test(emotion)) return direction;
  return "emotionally charged expression, cinematic dramatic lighting";
}

// El cuadro se genera al TAMAÑO FINAL del video. Cada escalado intermedio cuesta
// nitidez en lo que el espectador mira de cerca —la cara— y encadenábamos tres:
// imagen 576×1024 → clip 720p → montaje 1080×1920.
// Se puede bajar con IMAGE_WIDTH/IMAGE_HEIGHT si un endpoint cobra por píxel.
const IMAGE_SIZE = {
  width: Math.max(512, Number(process.env.IMAGE_WIDTH ?? 1080) || 1080),
  height: Math.max(512, Number(process.env.IMAGE_HEIGHT ?? 1920) || 1920),
};

// RETRY-ONLY fallback: runs when a prompt fails to generate. The old version
// gutted the scene ("knife" → "object", "demon" → "mysterious figure"), which is
// why retried horror shots came back toothless. Now it swaps only the few literal
// terms that trip generators, and REPLACES them with stronger cinematic horror
// language — dread, presence, implication — which is both scarier and renders far
// better on Flux than explicit gore ever would.
function softenPrompt(prompt: string): string {
  return prompt
    .replace(/\b(gore|mutilated|dismembered)\b/gi, "harrowing aftermath implied in shadow")
    .replace(/\b(blood|bloody|bleeding)\b/gi, "dark glistening stain")
    .replace(/\b(corpse|dead body)\b/gi, "motionless figure")
    .replace(/\b(murder|kill|killing)\b/gi, "the unspeakable act, unseen")
    .replace(/\b(demon|devil|satan)\b/gi, "malevolent entity")
    .replace(/\b(suicide)\b/gi, "irreversible moment")
    // Keep weapons — they're standard thriller iconography — just frame them
    // cinematically instead of removing them.
    .replace(/\b(knife|blade)\b/gi, "blade catching the light")
    + ", intense atmospheric horror, palpable dread, deep shadows, cinematic tension, film still, "
    + "only the people and objects the scene describes — no added figures";
}

async function generateMock(projectId: string, sceneNumber: number): Promise<ImageGenerationResult> {
  const dir = join(getStorageDir(), "images", projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${sceneNumber}.png`);
  writeFileSync(filePath, Buffer.from("PNG_PLACEHOLDER"));
  return { success: true, filePath, url: "/placeholder.png", mock: true, durationMs: 0 };
}

// Pull the image URL out of fal's response regardless of SDK wrapper shape.
function extractUrl(result: unknown): string | null {
  const obj = result as Record<string, unknown>;
  const data = (obj?.["data"] ?? obj) as Record<string, unknown>;
  const images = data?.["images"] as Array<Record<string, unknown>> | undefined;
  return (images?.[0]?.["url"] as string) ?? null;
}

async function callFlux(prompt: string, style: StyleConfig, seed?: number): Promise<string | null> {
  try {
    // Flux Pro Ultra / Imagen use a DIFFERENT param shape (aspect_ratio, no steps/loras).
    const isProUltra = /flux-pro|flux\/v1\.1|\/ultra|imagen/i.test(style.model);
    let input: Record<string, unknown>;

    if (isProUltra) {
      // Premium endpoints: sharper, more cinematic, no LoRA/steps params.
      input = {
        prompt,
        aspect_ratio: "9:16",
        num_images: 1,
        enable_safety_checker: false,
        safety_tolerance: "6",
        raw: false,                       // false = more polished/aesthetic
      };
    } else {
      input = {
        prompt,
        // Style-aware: the photographic list bans "anime, cartoon, illustration",
        // which would actively sabotage an illustrated render. Drawn styles get
        // their own negatives (photoreal look, 3D, broken linework) instead.
        negative_prompt: style.illustrated
          ? "text, letters, words, writing, typography, caption, watermark, logo, signature, " +
            "gibberish text, garbled letters, " +
            "photorealistic, photograph, realistic skin pores, 3d render, CGI, live action footage, " +
            "blurry, low quality, jpeg artifacts, bad anatomy, deformed hands, extra fingers, " +
            "malformed limbs, messy sketchy linework, muddy washed-out colors, " +
            "flat lifeless shading, off-model face, inconsistent art style"
          : // Text artifacts first — AI loves inventing garbled fake labels/captions
            // on products and packaging, which instantly reads as "AI slop".
            "text, letters, words, writing, typography, caption, subtitle, label text, " +
            "gibberish text, garbled letters, fake writing, watermark, logo, signature, " +
            "plastic skin, waxy face, overly smooth skin, symmetrical face, CGI, 3D render, " +
            "cartoon, illustration, painting, anime, artificial lighting, studio background, " +
            "blurry hands, extra fingers, deformed hands, " +
            "oversaturated, overexposed, blown out highlights, flat lighting, unnatural colors, " +
            "fake bokeh, AI generated look, uncanny valley, doll-like, perfect skin",
        // RESOLUCIÓN NATIVA DEL VIDEO, no un preset.
        //
        // "portrait_16_9" son 576×1024 en fal: poco más de la mitad de los
        // píxeles del video que publicamos (1080×1920). Ese cuadro se lo comía
        // Seedance, que animaba a 720p, y el montaje lo estiraba a 1080. Tres
        // escalados encadenados — y el detalle que se pierde es justo el que se
        // mira: piel, tela, pelo, ojos.
        //
        // Pedir el tamaño final desde el principio cuesta lo mismo por imagen en
        // los endpoints por-imagen y elimina los tres escalados de una vez.
        image_size: IMAGE_SIZE,
        num_inference_steps: style.loras.length > 0 ? 40 : 32,
        guidance_scale: 4.5,
        num_images: 1,
        enable_safety_checker: false,
        safety_tolerance: "6",
      };
      if (typeof seed === "number") input["seed"] = seed;
      if (style.loras.length > 0) input["loras"] = style.loras;
    }

    logPayload("escena·flux", style.model, input);
    const result = await fal.subscribe(style.model, { input, logs: false });
    const url = extractUrl(result);
    console.log("[fal.ai] model:", style.model, "ultra:", isProUltra, "url:", url ?? "null");
    return url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const body = (e as Record<string, unknown>)?.["body"];
    const status = (e as Record<string, unknown>)?.["status"];
    // JSON.stringify(undefined) returns undefined, so this line used to throw
    // INSIDE the catch and replaced the real fal error with "cannot read slice
    // of undefined" — an error handler that crashes destroys the only evidence
    // you had, and the log then blames fal for our own null.
    console.error("[fal.ai callFlux error]", { status, msg, body: String(JSON.stringify(body) ?? "").slice(0, 300) });
    return null;
  }
}

// Character-consistent generation: edit a REFERENCE image (the saved character or
// scene 1) into a new scene while keeping the same person/face/outfit. Default model
// is nano-banana edit (best-in-class character consistency). Returns null on any
// failure so the caller can gracefully fall back — never crashes the pipeline.
// Reescribe un prompt para que pase moderación SIN perder la escena. No suaviza
// el drama: cambia cómo se nombra el vestuario y el cuerpo por descripciones de
// ropa concreta. Un plano de alguien devastado en la cama sigue siendo eso —
// deja de describirse por lo que no lleva puesto.
//
// Existe porque el fallo es carísimo: cuando la llamada con el retrato se rechaza,
// el sistema cae a un modelo sin referencia que inventa una persona nueva, y el
// personaje cambia de cara a mitad de la historia. Una palabra no puede costar eso.
const SUAVIZADO: Array<[RegExp, string]> = [
  [/\b(nude|naked|topless|undressed|unclothed)\b/gi, "wearing a plain slip dress"],
  [/\b(bare (?:chest|breasts|torso|skin))\b/gi, "collar of a cotton shirt"],
  [/\b(lingerie|underwear|bra|panties)\b/gi, "simple cotton nightwear"],
  [/\b(cleavage|breasts|bosom)\b/gi, "neckline"],
  [/\b(seductive|sensual|erotic|sultry|provocative)\b/gi, "emotionally charged"],
  [/\b(wrapped (?:only )?in a (?:towel|sheet|bedsheet))\b/gi, "in a long bathrobe"],
  [/\b(sheet(?:s)? barely covering)\b/gi, "blanket pulled up over"],
  [/\b(thighs|bare legs)\b/gi, "hands"],
  [/\b(intimate|in bed together|post[- ]coital)\b/gi, "sitting close, tense"],
  // ROPA MOJADA. Medido en una producción real de terror: "grey cotton t-shirt
  // SOAKED THROUGH with sweat" fue rechazada con content_policy_violation. La
  // escena era un hombre despertándose asustado — nada íntimo—, pero la ropa
  // empapada lee como sugerente para el filtro. Y el guion la escribe sola,
  // porque el sudor es la forma natural de mostrar miedo.
  [/\b(soaked through|drenched|clinging wet|wet and clinging|see[- ]through)\b/gi, "damp"],
  [/\b(sweat[- ]soaked|dripping with sweat)\b/gi, "damp with sweat"],
  // ── LA ESCENA DE CAMA ─────────────────────────────────────────────────────
  // Medido en una producción real de infidelidad descubierta: el filtro rechazó
  // "dark hair falling over her BARE SHOULDERS, a white linen SHEET PULLED…" y
  // "white linen shirt HANGING OPEN and DISHEVELED, sitting on the edge of the
  // bed". La lista cubría "bare chest" y "sheet barely covering", pero no estas.
  //
  // Y es el vocabulario natural del género: el drama de traición ocurre en una
  // habitación, y el guion lo escribe así porque así se escribe.
  [/\b(bare (?:shoulders?|arms?|back|feet|midriff))\b/gi, "shoulders"],
  [/\b(sheet(?:s)? (?:pulled|clutched|held) (?:up )?(?:over|to|against)[^,.]*)/gi, "a blanket held close"],
  [/\b(hanging open|unbuttoned|half[- ]open|falling off (?:one )?shoulder)\b/gi, "loose"],
  [/\b(dishevell?ed|tousled|rumpled from|tangled (?:in|across))\b/gi, "untidy"],
  [/\b(?:in|on) (?:the )?(?:rumpled|unmade|messy) bed\b/gi, "in the room"],
  [/\b(straddling|astride|on top of (?:him|her))\b/gi, "close to"],
];

export function suavizarParaModeracion(prompt: string): string {
  let out = prompt;
  for (const [re, rep] of SUAVIZADO) out = out.replace(re, rep);
  return out;
}

// Quita el tramo que describe el CUERPO y la ROPA del personaje, y deja el resto
// de la escena. El image_prompt se escribe por segmentos separados por comas:
//   [nombre, rasgo, ropa, LA ACCIÓN], [lugar + detalles], [primer plano], [luz]
// Los adjetivos de vestuario y anatomía son los que disparan la moderación, y
// son justamente los que el RETRATO ya aporta mejor que cualquier frase.
const DESCRIPCION_DE_CUERPO =
  // Lista AMPLIA de prendas. Medido en un video: "light blue camisole" y "red
  // tank top" no estaban acá, sobrevivían en el texto y le ganaban al retrato
  // — la protagonista alternó TRES atuendos en 16 cuadros. Cualquier palabra de
  // ropa que quede en el prompt es una puerta a la deriva.
  /\b(?:[\w-]+\s+){0,3}(shirt|t-shirt|tee|blouse|(?:tank|crop|halter|silk|cotton|satin|red|blue|black|white|green|pink|grey|gray|yellow|purple|lilac|lavender|beige|cream|navy)[ -]?top|camisole|cami|dress|gown|robe|pyjamas?|pajamas?|pj'?s|nightgown|nightshirt|nightie|trousers|pants|jeans|shorts|leggings|skirt|sweater|sweatshirt|hoodie|cardigan|pullover|jumper|vest|coat|jacket|blazer|suit|tie|scarf|shawl|apron|uniform|overalls|slip|lingerie|underwear|bra|swimsuit|bikini|hat|cap|beanie|hood|glasses|sunglasses|sneakers|boots|heels|sandals|socks|torso|chest|cleavage|shoulders|thighs|legs|skin|body|hair)\b(?:\s+[\w-]+){0,4}/gi;

// Lo ÚNICO que se conserva en el último recurso: qué siente. Sin esto el retrato
// sale neutro y la escena pierde la emoción además del lugar; con esto al menos
// la cara actúa lo que la escena pedía.
const EMOCIONES: Array<[RegExp, string]> = [
  [/\b(cry|crying|tears|weeping|sobbing)\b/i, "Their face is wet with tears."],
  [/\b(terror|terrified|horror|afraid|fear|scared)\b/i, "Their eyes are wide with fear."],
  [/\b(rage|furious|anger|angry|shouting|screaming)\b/i, "Their jaw is tight with anger."],
  [/\b(betray|shock|shocked|disbelief|stunned|frozen)\b/i, "They are frozen, unable to believe it."],
  [/\b(shame|ashamed|guilt|guilty|humiliat)/i, "They cannot meet anyone's eyes."],
  [/\b(tender|love|longing|desire|intimate)\b/i, "Their expression is open and unguarded."],
  // \w* y no \b: "plead" con límite de palabra NO reconoce "pleadING", que es la
  // forma en que un guion lo escribe siempre. Es el mismo error de sufijo que ya
  // apareció con "slips"/"lips" y con "tears … off".
  [/\b(plead\w*|begg\w*|desperat\w*|despair\w*)\b/i, "They are pleading, on the edge of breaking."],
];
function emocionDe(prompt: string): string {
  for (const [re, frase] of EMOCIONES) if (re.test(prompt)) return frase;
  return "A tense, dramatic expression.";
}

export function sinDescripcionDePersonaje(prompt: string): string {
  const partes = prompt.split(",");
  const limpias = partes.map((p) => p.replace(DESCRIPCION_DE_CUERPO, "")
    // el rastro que deja quitar la prenda: "wearing a", "dressed in", "in a"
    .replace(/\b(wearing|dressed in|clad in|in)\s+(a|an|the|his|her|their)?\s*$/i, "")
    .replace(/\s{2,}/g, " ").trim());
  const util = limpias.filter((p) => p.length > 3);
  if (!util.length) return prompt;
  return (
    util.join(", ") +
    ". The character in this scene is exactly the person in the reference image: same face, same hair, same clothing."
  );
}

async function callReference(prompt: string, referenceUrl: string, extraImages?: string[]): Promise<string | null> {
  const model = process.env.CHARACTER_REF_MODEL ?? "fal-ai/nano-banana/edit";
  // nano-banana / gemini edit models take an `image_urls` ARRAY; flux-kontext
  // takes a single `image_url`. Send the right shape for the configured model.
  const isNanoOrGemini = /nano-banana|gemini/i.test(model);
  // Pass ALL product angles to nano-banana (dedup, cap at 4) so it reconstructs the
  // real product faithfully from multiple views. flux-kontext only takes one.
  const allImages = [referenceUrl, ...(extraImages ?? [])].filter((u, i, a) => u && a.indexOf(u) === i).slice(0, 4);
  const armar = (imgs: string[], p: string): Record<string, unknown> => isNanoOrGemini
    ? { prompt: p, image_urls: imgs, num_images: 1, enable_safety_checker: false }
    : { prompt: p, image_url: imgs[0] ?? referenceUrl, num_images: 1, guidance_scale: 3.5, safety_tolerance: "6", enable_safety_checker: false };

  // Cuando esta llamada falla, el que llama cae a flux — y flux no tiene el
  // retrato, así que INVENTA una persona nueva. Ese es exactamente el defecto que
  // se ve al mirar el video: la protagonista cambia de cara a mitad de la historia.
  // Medido en producción: "reference failed for scene 5, falling back to flux".
  //
  // Así que antes de rendirse se reintenta DENTRO del camino de referencia, con
  // menos imágenes. Una hoja de personaje inaccesible o un lote que el modelo
  // rechaza no deberían costar la identidad del personaje en toda la escena.
  const intentos: Array<{ imgs: string[]; prompt: string; nota: string }> = [
    { imgs: allImages, prompt, nota: `${allImages.length} imagen(es)` },
  ];
  if (allImages.length > 1) intentos.push({ imgs: [referenceUrl], prompt, nota: "solo el retrato" });
  // Tercer intento: el mismo plano, descrito sin los términos que disparan la
  // moderación. Un 422 que aparece en UNA escena y no en las otras casi siempre
  // es el prompt, no la configuración — y perder la cara del personaje por una
  // palabra es el peor cambio posible. La escena se conserva: lo que cambia es
  // cómo se nombra el vestuario.
  const suave = suavizarParaModeracion(prompt);
  if (suave !== prompt) intentos.push({ imgs: [referenceUrl], prompt: suave, nota: "prompt reformulado" });

  // ÚLTIMO INTENTO: la escena SIN describir al personaje.
  //
  // El suavizado reemplaza términos conocidos, pero el filtro rechaza cosas que
  // ninguna lista anticipa — y cada rechazo cuesta la cara del personaje, que es
  // lo más caro que puede perder este pipeline.
  //
  // Y hay algo que hace este intento casi gratis: la descripción del cuerpo y la
  // ropa es REDUNDANTE con el retrato. El retrato ya va como referencia y ya dice
  // cómo se ve; describirlo otra vez en palabras no agrega identidad, solo agrega
  // superficie para que el filtro se enganche. Medido: un "grey cotton t-shirt
  // soaked through with sweat" tiró una escena entera de terror.
  //
  // Así que se conserva el LUGAR, la ACCIÓN y la LUZ —lo que la foto no tiene— y
  // se delega la apariencia a la referencia. Un plano con el vestuario descrito a
  // medias es infinitamente mejor que uno con otra persona adentro.
  const soloEscena = sinDescripcionDePersonaje(prompt);
  if (soloEscena !== prompt) {
    intentos.push({ imgs: [referenceUrl], prompt: soloEscena, nota: "sin describir al personaje" });
  }

  // ── EL MÍNIMO: la cara y nada más ────────────────────────────────────────
  //
  // El peldaño de arriba se quedaba a mitad de camino. Quitaba la ROPA pero
  // dejaba el MOBILIARIO y la POSTURA, y en una escena de infidelidad el
  // disparador no es la camisa: es "la cama de sábanas revueltas" y "sentado en
  // el borde". Medido — cinco intentos rechazados en fila y dos personajes
  // perdiendo la cara.
  //
  // Este intento tira todo salvo lo único que no se puede reemplazar: QUIÉN es y
  // QUÉ SIENTE. Sin lugar, sin muebles, sin postura, sin ropa. Sale un retrato
  // en vez de una escena — peor plano, sin duda.
  //
  // Pero la alternativa real no es "una escena mejor": es caer a flux, que no
  // tiene el retrato y dibuja A OTRA PERSONA. Y eso ya no se arregla en ningún
  // paso posterior, porque el video entero queda con dos protagonistas.
  //
  // Un plano pobre con la cara correcta se salva en el montaje. Una cara
  // equivocada no se salva nunca.
  intentos.push({
    imgs: [referenceUrl],
    prompt:
      "Portrait of the exact person in the reference image: identical face, hair and clothing. " +
      `${emocionDe(prompt)} Vertical 9:16, cinematic, shallow depth of field, plain dark background.`,
    nota: "solo la cara (último recurso)",
  });

  let ultimo = "";
  for (const [k, intento] of intentos.entries()) {
    try {
      // "un solo cuadro": con varias referencias el modelo a veces devuelve
      // una grilla de paneles. Se pide explícito y se COMPRUEBA abajo.
      const unSoloCuadro = " ONE single continuous frame — NOT a collage, no split panels, no grid, no multiple views side by side.";
      const payload = armar(intento.imgs, intento.prompt + unSoloCuadro);
      logPayload(`escena·referencia (${intento.nota})`, model, payload);
      const result = await fal.subscribe(model, { input: payload, logs: false });
      const url = extractUrl(result);
      if (url) {
        // ── ¿SALIÓ UN COLLAGE? ─────────────────────────────────────────
        // Medido en un video terminado: tres paneles en un cuadro (la pareja
        // arriba, la espalda y la taza abajo) y el clip lo animó tal cual. Si
        // hay costura, se descarta y se sigue con el intento siguiente, que
        // trae menos referencias.
        const c = await esCollage(url);
        if (c.collage) {
          console.warn(`[fal.ai] reference devolvió un COLLAGE (${c.motivo}) con ${intento.nota} — se descarta y se reintenta con menos referencias`);
          ultimo = "collage";
          continue;
        }
        if (k > 0) console.log(`[fal.ai] reference recuperada al reintentar con ${intento.nota}`);
        console.log("[fal.ai] reference model:", model, "url:", url);
        return url;
      }
      ultimo = "sin url en la respuesta";
    } catch (e) {
      // El cuerpo, no solo el mensaje. "Unprocessable Entity" a secas no dice NADA:
      // puede ser un parámetro que el modelo no acepta, una URL que no se pudo
      // descargar, o el prompt rechazado por moderación — tres causas con tres
      // arreglos distintos. La función de al lado ya registraba el body; ésta no,
      // y por eso el fallo mas caro del pipeline fue opaco durante días.
      const msg = e instanceof Error ? e.message : String(e);
      const body = (e as Record<string, unknown>)?.["body"];
      const status = (e as Record<string, unknown>)?.["status"];
      ultimo = msg;
      console.error("[fal.ai callReference error]", {
        status, msg: msg.slice(0, 160), intento: intento.nota,
        body: String(JSON.stringify(body) ?? "").slice(0, 400),
      });
    }
  }
  console.error(`[fal.ai] reference agotó los reintentos (${ultimo.slice(0, 80)}) — el que llama va a perder la cara del personaje`);
  return null;
}

// Second-pass creative upscaler — adds micro-detail that Flux's base run lacks:
// skin pores, fabric texture, authentic film grain, sharp edges.
// Uses fal-ai/clarity-upscaler (creative upscale, not just interpolation).
// Returns the enhanced URL or null so the caller can fall back gracefully.
async function callClarityUpscale(imageUrl: string, prompt: string): Promise<string | null> {
  try {
    const result = await fal.subscribe("fal-ai/clarity-upscaler", {
      input: {
        image_url: imageUrl,
        prompt,                      // guides detail-generation in the upscale pass
        upscale_factor: 2,           // 2× (keeps cost manageable vs 4×)
        creativity: 0.3,             // low creativity = faithful, high detail, not AI-hallucinated
        resemblance: 0.85,           // stay close to the original composition
        guidance_scale: 4,
        num_inference_steps: 18,
        enable_safety_checker: false,   // sin censura también en el realce
      },
      logs: false,
    });
    const obj = (result as Record<string, unknown>);
    const data = (obj?.["data"] ?? obj) as Record<string, unknown>;
    // ClarityUpscalerOutput → { image: { url: string } }
    const url = ((data?.["image"] as Record<string, unknown>)?.["url"] as string) ?? null;
    return url;
  } catch (e) {
    console.error("[fal.ai clarity-upscaler]", e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function generateReal(params: {
  prompt: string;
  projectId: string;
  sceneNumber: number;
  niche: string;
  visualStyle: string;
  seed?: number;
  referenceImageUrl?: string;
  referenceImageUrls?: string[];
  // Foto de OTRA escena del mismo lugar (ya generada). Va como ÚLTIMA imagen
  // de referencia y el prompt le dice al modelo que ese es el decorado: mismas
  // paredes, muebles, objetos y luz. Sin esto cada plano inventaba su propia
  // versión de "la cocina" y el video se veía como clips pegados.
  setReferenceUrl?: string;
  emotion?: string;
  narrationText?: string;
}): Promise<ImageGenerationResult> {
  const { sceneNumber, niche, visualStyle, seed, referenceImageUrl } = params;
  const projectId = params.projectId;
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY not set");

  fal.config({ credentials: apiKey });
  const t0 = Date.now();

  const style = getStyleConfig(niche, visualStyle);

  // Enrich with the scene's emotion translated into ENGLISH photographic direction.
  // (Raw Spanish emotion words and raw dialogue are NOT injected: Flux is trained on
  // English and would either ignore them or try to render the text into the frame.)
  let prompt = params.prompt;
  const emoDirection = emotionToVisualDirection(params.emotion);
  if (emoDirection) prompt += `, ${emoDirection}`;

  let imageUrl: string | null = null;

  const generarUnaVez = async (extraOrden: string): Promise<string | null> => {
  let imageUrl: string | null = null;
  // Path A: subject-consistent — edit the reference image into this new scene.
  // Subject-agnostic wording so it preserves BOTH a recurring character's face AND
  // a user-uploaded product's exact look/branding (for ads).
  if (referenceImageUrl) {
    // Lead with the NEW dramatic moment (edit models weight early tokens most), then
    // constrain identity. Leading with "keep identical" froze the composition and made
    // every scene look like a re-render of the reference instead of the story moving.
    //
    // SIN LA ROPA NI EL CUERPO EN EL TEXTO — desde el PRIMER intento, no como
    // último recurso. Medido en dos videos: la camisa del hombre iba y volvía
    // (verde ↔ azul a cuadros) plano a plano, porque el guionista re-describe el
    // vestuario en cada image_prompt con palabras distintas y el modelo obedece
    // al texto por encima del retrato. La ropa YA está en la referencia y ahí
    // es siempre la misma; en el texto es una fuente de deriva y de rechazos del
    // filtro. Lo que el texto aporta —lugar, acción, encuadre, luz, emoción— se
    // conserva; lo que la foto ya trae —cara, pelo, ropa— se delega a la foto.
    // El video que el usuario aprobó como "perfecto" tenía justamente eso: bata
    // blanca y camisa azul idénticas en los 8 planos.
    const escena = sinDescripcionDePersonaje(prompt);
    const conSet = Boolean(params.setReferenceUrl);
    const notaSet = conSet
      ? " THE LAST reference image shows THE SET where this scene happens: keep the SAME room/place — same walls, furniture, objects, colors, light source and time of day, as if shot minutes later on the same set. Only the camera angle/framing and the person's action change; do NOT redesign or redecorate the location."
      : "";
    const refPrompt = `A completely NEW scene showing this exact moment: ${escena}. IMPORTANT: the person/product must be the SAME one from the reference image — identical face, hair, features, CLOTHING and colors, wearing exactly the same outfit as in the reference — but in this new pose, action, framing${conSet ? "" : " and location"}. Do not reuse the reference's composition.${notaSet}${extraOrden} ${style.promptSuffix}`;
    const extras = conSet
      ? [...(params.referenceImageUrls ?? []).slice(0, 2), params.setReferenceUrl!]
      : params.referenceImageUrls;
    imageUrl = await callReference(refPrompt, referenceImageUrl, extras);
    if (!imageUrl) console.log(`[fal.ai] reference failed for scene ${sceneNumber}, falling back to flux`);
  }

  // Path B: plain generation (also the fallback if the reference edit failed)
  if (!imageUrl) {
    const styledPrompt = `${prompt}, ${style.promptSuffix}${extraOrden}`;
    imageUrl = await callFlux(styledPrompt, style, seed);
    if (!imageUrl) {
      console.log(`[fal.ai] Retrying scene ${sceneNumber} with softened prompt`);
      imageUrl = await callFlux(`${softenPrompt(prompt)}, ${style.promptSuffix}`, style, seed);
    }
  }

  // Path C: safety net — if a LoRA (e.g. the realism layer) was set but failed,
  // drop all LoRAs and generate on plain flux/dev so a bad LoRA URL never blocks
  // the image (we still get full cinematic quality, just without the LoRA).
  if (!imageUrl && style.loras.length > 0) {
    console.log(`[fal.ai] LoRA path failed for scene ${sceneNumber}, retrying on flux/dev without LoRAs`);
    const noLoraStyle: StyleConfig = { ...style, loras: [], model: "fal-ai/flux/dev", numInferenceSteps: 28 };
    imageUrl = await callFlux(`${prompt}, ${style.promptSuffix}`, noLoraStyle, seed);
  }
  return imageUrl;
  };

  imageUrl = await generarUnaVez("");
  if (!imageUrl) throw new Error("fal.ai returned no image after retry");

  // ── ÚLTIMO PASO: ¿ESTÁ ROTO EL CUADRO? ─────────────────────────────────────
  // Una pasada de visión mira la imagen antes de darla por buena. Medido: una
  // cara gigante translúcida sobre el salón (doble exposición) pasó todos los
  // filtros de píxeles y se animó. Si está rota, se regenera UNA vez con la
  // orden explícita; si la segunda también sale rota, se queda la segunda y se
  // avisa — reintentar más solo quema dinero.
  {
    const v = await revisarCuadro(imageUrl, sinDescripcionDePersonaje(prompt));
    if (!v.ok) {
      console.warn(`[cuadro] escena ${sceneNumber} rota (${v.defecto}): ${v.motivo ?? ""} — regenerando una vez`);
      const otra = await generarUnaVez(ordenDeCuadroLimpio(v.defecto));
      if (otra) {
        const v2 = await revisarCuadro(otra, sinDescripcionDePersonaje(prompt));
        if (v2.ok) console.log(`[cuadro] escena ${sceneNumber} corregida en el segundo intento`);
        else console.warn(`[cuadro] escena ${sceneNumber} sigue rota (${v2.defecto}): ${v2.motivo ?? ""} — se usa el segundo intento`);
        imageUrl = otra;
      }
    }
  }

  // Second pass — creative upscale: adds micro-detail (pores, fabric texture,
  // light grain) that Flux's base 28-step run lacks. Controlled by IMAGE_UPSCALE=on.
  // Doubles cost + ~8s latency, but the jump in perceived realism is significant.
  if (process.env.IMAGE_UPSCALE === "on") {
    const enhanced = await callClarityUpscale(imageUrl, prompt);
    if (enhanced) {
      console.log(`[fal.ai] upscale OK → scene ${sceneNumber}`);
      imageUrl = enhanced;
    } else {
      console.log(`[fal.ai] upscale failed for scene ${sceneNumber} — using base image`);
    }
  }

  // Download and save
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const dir = join(getStorageDir(), "images", projectId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `scene_${sceneNumber}.jpg`);
  writeFileSync(filePath, buffer);

  return { success: true, filePath, url: imageUrl, durationMs: Date.now() - t0 };
}

export async function generateSceneImage(params: {
  prompt: string;
  projectId: string;
  sceneNumber: number;
  niche: string;
  visualStyle: string;
  seed?: number;
  referenceImageUrl?: string;
  referenceImageUrls?: string[];
  setReferenceUrl?: string;
  emotion?: string;
  narrationText?: string;
}): Promise<ImageGenerationResult> {
  const isMock = process.env.FORCE_MOCK_IMAGE === "true" || !process.env.FAL_API_KEY;
  if (isMock) return generateMock(params.projectId, params.sceneNumber);

  try {
    return await generateReal(params);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[fal.ai]", error);
    return { success: false, error };
  }
}

// Extract a compact character+palette anchor from scene 1's prompt.
// The AI always opens image_prompt with "[Character name, physical traits], [palette X, Y, Z]"
// — we grab the first ~120 chars and prepend them to scenes 2+ so Flux sees the same
// character reference on every generation.
// Tolerates a missing prompt: a scene whose image_prompt came back empty used to
// crash EVERY image in the batch with "cannot read slice of undefined". The
// anchor is read from the FIRST scene of the batch, so one bad scene took down
// all fourteen — and the log blamed fal for our own null.
function extractCharacterAnchor(firstPrompt: string | null | undefined): string {
  if (!firstPrompt) return "";
  // Grab up to 120 chars, stopping at a sentence boundary if possible
  const snippet = firstPrompt.slice(0, 140);
  const stopAt = Math.max(
    snippet.lastIndexOf(","),
    snippet.lastIndexOf("."),
  );
  return stopAt > 40 ? snippet.slice(0, stopAt) : snippet;
}

// Run an async mapper over items with a max number running at once.
// Keeps us fast without tripping fal.ai rate limits (429).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

// How many images to generate in parallel. Tunable via env for rate-limit headroom.
const IMAGE_CONCURRENCY = Math.max(1, Number(process.env.IMAGE_CONCURRENCY ?? 3) || 3);

// Stable per-project seed so the same project always re-rolls the same visual
// "look" (helps consistency + makes regeneration predictable).
function stableSeed(projectId: string): number {
  let h = 0;
  for (let i = 0; i < projectId.length; i++) h = (h * 31 + projectId.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

// ── Character bible (multi-view reference sheet) ─────────────────────────────
// One 2x2 sheet showing the SAME character from several angles and expressions,
// generated from the portrait the user already approved. A single portrait gives
// the edit model one viewpoint and it has to invent the rest; a sheet gives it the
// face from multiple angles, which holds identity far better across scenes and
// across episodes. Generated ONCE per character (~$0.06) and reused forever.
// Returns null on any failure — the pipeline simply falls back to the portrait.
export async function generateCharacterBible(params: {
  portraitUrl: string;
  description: string;
  niche: string;
  visualStyle: string;
}): Promise<string | null> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) return null;
  fal.config({ credentials: apiKey });
  const style = getStyleConfig(params.niche, params.visualStyle);
  const prompt =
    `Character reference sheet: a clean 2x2 grid of FOUR views of the EXACT SAME person from the reference image — ` +
    `identical face, hair, wardrobe and colors in every view. ` +
    `Top-left: front view, neutral expression. Top-right: three-quarter view. ` +
    `Bottom-left: side profile. Bottom-right: close-up of the face with an intense emotional expression. ` +
    `Plain neutral background, even lighting, no text, no labels, no numbers, no borders. ` +
    // Without this, the style suffix can win over the reference and render one panel
    // in a different medium than the other three — a sheet that contradicts itself is
    // worse than no sheet, because every scene inherits the contradiction.
    `CRITICAL: all four views must use the SAME rendering medium and art style as the ` +
    `reference image — do not switch between photographic and illustrated. ` +
    `${params.description}. ${style.promptSuffix}`;
  try {
    // Edit model = keeps the approved face; a fresh text-to-image would invent a new one.
    return await callReference(prompt, params.portraitUrl);
  } catch (e) {
    console.error("[bible]", e instanceof Error ? e.message.slice(0, 140) : e);
    return null;
  }
}

// ── Extra camera setups for one scene (multi-shot editing) ───────────────────
// Generates alternate framings of the SAME moment, using the scene's own finished
// image as the reference so the character, wardrobe, set and lighting stay
// identical — only the lens changes. The edit then cuts between them.
// Returns the extra shot URLs in cut order (excludes the primary shot).
export async function generateSceneShots(params: {
  basePrompt: string;
  primaryImageUrl: string;
  projectId: string;
  sceneNumber: number;
  niche: string;
  visualStyle: string;
  framings: string[];          // modifiers for shots 2..N (index 0 already rendered)
  emotion?: string;
}): Promise<string[]> {
  if (!params.framings.length) return [];
  const out = await mapWithConcurrency(params.framings, Math.min(2, params.framings.length), async (framing, i) => {
    const r = await generateSceneImage({
      prompt: `${params.basePrompt}${framing}`,
      projectId: params.projectId,
      sceneNumber: params.sceneNumber,
      niche: params.niche,
      visualStyle: params.visualStyle,
      // The primary frame IS the reference — that's what keeps the cut believable.
      referenceImageUrl: params.primaryImageUrl,
      emotion: params.emotion,
    });
    if (!r.success || !r.url) console.warn(`[shots] scene ${params.sceneNumber} shot ${i + 2} failed`);
    return r.success && r.url ? r.url : null;
  });
  return out.filter((u): u is string => Boolean(u));
}

export async function generateProjectImages(params: {
  projectId: string;
  niche: string;
  visualStyle: string;
  scenes: Array<{ scene_number: number; image_prompt: string; emotion?: string; narration_text?: string; location?: string | null }>;
  referenceImageUrl?: string;
  referenceImageUrls?: string[];   // multiple product angles → nano-banana sees them all
  sceneReferences?: Map<number, string>;
  // scene_number → that speaker's multi-view bible sheet. Passed ALONGSIDE the
  // portrait so the edit model sees the face from several angles.
  sceneBibles?: Map<number, string>;
  // scene_number → retratos de los OTROS personajes que están en cuadro.
  //
  // Hasta ahora cada escena recibía un solo retrato: el del que HABLA. En una
  // escena con tres personas, al generador le llegaba una cara y las otras dos
  // las inventaba. Medido en un video real: Jazmín salió con pelo azul en el
  // plano donde no hablaba y con pelo oscuro en el que sí, y la tercera figura
  // del fondo era un invento borroso. No es que el modelo "olvide" — nunca le
  // dijimos cómo se ven los demás.
  sceneExtraRefs?: Map<number, string[]>;
}): Promise<SceneImageResult[]> {
  const consistency = (process.env.CHARACTER_CONSISTENCY ?? "on").toLowerCase() !== "off";
  const seed = stableSeed(params.projectId);
  const scenes = params.scenes;

  // ── Multi-character path: every scene has its own speaker portrait ────────────
  // Each scene is generated independently against its speaker's reference image.
  if (consistency && params.sceneReferences && params.sceneReferences.size > 0) {
    const refs = params.sceneReferences;
    // ── EL MISMO DECORADO EN TODAS LAS ESCENAS DE UN LUGAR ──────────────────
    //
    // Antes las escenas se generaban todas a la vez, cada una a ciegas de las
    // demás: la "cocina" de la escena 2 tenía otra mesa, otra ventana y otra
    // luz que la de la escena 4, y aunque el personaje fuera el mismo el
    // espectador veía cortes entre lugares distintos. Ahora la PRIMERA escena
    // de cada lugar se genera antes (define el set) y las siguientes reciben
    // esa foto como referencia del decorado. Cuesta una ronda más de latencia,
    // no una llamada más.
    const claveLugar = (l?: string | null) => (l ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const lideres = new Map<string, number>();
    for (const sc of scenes) {
      const k = claveLugar(sc.location);
      if (k && !lideres.has(k)) lideres.set(k, sc.scene_number);
    }
    const setPorLugar = new Map<string, string>();
    const generar = async (scene: (typeof scenes)[number], setRef?: string) => {
      const ref = refs.get(scene.scene_number);
      const result = await generateSceneImage({
        prompt: scene.image_prompt,
        projectId: params.projectId,
        sceneNumber: scene.scene_number,
        niche: params.niche,
        visualStyle: params.visualStyle,
        seed,
        referenceImageUrl: ref || params.referenceImageUrl || undefined,
        // Portrait + multi-view bible together: nano-banana takes an image array,
        // so it gets the face from several angles instead of extrapolating from one.
        // LOS OTROS PERSONAJES PRIMERO, LA HOJA DESPUÉS.
        //
        // callReference corta en 4 imágenes, así que el orden decide qué se
        // pierde. Con varias personas en cuadro, saber cómo se ve la SEGUNDA
        // vale más que ver al primero desde otro ángulo: una cara inventada se
        // nota siempre; un ángulo de menos, casi nunca.
        referenceImageUrls: (() => {
          const otros = params.sceneExtraRefs?.get(scene.scene_number) ?? [];
          const bible = params.sceneBibles?.get(scene.scene_number);
          const lista = [...otros, ...(bible ? [bible] : [])];
          return lista.length ? lista : params.referenceImageUrls;
        })(),
        setReferenceUrl: setRef,
        emotion: scene.emotion,
        narrationText: scene.narration_text,
      });
      return { ...result, sceneNumber: scene.scene_number };
    };
    const setOn = (process.env.SET_REFERENCE ?? "on").toLowerCase() !== "off";
    const esLider = (sc: (typeof scenes)[number]) => setOn && lideres.get(claveLugar(sc.location)) === sc.scene_number;
    const primeros = scenes.filter(esLider);
    const resto = scenes.filter((sc) => !esLider(sc));
    const outLideres = await mapWithConcurrency(primeros, IMAGE_CONCURRENCY, async (scene) => generar(scene));
    for (const r of outLideres) {
      const sc = scenes.find((x) => x.scene_number === r.sceneNumber);
      if (r.success && r.url && sc) setPorLugar.set(claveLugar(sc.location), r.url);
    }
    if (setOn && scenes.length) console.log(`[set] ${lideres.size} lugar(es) · ${setPorLugar.size} decorado(s) de referencia para ${resto.length} escena(s)`);
    const outResto = await mapWithConcurrency(resto, IMAGE_CONCURRENCY, async (scene) =>
      generar(scene, setPorLugar.get(claveLugar(scene.location))));
    const out = [...outLideres, ...outResto];
    out.sort((a, b) => a.sceneNumber - b.sceneNumber);
    return out;
  }

  const firstInBatch = scenes.find((s) => s.scene_number === 1);
  const anchor = firstInBatch ? extractCharacterAnchor(firstInBatch.image_prompt) : null;

  const results: SceneImageResult[] = [];
  let refUrl: string | null = params.referenceImageUrl ?? null;

  const usingSavedCharacter = consistency && !!params.referenceImageUrl;

  if (firstInBatch && !usingSavedCharacter) {
    const r = await generateSceneImage({
      prompt: firstInBatch.image_prompt,
      projectId: params.projectId,
      sceneNumber: 1,
      niche: params.niche,
      visualStyle: params.visualStyle,
      seed,
      referenceImageUrls: params.referenceImageUrls,
      emotion: firstInBatch.emotion,
      narrationText: firstInBatch.narration_text,
    });
    results.push({ ...r, sceneNumber: 1 });
    if (r.success && r.url) refUrl = r.url;
  }

  const rest = usingSavedCharacter
    ? scenes
    : scenes.filter((s) => s.scene_number !== 1);
  const restResults = await mapWithConcurrency(rest, IMAGE_CONCURRENCY, async (scene) => {
    const useRef = consistency && !!refUrl;
    const prompt = useRef
      ? scene.image_prompt
      : anchor
        ? `same exact person and outfit as before (${anchor}), consistent face and wardrobe. ${scene.image_prompt}`
        : scene.image_prompt;

    const result = await generateSceneImage({
      prompt,
      projectId: params.projectId,
      sceneNumber: scene.scene_number,
      niche: params.niche,
      visualStyle: params.visualStyle,
      seed,
      referenceImageUrl: useRef ? refUrl! : undefined,
      // Pass the extra product angles only when the primary ref IS the product
      // (scene 1's generated image becomes the ref for later scenes — no extras then).
      referenceImageUrls: useRef && refUrl === params.referenceImageUrl ? params.referenceImageUrls : undefined,
      emotion: scene.emotion,
      narrationText: scene.narration_text,
    });
    return { ...result, sceneNumber: scene.scene_number };
  });
  results.push(...restResults);

  results.sort((a, b) => a.sceneNumber - b.sceneNumber);
  return results;
}

// ─── Character creation (nano-banana) ──────────────────────────────────────────
// Generate N portrait OPTIONS from a text description so the user can pick the one
// they like best. That chosen image becomes the recurring character's locked face.

const CHARACTER_GEN_MODEL = process.env.CHARACTER_GEN_MODEL ?? "fal-ai/nano-banana";

// Slight variation per option so the 4 results feel distinct (angle/expression).
const OPTION_VARIATIONS = [
  "front view, neutral confident expression, eye-level",
  "three-quarter angle, subtle expression, soft key light",
  "dramatic side lighting, intense gaze, cinematic mood",
  "natural candid look, shallow depth of field, looking slightly off-camera",
];

async function callTextToImage(prompt: string): Promise<string | null> {
  try {
    logPayload("retrato", CHARACTER_GEN_MODEL, { prompt, num_images: 1, aspect_ratio: "9:16", enable_safety_checker: false });
    const result = await fal.subscribe(CHARACTER_GEN_MODEL, {
      input: { prompt, num_images: 1, aspect_ratio: "9:16", enable_safety_checker: false },
      logs: false,
    });
    return extractUrl(result);
  } catch (e) {
    // Retry without aspect_ratio in case the model rejects that param
    try {
      logPayload("retrato", CHARACTER_GEN_MODEL, { prompt, num_images: 1, enable_safety_checker: false });
      const result = await fal.subscribe(CHARACTER_GEN_MODEL, { input: { prompt, num_images: 1, enable_safety_checker: false }, logs: false });
      return extractUrl(result);
    } catch (err) {
      console.error("[fal.ai callTextToImage error]", err instanceof Error ? err.message : String(err));
      return null;
    }
  }
}

export async function generateCharacterOptions(params: {
  description: string;
  niche?: string;
  visualStyle?: string;
  count?: number;
}): Promise<{ success: boolean; urls: string[]; error?: string }> {
  if (process.env.FORCE_MOCK_IMAGE === "true" || !process.env.FAL_API_KEY) {
    return { success: true, urls: ["/placeholder.png", "/placeholder.png", "/placeholder.png", "/placeholder.png"] };
  }
  fal.config({ credentials: process.env.FAL_API_KEY });

  const style = getStyleConfig(params.niche ?? "default", params.visualStyle ?? "cinematic");
  const count = Math.min(Math.max(params.count ?? 4, 1), 4);

  const urls = await mapWithConcurrency(OPTION_VARIATIONS.slice(0, count), count, async (variation) => {
    // Casting-quality portrait: this face carries the whole series, so ask for real
    // screen presence and a dressed environment instead of a flat headshot.
    // "immaculate wardrobe" + "magnetic, striking" empujaban a TODOS los
    // personajes al mismo catálogo pulido: los hombres salían con camisa oscura
    // abierta y las mujeres con suéter tejido, casting tras casting. La
    // descripción del personaje ya trae su cuerpo, su rasgo y su ropa con el
    // estado en que está — el prompt tiene que RESPETARLA, no lavarla.
    // UNA SOLA PERSONA EN CUADRO. Medido en un casting real: el retrato del
    // esposo infiel salió con la amante al lado, y el de la hermana con la
    // protagonista detrás — porque el prompt nunca decía "sola" y la descripción
    // nombraba a los otros. Ese retrato es la REFERENCIA DE IDENTIDAD del
    // personaje para todo el video: con dos caras adentro, el modelo no sabe
    // cuál copiar y la consistencia se pierde desde el primer plano.
    const prompt = `Cinematic character portrait for a premium vertical drama series. ${params.description}. ${variation}. ` +
      `EXACTLY ONE PERSON in the frame — this character ALONE. No other people, no couple, no one in the background, no reflections of others. ` +
      `Follow the description EXACTLY — body type, distinctive feature, and the wardrobe with the wear and state described. ` +
      `A face you remember: striking and magnetic, with real skin texture, pores and marks — beautiful the way a lead actor is, not the way a stock photo is. ` +
      `HEAD AND SHOULDERS FULLY IN FRAME with room above the hair — never crop the top of the head. ` +
      `The clothes belong to this person's life and look lived-in, never styled for a shoot. ` +
      `placed in a richly dressed environment that fits the character (never an empty studio backdrop), ` +
      `${style.promptSuffix}`;
    return callTextToImage(prompt);
  });

  const ok = urls.filter((u): u is string => !!u);
  if (!ok.length) return { success: false, urls: [], error: "No se pudieron generar opciones de personaje" };
  return { success: true, urls: ok };
}
