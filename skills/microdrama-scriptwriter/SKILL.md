---
name: SAGAIA-scriptwriter
version: 1.0.0
category: content-generation
trigger: "cuando el usuario quiere generar un guion, historia, microhistoria o narrativa para video"
model_recommendation: gpt-4o | claude-sonnet-4-6
---

# Skill: SAGAIA Scriptwriter

## Descripción
Genera guiones narrativos completos para SAGAIAs virales en formato video corto y largo.
Produce historia, gancho, estructura de escenas y narración optimizada para voz en off.

## Cuándo Usarla
- Usuario elige un nicho y tema
- Usuario quiere crear un proyecto nuevo
- Usuario solicita "generar historia" o "crear guion"
- Regeneración parcial de escenas individuales

## Input Esperado
```typescript
{
  niche: string          // "terror", "romance", "inspiracional", etc.
  sub_niche?: string     // subnicho específico
  topic: string          // "La casa maldita de Puebla" — mínimo 5 chars
  tone: ToneEnum         // horror|romance|mystery|inspirational|comedy|thriller|documentary|fantasy|drama
  duration_target: string // "30s"|"60s"|"3-5min"|"10-20min"
  language: string       // "es"|"en"|"pt"
  visual_style: string   // "cinematic"|"anime"|"realistic"|"cartoon"|"vintage"
  target_platform: string // "tiktok"|"instagram"|"youtube_shorts"|"youtube_long"
  additional_instructions?: string
}
```

## Output Esperado
JSON estructurado con:
- `meta`: título, nicho, configuración
- `story`: hook, narrativa completa, CTA
- `scenes[]`: array de escenas con narración, duración, prompts
- `seo`: título, descripción, hashtags, tags, thumbnail
- `production_notes`: duración total, voz, música

## Reglas
1. El hook DEBE capturar atención en los primeros 3 segundos
2. La narración de cada escena debe ser 2-4 oraciones, ritmo de voz en off
3. Todas las escenas deben conectarse narrativamente (no pueden ser independientes)
4. El tono debe mantenerse consistente en todas las escenas
5. El CTA debe ser específico y relevante al contenido (no genérico)
6. NUNCA generar contenido que viole políticas de monetización
7. El output SIEMPRE debe ser JSON válido según StoryOutputSchema (Zod)
8. Si el JSON falla validación: intentar reparar → reintentar → error claro

## Checklist Pre-Output
- [ ] ¿El hook genera curiosidad o emoción inmediata?
- [ ] ¿Todas las escenas tienen narración_text de 2-4 oraciones?
- [ ] ¿Los duration_seconds suman el total correcto?
- [ ] ¿Cada escena tiene image_prompt Y animation_prompt?
- [ ] ¿El SEO tiene mínimo 10 hashtags y 5 tags?
- [ ] ¿El JSON pasa validación Zod?
- [ ] ¿El contenido es seguro para monetización?

## Errores Comunes
| Error | Causa | Solución |
|---|---|---|
| JSON inválido | Comillas simples, comas trailing | Reparar con regex antes de parsear |
| Escenas sin conexión | Prompt demasiado libre | Recordar al modelo que las escenas son secuenciales |
| Hook demasiado genérico | Prompt vago | Incluir el topic exacto en el prompt |
| duration_seconds incorrectos | Modelo no calcula bien | Validar que suma = total_duration_seconds |
| Hashtags sin # | Modelo omite el símbolo | Postprocesar: forzar # en todos |

## Ejemplo

**Input:**
```json
{
  "niche": "terror",
  "topic": "El pozo que nunca toca fondo",
  "tone": "horror",
  "duration_target": "60s",
  "language": "es",
  "visual_style": "cinematic"
}
```

**Output esperado (fragmento):**
```json
{
  "story": {
    "hook": "En el pueblo de San Marcos existe un pozo del que nunca se oye el agua caer.",
    "scenes": [
      {
        "scene_number": 1,
        "narration_text": "Nadie sabe cuándo fue construido. Nadie recuerda haberlo visto llegar.",
        "duration_seconds": 10,
        "image_prompt": "Cinematic wide shot of ancient stone well in village square, dead of night, single torch light, fog at ground level, ominous atmosphere..."
      }
    ]
  }
}
```
