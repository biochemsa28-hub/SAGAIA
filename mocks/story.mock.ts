/**
 * Canonical mock output used in tests and storybook.
 * Represents a fully validated StoryOutput for the horror/paranormal niche.
 */
import type { StoryOutput } from "@/lib/validators/story.schema";

export const MOCK_STORY_HORROR: StoryOutput = {
  meta: {
    title: "La Casa al Final del Camino — Historia de Terror",
    niche: "terror",
    tone: "horror",
    duration_target: "60s",
    language: "es",
    visual_style: "cinematic",
  },
  story: {
    hook: "Nadie volvió a hablar de lo que pasó en esa casa… hasta hoy.",
    full_narrative:
      "Era una noche oscura cuando María decidió ignorar las advertencias del pueblo. La casa al final del camino llevaba años abandonada, pero las luces seguían encendiéndose cada medianoche. Cuando cruzó la puerta, el frío la golpeó como una pared invisible. En las paredes, nombres grabados con uñas. El último era el suyo.",
    cta: "¿Conoces algún lugar así en tu ciudad? Cuéntanos en los comentarios y no olvides seguirnos para más historias.",
  },
  scenes: [
    {
      scene_number: 1,
      narration_text:
        "Nadie volvió a hablar de lo que pasó en esa casa… hasta hoy.",
      duration_seconds: 8,
      image_prompt:
        "Cinematic style, aerial drone shot of an isolated abandoned Victorian house at the end of a dirt road, surrounded by dead trees, fog rolling in, blue moonlight, ominous atmosphere, 8k, ultra-detailed, horror movie aesthetic",
      animation_prompt:
        "Slow drone push-in toward the house, fog swirling at ground level, dead leaves blowing, eerie stillness",
      emotion: "dread",
      camera_move: "slow drone push-in",
    },
    {
      scene_number: 2,
      narration_text:
        "Era una noche oscura cuando María decidió ignorar las advertencias del pueblo.",
      duration_seconds: 10,
      image_prompt:
        "Cinematic close-up portrait of a determined young woman, 25s, walking alone on a foggy road at night, dramatic side lighting, shadows on face, horror film color grading, shallow depth of field",
      animation_prompt:
        "Slow tracking shot following character from behind, camera slightly shaky, atmospheric fog, tension building",
      emotion: "determination_and_fear",
      camera_move: "slow tracking follow",
    },
    {
      scene_number: 3,
      narration_text:
        "La casa al final del camino llevaba años abandonada, pero las luces seguían encendiéndose cada medianoche.",
      duration_seconds: 10,
      image_prompt:
        "Cinematic establishing shot of abandoned Victorian house exterior, single window glowing with warm yellow light from inside, all other windows dark, overgrown garden, iron gate, stormy sky, horror atmosphere, 8k",
      animation_prompt:
        "Static wide shot, light in window flickers twice, branches sway in wind, rain begins to fall",
      emotion: "unease",
      camera_move: "static wide",
    },
    {
      scene_number: 4,
      narration_text:
        "Cuando cruzó la puerta, el frío la golpeó como una pared invisible.",
      duration_seconds: 10,
      image_prompt:
        "Cinematic interior shot, dark abandoned house hallway, character silhouette in doorway backlit by moonlight, decay and cobwebs visible, dust particles in air, extreme contrast lighting, horror movie style",
      animation_prompt:
        "Slow dolly forward from character's POV entering the house, subtle breath mist visible, creaking floorboard sound implied",
      emotion: "shock",
      camera_move: "slow dolly forward POV",
    },
    {
      scene_number: 5,
      narration_text:
        "En las paredes, nombres grabados con uñas. El último era el suyo.",
      duration_seconds: 12,
      image_prompt:
        "Cinematic extreme close-up of decayed wall with dozens of names scratched into wood, last name freshly scratched and clear: MARÍA, dramatic single light source from below, horror atmosphere, 8k detail",
      animation_prompt:
        "Slow pan across names on wall, camera stops and slowly zooms into last name, slight camera shake at discovery moment",
      emotion: "terror",
      camera_move: "slow pan and zoom-in",
    },
    {
      scene_number: 6,
      narration_text:
        "Síguenos para más historias que nadie se atreve a contar.",
      duration_seconds: 10,
      image_prompt:
        "Cinematic shot of house exterior again, all windows now lit, silhouette of person visible in each window, fog intensifying, text overlay area at bottom, horror movie end card style",
      animation_prompt:
        "Slow pull back drone shot revealing all windows lit, ominous finale, fade to black",
      emotion: "closure_with_dread",
      camera_move: "slow drone pull-back",
    },
  ],
  seo: {
    title: "La Casa Maldita que Nadie Se Atrevía a Entrar — Historia de Terror Real",
    description:
      "Descubre la aterradora historia de la casa al final del camino. Una historia de terror que te pondrá los pelos de punta. ¿Seguirías entrando? #terror #historias #viral",
    hashtags: [
      "#terror",
      "#historiasdeterror",
      "#paranormal",
      "#miedo",
      "#casaembrujada",
      "#horror",
      "#historias",
      "#viral",
      "#storytelling",
      "#youtube",
      "#shorts",
      "#microhistorias",
      "#suspenso",
      "#thriller",
      "#contenido",
    ],
    tags: [
      "terror",
      "historias de terror",
      "casa embrujada",
      "paranormal",
      "horror",
      "microhistorias",
      "storytelling",
      "contenido viral",
    ],
    thumbnail_concept:
      "Close-up of the wall with names, MARÍA prominently visible, character's horrified face reflected in a broken mirror nearby",
    thumbnail_prompt:
      "Cinematic horror thumbnail, extreme close-up of scratched names on decayed wall, last name MARÍA freshly carved, dramatic red-tinted lighting, horror movie color grade, text overlay space at top",
  },
  production_notes: {
    total_duration_seconds: 60,
    scene_count: 6,
    voice_style: "dramatic, slow-paced, deep and mysterious",
    music_mood: "tense orchestral with subtle horror ambience",
  },
};

