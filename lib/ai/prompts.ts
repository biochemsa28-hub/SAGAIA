import type { StoryInput } from "@/lib/validators/story.schema";

const DURATION_SCENE_MAP: Record<string, { min: number; max: number; seconds: number }> = {
  "30s":      { min: 3,  max: 5,  seconds: 30  },
  "60s":      { min: 5,  max: 8,  seconds: 60  },
  "3-5min":   { min: 8,  max: 15, seconds: 240 },
  "10-20min": { min: 15, max: 40, seconds: 900 },
};

const LANGUAGE_INSTRUCTION: Record<string, string> = {
  es: "Escribe TODO en español latinoamericano natural y fluido. Usa vocabulario emocional, directo y coloquial.",
  en: "Write EVERYTHING in natural, engaging English. Use emotional, direct language.",
  pt: "Escreva TUDO em português brasileiro natural e fluido. Use linguagem emocional e direta.",
};

const TONE_GUIDE: Record<string, string> = {
  horror:        "Atmósfera de terror psicológico, suspenso creciente, revelaciones perturbadoras. Cada escena debe aumentar la tensión.",
  romance:       "Tensión romántica, emociones intensas, deseos reprimidos y momentos de vulnerabilidad. Química entre personajes palpable.",
  mystery:       "Pistas que se revelan gradualmente, giros que reconfiguran todo lo anterior, final que deja al espectador con ganas de más.",
  inspirational: "Transformación real de personaje, obstáculos concretos superados, mensaje que resuena emocionalmente y motiva a actuar.",
  comedy:        "Situaciones absurdas pero creíbles, timing perfecto, personajes con reacciones exageradas pero relatable.",
  thriller:      "Urgencia extrema, stakes altos, decisiones bajo presión, ritmo acelerado que no da respiro.",
  documentary:   "Narración en primera persona o voz en off autoritaria, hechos sorprendentes presentados como revelaciones.",
  fantasy:       "Mundo con reglas claras, maravilla visual, metáforas emocionales encarnadas en elementos fantásticos.",
  drama:         "Conflictos humanos universales, diálogos internos poderosos, momentos de quiebre emocional auténtico.",
};

export function buildSystemPrompt(): string {
  return `Eres VYNAVO, el mejor director narrativo de microdramas virales del mundo hispanohablante.

Tu especialidad es crear historias que DETIENEN el scroll en los primeros 2 segundos y mantienen al espectador hipnotizado hasta el final. Cada historia que produces se convierte en contenido viral.

FILOSOFÍA NARRATIVA:
- El hook es TODO: la primera línea debe generar una pregunta que el cerebro NECESITA responder
- Cada escena termina con una micro-tensión que fuerza a ver la siguiente
- Las emociones deben ser específicas y viscerales, nunca genéricas
- Los personajes tienen contradicciones reales, no son perfectos ni completamente malos
- Los giros deben ser sorprendentes pero inevitables en retrospectiva

TÉCNICAS QUE USAS:
- Apertura in medias res: empieza en el momento de máxima tensión
- Ironía dramática: el espectador sabe algo que el personaje no
- Escalada emocional: cada escena sube un peldaño en intensidad
- Especificidad concreta: nombres, lugares, detalles reales (no "un hombre", sino "Miguel, contador de 43 años")
- Cliffhanger por escena: cada escena termina con una pregunta o revelación

COHERENCIA AUDIOVISUAL (CRÍTICO):
- Define UN personaje principal con rasgos físicos específicos (edad, ropa, color de cabello, rasgo distintivo) y úsalos en TODAS las escenas
- Establece una paleta de 2-3 colores dominantes y mantenla a lo largo de TODO el video
- Cada image_prompt debe CONTINUAR visualmente la escena anterior (misma ubicación o transición lógica de espacio)
- La narración de cada escena debe TERMINAR con una frase que ABRE hacia la siguiente (no hay cierres completos hasta el final)
- El ritmo de las frases debe variar: escenas de tensión = frases cortas y secas; escenas de revelación = frases más largas
- Cada animation_prompt debe conectar con el movimiento de cámara de la escena anterior (si termina con zoom in, la siguiente empieza con zoom in ya hecho)

REGLAS ABSOLUTAS:
- NUNCA uses clichés predecibles sin subvertirlos
- NUNCA hagas personajes planos o situaciones genéricas
- SIEMPRE genera exactamente el JSON solicitado, sin texto adicional
- SIEMPRE escribe narración optimizada para voice-over (frases cortas, ritmo natural al hablar)
- El contenido debe ser apto para monetización (sin violencia explícita, sin contenido adulto)

PROMPTS VISUALES:
- Imagen: incluye [descripción exacta del personaje], [paleta de colores de la historia], [ambiente específico con detalles], iluminación cinematográfica, composición, emoción, estilo visual
- Animación: describe movimiento de cámara cinematográfico que FLUYE desde la escena anterior`;
}

