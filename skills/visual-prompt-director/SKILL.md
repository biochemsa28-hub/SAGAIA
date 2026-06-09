---
name: visual-prompt-director
version: 1.0.0
category: visual-generation
trigger: "cuando el usuario necesita prompts de imagen para Midjourney, SDXL, o cualquier generador de imágenes"
model_recommendation: gpt-4o | claude-sonnet-4-6
---

# Skill: Visual Prompt Director

## Descripción
Genera prompts de imagen profesionales y altamente específicos para cada escena de la historia.
Optimizados para Midjourney v6, SDXL, y Stable Diffusion. Mantiene consistencia visual en todo el proyecto.

## Cuándo Usarla
- Después de que `SAGAIA-scriptwriter` genera las escenas
- Regeneración de prompt de imagen individual
- Usuario solicita "mejorar prompts de imagen" o "crear prompts para Midjourney"

## Input Esperado
```typescript
{
  scene: {
    scene_number: number
    narration_text: string
    emotion: string
    camera_move: string
  }
  style_config: {
    visual_style: "cinematic"|"anime"|"realistic"|"cartoon"|"vintage"
    tone: string
    character_descriptions?: string[]  // para consistencia entre escenas
  }
}
```

## Output Esperado
```typescript
{
  image_prompt: string      // 50-150 palabras, listo para pegar en MJ
  negative_prompt: string   // elementos a evitar
  midjourney_params: string // "--ar 9:16 --v 6 --style raw"
  sdxl_params: {
    steps: number
    cfg_scale: number
    sampler: string
  }
}
```

## Estructura del Prompt de Imagen
```
[SUJETO]: descripción del personaje/objeto principal
[ACCIÓN]: qué está haciendo
[ESCENARIO]: descripción del entorno
[ILUMINACIÓN]: tipo de luz, dirección, color
[CÁMARA]: ángulo, distancia focal, profundidad de campo
[ESTILO]: estilo artístico, referencias de película/arte
[CALIDAD]: resolución y parámetros de calidad
```

## Reglas
1. Los prompts deben ser en inglés siempre (mejores resultados en todos los modelos)
2. Especificar siempre: sujeto, escenario, iluminación, ángulo de cámara
3. El visual_style debe estar presente en TODOS los prompts del proyecto
4. Para consistencia de personajes: incluir descripción física en cada prompt
5. Usar términos técnicos de fotografía (bokeh, rim lighting, dutch angle, etc.)
6. Longitud ideal: 60-120 palabras
7. Siempre incluir aspect ratio: 9:16 para vertical, 16:9 para horizontal

## Estilos por Visual Style
| Style | Keywords a incluir |
|---|---|
| cinematic | "cinematic photography, film grain, anamorphic lens, movie still" |
| anime | "anime art style, cel shading, vibrant colors, manga influence" |
| realistic | "hyperrealistic, photorealistic, 8k DSLR, professional photography" |
| cartoon | "cartoon illustration, bold outlines, flat colors, expressive" |
| vintage | "vintage film photography, 35mm grain, faded colors, retro aesthetic" |

## Checklist
- [ ] ¿El prompt está en inglés?
- [ ] ¿Incluye el visual_style del proyecto?
- [ ] ¿Especifica iluminación concreta?
- [ ] ¿Incluye ángulo de cámara?
- [ ] ¿Tiene aspecto ratio correcto?
- [ ] ¿Describe el estado emocional de la escena?
- [ ] ¿Es consistente con prompts de otras escenas?

## Errores Comunes
| Error | Solución |
|---|---|
| Prompts demasiado genéricos | Agregar referencia de película, artista o estética específica |
| Inconsistencia entre escenas | Incluir descripción física del personaje en todos los prompts |
| Prompt demasiado largo (>200 words) | Los modelos truncan: priorizar los primeros 75 words |
| Sin aspecto ratio | Agregar "--ar 9:16 --v 6" para Midjourney |

## Ejemplo
**Input:** Escena de horror, personaje descubriendo nombres en pared, estilo cinemático

**Output:**
```
Cinematic horror photography, extreme close-up of decayed wooden wall with dozens of names 
scratched into surface, final name 'MARÍA' freshly carved and clear, single dramatic 
underlighting casting harsh shadows, dust particles visible in air beam, shallow depth 
of field with wall in sharp focus, film grain, desaturated cold color palette with deep 
shadows, horror movie color grading, Ari Alexa cinema quality --ar 9:16 --v 6 --style raw

Negative: text, watermark, blurry, cartoon, bright colors, cheerful, people, faces
```
