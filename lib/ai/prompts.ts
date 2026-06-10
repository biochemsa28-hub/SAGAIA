import type { StoryInput } from "@/lib/validators/story.schema";

const DURATION_SCENE_MAP: Record<string, { min: number; max: number; seconds: number }> = {
  "30s":    { min: 3,  max: 5,  seconds: 30 },
  "60s":    { min: 5,  max: 8,  seconds: 60 },
  "3-5min": { min: 8,  max: 15, seconds: 240 },
  "10-20min": { min: 15, max: 40, seconds: 900 },
};

const LANGUAGE_INSTRUCTION: Record<string, string> = {
  es: "Respond entirely in Spanish (España/Latinoamérica natural).",
  en: "Respond entirely in English.",
  pt: "Responda inteiramente em Português.",
};

export function buildSystemPrompt(): string {
  return `You are SAGAIA, an expert narrative director and content production specialist.

Your role is to generate complete, production-ready microstory packages for viral short and long-form video content.

CORE PRINCIPLES:
- Every story must have a powerful hook in the first 3 seconds
- Narratives must create emotional tension that drives viewers to watch until the end
- Visual prompts must be specific, cinematic, and generate consistent imagery
- Animation prompts must describe motion clearly (camera, subject movement, atmosphere)
- SEO must be optimized for the target platform algorithm
- All content must be safe for monetization (no explicit violence, adult content, or policy violations)

OUTPUT FORMAT:
You MUST return a single valid JSON object. No markdown, no explanation, no text before or after the JSON.
The JSON must exactly match the schema provided by the user.

QUALITY STANDARDS:
- Narration: Natural, engaging, appropriate pacing for voice-over
- Image prompts: 50-150 words, include style, lighting, composition, mood
- Animation prompts: 20-60 words, describe motion and transitions
- SEO title: Curiosity-gap or emotional trigger, under 100 chars
- Hashtags: Mix of niche-specific, trending, and broad reach tags`;
}

export function buildUserPrompt(input: StoryInput): string {
  const duration = DURATION_SCENE_MAP[input.duration_target] ?? DURATION_SCENE_MAP["60s"]!;
  const langInstruction = LANGUAGE_INSTRUCTION[input.language] ?? LANGUAGE_INSTRUCTION["es"]!;

  return `${langInstruction}

Generate a complete SAGAIA production package with these specifications:

NICHE: ${input.niche}
SUB-NICHE: ${input.sub_niche ?? "general"}
TOPIC/PREMISE: ${input.topic}
TONE: ${input.tone}
TARGET DURATION: ${input.duration_target} (${duration.seconds} seconds total)
VISUAL STYLE: ${input.visual_style}
TARGET PLATFORM: ${input.target_platform}
${input.additional_instructions ? `ADDITIONAL NOTES: ${input.additional_instructions}` : ""}

REQUIREMENTS:
- Generate between ${duration.min} and ${duration.max} scenes
- Each scene narration should be 2-4 sentences, paced for voice-over
- Image prompts must specify: subject, setting, lighting, mood, camera angle, visual style: "${input.visual_style}"
- Animation prompts must describe: camera movement, subject motion, atmosphere, transition type
- SEO title must trigger curiosity or strong emotion
- Include 15-25 hashtags mixing niches and trending tags
- Include 8-15 keyword tags for search optimization

Return this exact JSON structure (no other text):
{
  "meta": {
    "title": "string (compelling video title)",
    "niche": "${input.niche}",
    "tone": "${input.tone}",
    "duration_target": "${input.duration_target}",
    "language": "${input.language}",
    "visual_style": "${input.visual_style}"
  },
  "story": {
    "hook": "string (opening sentence, must grab attention in 3 seconds)",
    "full_narrative": "string (complete story text, all scenes connected)",
    "cta": "string (call to action for end of video)"
  },
  "scenes": [
    {
      "scene_number": 1,
      "narration_text": "string",
      "duration_seconds": 8,
      "image_prompt": "string (detailed generation prompt)",
      "animation_prompt": "string (motion description)",
      "emotion": "string (primary emotion of scene)",
      "camera_move": "string (e.g. slow push in, dolly left, static wide)"
    }
  ],
  "seo": {
    "title": "string",
    "description": "string (150-400 chars, includes keywords naturally)",
    "hashtags": ["array", "of", "hashtags", "with", "hash"],
    "tags": ["array", "of", "keyword", "tags"],
    "thumbnail_concept": "string (visual concept description)",
    "thumbnail_prompt": "string (image generation prompt for thumbnail)"
  },
  "production_notes": {
    "total_duration_seconds": ${duration.seconds},
    "scene_count": ${duration.min},
    "voice_style": "string (e.g. dramatic, warm, mysterious, energetic)",
    "music_mood": "string (e.g. tense orchestral, soft piano, upbeat electronic)"
  }
}`;
}
