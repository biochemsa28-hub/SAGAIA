---
name: json-schema-validator
version: 1.0.0
category: qa-validation
trigger: "siempre que se recibe output de cualquier AI — nunca usar datos de AI sin validar"
model_recommendation: N/A (lógica de código, no llama a AI)
---

# Skill: JSON Schema Validator

## Descripción
Valida y repara el JSON de salida de cualquier proveedor de IA (OpenAI, Claude, mock)
contra los Zod schemas definidos. Implementa el ciclo: parse → validate → repair → retry → error.

## Cuándo Usarla
- Inmediatamente después de recibir respuesta de cualquier AI
- Antes de guardar en base de datos
- Al importar proyectos de otras fuentes

## Ciclo de Validación
```
raw AI string
    │
    ▼
[1] Extraer JSON (remover markdown ```json ```)
    │
    ▼
[2] JSON.parse()
    │ ✓ pasa → [4]
    │ ✗ falla → [3]
    ▼
[3] Reparación básica:
    - remover trailing commas
    - convertir comillas simples
    - cerrar llaves/corchetes faltantes
    │ → reintentar JSON.parse()
    │ ✓ pasa → [4]
    │ ✗ falla → [7] ERROR
    ▼
[4] Zod.safeParse(data)
    │ ✓ pasa → [5]
    │ ✗ falla → [6]
    ▼
[5] SUCCESS → retornar data tipada
    ▼
[6] Retry: volver a llamar AI con error context
    │ (máximo 1 reintento)
    │ ✓ pasa en reintento → [5]
    │ ✗ falla → [7]
    ▼
[7] ERROR → {
      success: false,
      error: "descripción clara",
      zod_issues: [...],
      raw: "string original",
      saved_to_log: true
    }
```

## Reparaciones Automáticas Implementadas
```typescript
function repairJSON(raw: string): string {
  return raw
    .replace(/```json\n?/g, '').replace(/```\n?/g, '')  // strip markdown
    .replace(/,\s*([}\]])/g, '$1')                        // trailing commas
    .replace(/'/g, '"')                                    // single quotes
    .replace(/(\w+):/g, '"$1":')                          // unquoted keys
    .trim();
}
```

## Output de Error Estándar
```typescript
{
  success: false,
  error: "Zod validation failed: scenes.0.image_prompt: String must contain at least 20 character(s)",
  zod_issues: [
    { path: ["scenes", 0, "image_prompt"], message: "String must contain at least 20 character(s)" }
  ],
  raw: "...",   // raw AI response para debugging
  repair_attempted: true,
  retry_attempted: true
}
```

## Reglas
1. NUNCA usar datos de AI sin pasar por este validador
2. Si el JSON es inválido después de repair → registrar en api_logs antes de retornar error
3. El campo `raw` siempre debe guardarse para debugging
4. Los errores de Zod deben ser mensajes legibles para el usuario final
5. Un error de validación NO es un crash — es un flujo controlado

## Checklist
- [ ] ¿Se extrajeron los delimitadores de markdown?
- [ ] ¿Se intentó reparar trailing commas?
- [ ] ¿Se corrió Zod.safeParse?
- [ ] ¿Si falló, se reintentó una vez?
- [ ] ¿El error se guardó en api_logs?
- [ ] ¿El mensaje de error es legible?

## Errores Zod más Comunes en Producción
| Error Zod | Causa típica | Fix en prompt |
|---|---|---|
| `scenes: Required` | AI no generó array scenes | Hacer schema más explícito en prompt |
| `image_prompt: min 20 chars` | Prompts muy cortos | Agregar "at least 50 words" en instrucción |
| `hashtags: min 5` | Pocos hashtags | Especificar mínimo exacto en prompt |
| `duration_seconds: not a number` | AI devuelve string | Agregar "must be a number, not string" |
