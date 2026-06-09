---
name: animation-prompt-director
version: 1.0.0
category: video-generation
trigger: "cuando el usuario necesita prompts de animación o movimiento para Kling, Runway, Pika o similar"
model_recommendation: gpt-4o
---

# Skill: Animation Prompt Director

## Descripción
Genera prompts de animación de imagen a video para herramientas como Kling AI, Runway Gen-3,
Pika Labs y similares. Describe movimiento de cámara, movimiento de sujeto y atmósfera.

## Cuándo Usarla
- Después de generar prompts de imagen
- Usuario solicita "animar imágenes" o "crear prompts de animación"
- Regeneración de prompt de animación individual

## Input Esperado
```typescript
{
  scene: Scene
  image_prompt: string      // el prompt de imagen generado
  visual_style: string
  duration_seconds: number
  target_tool: "kling"|"runway"|"pika"|"generic"
}
```

## Output Esperado
```typescript
{
  animation_prompt: string   // 20-80 palabras
  motion_type: string        // "camera"|"subject"|"both"|"atmospheric"
  intensity: "subtle"|"moderate"|"dynamic"
  tool_specific_params?: Record<string, unknown>
}
```

## Vocabulario de Movimiento de Cámara
```
PUSH/PULL:    slow push in, pull back, zoom in, zoom out
PAN:          pan left, pan right, swish pan
TILT:         tilt up, tilt down
TRACKING:     tracking shot left, tracking shot right, follow shot
CRANE:        crane up, crane down
DRONE:        drone ascend, drone descend, orbit
HANDHELD:     handheld shaky, documentary style
STATIC:       static shot, locked off camera
```

## Vocabulario de Movimiento de Sujeto
```
subtle breathing, hair blowing in wind, fabric rippling, eyes moving,
leaves falling, smoke rising, water flowing, candle flickering,
character walking forward, turning head, raising hand
```

## Reglas por Herramienta
| Tool | Max Duration | Style |
|---|---|---|
| Kling 1.6 | 10s | "cinematic motion, smooth, professional" |
| Runway Gen-3 | 10s | "fluid motion, stable, film quality" |
| Pika Labs | 3-10s | "smooth animation, subtle movement" |
| Generic | Any | descripción general de movimiento |

## Reglas
1. Prompts en inglés siempre
2. Describir: qué se mueve + cómo se mueve + velocidad
3. Especificar si el movimiento es de cámara, sujeto o ambos
4. Para horror: movimientos lentos y deliberados (más efectivos)
5. Evitar movimientos que generen artefactos: "fast shake", "rapid zoom"
6. Máximo 80 palabras — los modelos ignoran el resto

## Checklist
- [ ] ¿Está en inglés?
- [ ] ¿Describe movimiento de cámara O sujeto O ambos?
- [ ] ¿Especifica velocidad (slow/moderate/fast)?
- [ ] ¿Es consistente con el tono emocional de la escena?
- [ ] ¿Tiene menos de 80 palabras?
- [ ] ¿Evita términos que generan artefactos?

## Errores Comunes
| Error | Solución |
|---|---|
| "camera moves everywhere" | Un solo tipo de movimiento por clip |
| Movimiento demasiado rápido | Agregar "slow", "subtle", "gentle" |
| Sin especificar qué se mueve | Ser explícito: "camera slowly pushes in" vs "subject walks" |

## Ejemplo
```
Input: Escena de personaje descubriendo nombres en pared, horror, 10s

Output: Slow camera pan across names on decayed wall from left to right, 
        stops and slowly zooms into final name 'MARÍA', subtle camera 
        shake at moment of discovery, dust particles floating in air, 
        atmospheric fog at floor level, 10 seconds total
```
