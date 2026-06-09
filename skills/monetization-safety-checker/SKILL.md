---
name: monetization-safety-checker
version: 1.0.0
category: content-moderation
trigger: "antes de finalizar cualquier generación de contenido — se ejecuta automáticamente"
model_recommendation: gpt-4o-mini (rápido y económico para moderación)
---

# Skill: Monetization Safety Checker

## Descripción
Revisa el contenido generado para detectar violaciones de políticas de monetización
de YouTube, TikTok e Instagram. Corre automáticamente antes de marcar un proyecto
como "ready". Es la última línea de defensa antes de exportar.

## Cuándo Usarla
- SIEMPRE, automáticamente, después de generar el guion
- Antes de exportar el paquete final
- Cuando el usuario solicita revisión de contenido

## Input Esperado
```typescript
{
  story: StoryOutput
  target_platform: string
}
```

## Output Esperado
```typescript
{
  is_safe: boolean
  risk_level: "safe"|"low_risk"|"medium_risk"|"high_risk"|"blocked"
  issues: Array<{
    type: PolicyViolationType
    description: string
    affected_scene?: number
    severity: "warning"|"error"
  }>
  recommendations: string[]
  can_proceed: boolean  // false solo si risk_level === "blocked"
}
```

## Categorías de Violación (PolicyViolationType)
```
- VIOLENCE_EXPLICIT      // Descripción gráfica de violencia
- ADULT_CONTENT          // Contenido sexual explícito
- HATE_SPEECH            // Lenguaje de odio o discriminación
- DANGEROUS_ACTIVITIES   // Instrucciones para actividades peligrosas
- MISINFORMATION         // Desinformación médica, política o de salud
- SPAM_CLICKBAIT         // Clickbait falso (promesas que no se cumplen)
- CONTROVERSIAL_POLITICS // Contenido político divisivo
- REAL_PERSON_DEFAMATION // Difamación de personas reales
- COPYRIGHT_RISK         // Referencia directa a IP de terceros
```

## Reglas de Evaluación
| Nivel | Descripción | Acción |
|---|---|---|
| safe | Sin problemas detectados | Proceder normalmente |
| low_risk | Advertencias menores | Mostrar warnings, proceder |
| medium_risk | Problemas moderados | Pedir confirmación al usuario |
| high_risk | Problemas serios | Requerir edición antes de continuar |
| blocked | Violación grave confirmada | NO proceder, mostrar error claro |

## Reglas
1. El checker NUNCA bloquea contenido de terror, crimen o drama — son nichos legítimos
2. Sí bloquea: instrucciones reales de violencia, contenido sexual, odio a grupos
3. El horror imaginativo y el true crime dramatizado son SEGUROS
4. Real persons: se puede mencionar figuras históricas, NO difamar personas vivas privadas
5. Si hay duda, clasificar como "low_risk" con advertencia — no bloquear
6. El resultado se guarda en api_logs siempre

## Checklist
- [ ] ¿Hay descripción gráfica de violencia real?
- [ ] ¿Hay contenido sexual?
- [ ] ¿Hay lenguaje de odio?
- [ ] ¿Hay instrucciones para actividades peligrosas?
- [ ] ¿Hay desinformación de salud/médica?
- [ ] ¿El thumbnail prompt muestra contenido sensible?
- [ ] ¿Hay nombres de personas reales vivas en contexto negativo?

## Errores Comunes
| Error | Aclaración |
|---|---|
| Bloquear horror legítimo | Horror imaginativo es SIEMPRE seguro para monetización |
| Bloquear true crime | True crime dramatizado es nicho válido y monetizable |
| False positive en "muerte" | Muerte narrativa/ficción es segura |
| Confundir controversia con hate speech | Solo bloquear hate speech real |