export const MOCK_STORY_INSPIRACIONAL: StoryOutput = {
  meta: {
    title: "De Homeless a CEO — La Historia Real de Luis",
    niche: "inspiracional",
    tone: "inspirational",
    duration_target: "3-5min",
    language: "es",
    visual_style: "cinematic",
  },
  story: {
    hook: "A los 28 años, Luis dormía en su coche. A los 35, dirigía una empresa de 50 personas.",
    full_narrative:
      "Luis García nunca imaginó que perder todo sería el comienzo de su mayor éxito. Tras un divorcio devastador y la quiebra de su primer negocio, pasó 18 meses viviendo en su coche en las calles de Miami. Cada mañana se duchaba en el YMCA local y se presentaba a entrevistas de trabajo. La centésima llamada cambió todo.",
    cta: "¿Cuál fue tu momento de quiebre que cambió todo? Comparte tu historia en los comentarios.",
  },
  scenes: [
    {
      scene_number: 1,
      narration_text: "A los 28 años, Luis dormía en su coche. A los 35, dirigía una empresa de 50 personas.",
      duration_seconds: 15,
      image_prompt: "Cinematic split screen, left: man sleeping in old car on rainy city street at night, right: same man in modern office commanding meeting, dramatic contrast lighting, emotional storytelling style, 8k",
      animation_prompt: "Slow reveal split screen, left side fades from dark to light as right side appears, powerful visual transformation, 15 seconds",
      emotion: "contrast_hope",
      camera_move: "split screen reveal",
    },
    {
      scene_number: 2,
      narration_text: "Tras perder su empresa y su matrimonio en el mismo año, Luis pasó 18 meses viviendo en su coche en las calles de Miami.",
      duration_seconds: 20,
      image_prompt: "Cinematic close-up of man's face inside old car, rain on windshield, city lights blurred in background, expression of quiet determination not defeat, dramatic single source lighting, emotional depth, 8k",
      animation_prompt: "Slow push in to face through rain-covered windshield, rain drops roll down glass, city lights bokeh in background, melancholic but determined mood",
      emotion: "resilience",
      camera_move: "slow push in through glass",
    },
    {
      scene_number: 3,
      narration_text: "Cada mañana se duchaba en el YMCA local y se presentaba a entrevistas de trabajo. La centésima llamada cambió todo.",
      duration_seconds: 20,
      image_prompt: "Cinematic shot of man in clean but simple clothes, phone pressed to ear, expression shifting from anticipation to joy and disbelief, warm window light, shallow depth of field, hope and breakthrough moment, 8k",
      animation_prompt: "Slow zoom in as expression changes from nervous to pure joy, light seems to brighten around him, triumphant mood, camera slightly handheld for authenticity",
      emotion: "breakthrough_joy",
      camera_move: "slow zoom in",
    },
  ],
  seo: {
    title: "De Dormir en su Coche a CEO — La Historia Real que Inspira Millones",
    description:
      "La increíble historia de superación de Luis García, quien pasó de vivir en su coche a dirigir una empresa exitosa. Una historia real de resiliencia y éxito que necesitas escuchar hoy.",
    hashtags: ["#inspiracion", "#superacion", "#exito", "#motivacion", "#historias", "#viral", "#emprendimiento", "#resiliencia", "#ceo", "#storytelling"],
    tags: ["inspiracion", "superacion personal", "historia real", "motivacion", "exito", "emprendimiento"],
    thumbnail_concept: "Before/after dramatic comparison, emotional facial expression, success symbols in background",
    thumbnail_prompt: "Cinematic inspirational thumbnail, man looking up with determination, city skyline background, warm golden hour lighting, success and hope visual mood",
  },
  production_notes: {
    total_duration_seconds: 240,
    scene_count: 10,
    voice_style: "warm, emotional, building intensity",
    music_mood: "piano begins soft, builds to orchestral triumph",
  },
};