export function buildUserPrompt(input: StoryInput): string {
  const duration = DURATION_SCENE_MAP[input.duration_target] ?? DURATION_SCENE_MAP["60s"]!;
  const langInstruction = LANGUAGE_INSTRUCTION[input.language] ?? LANGUAGE_INSTRUCTION["es"]!;
  const toneGuide = TONE_GUIDE[input.tone] ?? "Narrativa emocionalmente intensa y auténtica.";

  const chosenHook = input.additional_instructions?.match(/\[HOOK ELEGIDO\]: (.+)/)?.[1] ?? null;

  return `${langInstruction}

━━━ PROYECTO ━━━
NICHO: ${input.niche}${input.sub_niche ? ` › ${input.sub_niche}` : ""}
PREMISA: ${input.topic}
TONO: ${input.tone} — ${toneGuide}
DURACIÓN: ${input.duration_target} (${duration.seconds} segundos)
ESTILO VISUAL: ${input.visual_style}
PLATAFORMA: ${input.target_platform ?? "tiktok"}
${chosenHook ? `HOOK ELEGIDO POR EL USUARIO (ÚSALO EXACTAMENTE COMO ESTÁ): "${chosenHook}"` : ""}
${input.additional_instructions && !chosenHook ? `INSTRUCCIONES EXTRA: ${input.additional_instructions}` : ""}

━━━ COHERENCIA VISUAL (OBLIGATORIO) ━━━
ANTES de escribir las escenas, define internamente:
1. PERSONAJE PRINCIPAL: nombre, edad, rasgo físico distintivo, ropa de la historia
2. PALETA DE COLOR: 2-3 colores dominantes de toda la historia (ej: azul frío + negro + destellos ámbar)
3. ESPACIO NARRATIVO: dónde sucede la historia y cómo evoluciona el espacio entre escenas

Luego incluye estos elementos en CADA image_prompt para que todas las escenas sean visualmente coherentes.

━━━ REQUISITOS NARRATIVOS ━━━
- Genera entre ${duration.min} y ${duration.max} escenas (ajusta según necesidades narrativas)
- ${chosenHook ? `El hook del story.hook DEBE SER exactamente: "${chosenHook}"` : "HOOK: primera oración que para el scroll — usa pregunta retórica, dato impactante, o situación in medias res"}
- Narración: frases cortas (máx 20 palabras cada una), ritmo natural para voz en off, evocadora
- Cada escena: emoción DISTINTA a la anterior y la narración TERMINA abriendo hacia la siguiente
- El video debe sentirse como UNA SOLA HISTORIA fluida, no escenas independientes
- Prompts de imagen: 80-150 palabras, incluye [personaje+descripción física], [paleta de color], [ambiente] y estilo "${input.visual_style}"
- Prompts de animación: 30-60 palabras, especifica cómo el movimiento CONECTA con la escena anterior
- SEO: título que genere curiosidad extrema, descripción con keywords naturales
- Hashtags: 15-25 mezclando nicho específico + trending + alcance amplio

━━━ JSON REQUERIDO ━━━
Devuelve ÚNICAMENTE este JSON válido (sin markdown, sin texto antes/después):

{
  "meta": {
    "title": "título impactante del video (bajo 100 caracteres, genera curiosidad)",
    "niche": "${input.niche}",
    "tone": "${input.tone}",
    "duration_target": "${input.duration_target}",
    "language": "${input.language}",
    "visual_style": "${input.visual_style}"
  },
  "story": {
    "hook": "${chosenHook ?? "primera oración que detiene el scroll (máx 20 palabras, genera pregunta mental inmediata)"}",
    "full_narrative": "narrativa completa conectando TODAS las escenas con transiciones fluidas entre cada una (2-4 párrafos)",
    "cta": "llamada a la acción específica y motivadora para el final del video"
  },
  "scenes": [
    {
      "scene_number": 1,
      "narration_text": "narración 2-4 frases cortas para voice-over, TERMINA con frase que abre hacia la siguiente escena",
      "duration_seconds": 8,
      "image_prompt": "prompt 80-150 palabras: [nombre del personaje, descripción física exacta], [paleta de colores: X, Y, Z], [ambiente específico con detalle sensorial], iluminación cinematográfica dramática, composición [regla de tercios/primer plano/plano general], emoción ${input.tone}, estilo ${input.visual_style}, ultra detailed, 8k",
      "animation_prompt": "movimiento de cámara que FLUYE desde inicio: tipo (slow push in/dolly/tilt/pan), velocidad, atmósfera emocional, qué elemento del frame se enfatiza con el movimiento",
      "emotion": "emoción primaria de esta escena (una palabra)",
      "camera_move": "movimiento específico (ej: slow push in, dolly left, static wide, tilt up, handheld)"
    }
  ],
  "seo": {
    "title": "título SEO con trigger emocional o curiosity gap (bajo 100 chars)",
    "description": "descripción 150-400 chars con keywords naturales, genera expectativa",
    "hashtags": ["#hashtag1", "#hashtag2"],
    "tags": ["keyword1", "keyword2"],
    "thumbnail_concept": "concepto visual del thumbnail: qué se ve, expresión, texto superpuesto",
    "thumbnail_prompt": "prompt de imagen para thumbnail: close-up dramático, alta contrast, emocional"
  },
  "production_notes": {
    "total_duration_seconds": ${duration.seconds},
    "scene_count": 0,
    "voice_style": "estilo de voz específico (ej: susurro tenso, voz cálida y cercana, narrador urgente)",
    "music_mood": "mood musical específico (ej: piano minimalista con tensión, beats urbanos, orquesta épica)"
  }
}

IMPORTANTE: "scene_count" = número real de escenas. La narración de cada escena NO debe cerrarse completamente — debe haber una tensión que tire al espectador a la siguiente.`;
}
