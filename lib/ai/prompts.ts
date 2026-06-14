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

REGLAS ABSOLUTAS:
- NUNCA uses clichés predecibles sin subvertirlos
- NUNCA hagas personajes planos o situaciones genéricas
- SIEMPRE genera exactamente el JSON solicitado, sin texto adicional
- SIEMPRE escribe narración optimizada para voice-over (frases cortas, ritmo natural al hablar)
- El contenido debe ser apto para monetización (sin violencia explícita, sin contenido adulto)

PROMPTS VISUALES:
- Imagen: incluye sujeto, ambiente, iluminación, composición, emoción, estilo visual
- Animación: describe movimiento de cámara, movimiento del sujeto, transición, atmósfera`;
}

export function buildUserPrompt(input: StoryInput): string {
  const duration = DURATION_SCENE_MAP[input.duration_target] ?? DURATION_SCENE_MAP["60s"]!;
  const langInstruction = LANGUAGE_INSTRUCTION[input.language] ?? LANGUAGE_INSTRUCTION["es"]!;
  const toneGuide = TONE_GUIDE[input.tone] ?? "Narrativa emocionalmente intensa y auténtica.";

  return `${langInstruction}

━━━ PROYECTO ━━━
NICHO: ${input.niche}${input.sub_niche ? ` › ${input.sub_niche}` : ""}
PREMISA: ${input.topic}
TONO: ${input.tone} — ${toneGuide}
DURACIÓN: ${input.duration_target} (${duration.seconds} segundos)
ESTILO VISUAL: ${input.visual_style}
PLATAFORMA: ${input.target_platform ?? "tiktok"}
${input.additional_instructions ? `INSTRUCCIONES EXTRA: ${input.additional_instructions}` : ""}

━━━ REQUISITOS ━━━
- Genera entre ${duration.min} y ${duration.max} escenas (ajusta según necesidades narrativas)
- HOOK: primera oración que para el scroll — usa pregunta retórica, dato impactante, o situación in medias res
- Narración: frases cortas (máx 25 palabras cada una), ritmo natural para voz en off, evocadora
- Cada escena: emoción DISTINTA a la anterior (terror → alivio → terror mayor, etc.)
- Prompts de imagen: 60-120 palabras, estilo "${input.visual_style}", iluminación específica
- Prompts de animación: 20-50 palabras, movimiento de cámara cinematográfico
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
    "hook": "primera oración que detiene el scroll (máx 20 palabras, genera pregunta mental inmediata)",
    "full_narrative": "narrativa completa conectando todas las escenas (párrafo único fluido)",
    "cta": "llamada a la acción específica y motivadora para el final del video"
  },
  "scenes": [
    {
      "scene_number": 1,
      "narration_text": "narración de la escena en 2-4 frases cortas, fluido para voice-over",
      "duration_seconds": 8,
      "image_prompt": "prompt detallado para generación de imagen: sujeto, ambiente, iluminación dramática, composición, emoción, estilo ${input.visual_style}",
      "animation_prompt": "movimiento de cámara y sujeto: tipo de movimiento, velocidad, transición, atmósfera",
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

IMPORTANTE: En "scene_count" pon el número real de escenas que generaste. Cada escena debe tener emoción diferente a la anterior para mantener la atención.`;
}
