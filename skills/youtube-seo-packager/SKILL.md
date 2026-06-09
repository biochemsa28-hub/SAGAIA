---
name: youtube-seo-packager
version: 1.0.0
category: seo-content
trigger: "cuando el usuario necesita SEO, metadata, títulos, hashtags o descripción para YouTube, TikTok o Instagram"
model_recommendation: gpt-4o | claude-sonnet-4-6
---

# Skill: YouTube SEO Packager

## Descripción
Genera el paquete completo de metadata SEO optimizado para la plataforma objetivo.
Incluye título, descripción, hashtags, tags, concepto de miniatura y prompt de imagen
para la miniatura.

## Cuándo Usarla
- Parte del pipeline de generación (siempre después del guion)
- Usuario solicita "mejorar SEO" o "regenerar metadata"
- Exportación del paquete de producción

## Input Esperado
```typescript
{
  story: { hook, full_narrative, cta }
  meta: { niche, tone, language }
  target_platform: "youtube_shorts"|"youtube_long"|"tiktok"|"instagram"
  target_audience?: string
  keywords_focus?: string[]
}
```

## Output Esperado
```typescript
{
  title: string              // max 100 chars, hook + keyword
  description: string        // 150-500 chars con keywords naturales
  hashtags: string[]         // con # incluido, 10-30 tags
  tags: string[]             // sin #, 8-20 keywords
  thumbnail_concept: string  // descripción visual del thumbnail
  thumbnail_prompt: string   // prompt de imagen para el thumbnail
}
```

## Fórmulas de Título por Plataforma
```
YouTube: [Curiosity Gap] | [Emotional Hook] — [Keyword]
TikTok: [Question or Shock] #niche #viral
Instagram: [Emotional Statement] ✨ [Keyword]

Fórmulas efectivas:
- "La verdad sobre [topic] que nadie te dijo"
- "Por qué [topic] cambió todo para siempre"
- "[Topic]: Lo que pasó después te dejará sin palabras"
- "Nunca imaginé que [topic] pudiera ser tan [emoción]"
```

## Reglas de Hashtags por Plataforma
| Plataforma | Cantidad óptima | Mix |
|---|---|---|
| YouTube Shorts | 10-15 | 3 broad + 5 niche + 3 trending + 2-4 branded |
| YouTube Largo | 5-8 | Solo los más relevantes |
| TikTok | 5-10 | Trending + niche |
| Instagram | 20-30 | Mix completo |

## Reglas
1. El título NUNCA debe ser clickbait falso (política de monetización)
2. La descripción debe incluir keywords en los primeros 100 chars
3. Los hashtags deben ir de más a menos populares
4. El thumbnail_prompt debe ser diferente al image_prompt de escena 1
5. El thumbnail debe tener texto overlay space (área libre arriba/abajo)
6. Todos los hashtags deben incluir el símbolo #

## Checklist
- [ ] ¿El título tiene < 100 caracteres?
- [ ] ¿Los primeros 100 chars de descripción tienen keywords?
- [ ] ¿Los hashtags incluyen el símbolo #?
- [ ] ¿El thumbnail_prompt especifica espacio para texto?
- [ ] ¿El contenido es compatible con monetización?
- [ ] ¿Hay mix de hashtags broad/niche/trending?

## Errores Comunes
| Error | Solución |
|---|---|
| Hashtags sin # | Post-procesar: `.map(h => h.startsWith('#') ? h : '#'+h)` |
| Título muy largo | Truncar a 100 chars, priorizar hook |
| Descripción muy corta | Mínimo 150 chars para SEO efectivo |
| Thumbnail demasiado similar a escena 1 | Pedir composición diferente explícitamente |
