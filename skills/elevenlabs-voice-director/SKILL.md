---
name: elevenlabs-voice-director
version: 1.0.0
category: voice-generation
trigger: "cuando el usuario necesita generar narración, voz en off, o audio para video"
model_recommendation: N/A (directs ElevenLabs API calls)
---

# Skill: ElevenLabs Voice Director

## Descripción
Gestiona la generación de voz en off usando ElevenLabs API. Selecciona la voz correcta
según el tono del proyecto, ajusta parámetros de voz, y organiza los archivos de audio.
En modo mock, genera archivos de audio de silencio o usa Web Speech API.

## Cuándo Usarla
- Usuario solicita "generar voz" o "narración"
- Pipeline automático post-generación de guion
- Usuario quiere previsualizar cómo sonará una escena

## Input Esperado
```typescript
{
  text: string           // narration_text de la escena
  voice_style: string    // "dramatic"|"warm"|"mysterious"|"energetic"
  language: "es"|"en"|"pt"
  scene_number: number
  project_id: string
  elevenlabs_voice_id?: string  // override manual
}
```

## Output Esperado
```typescript
{
  success: boolean
  audio_file_path: string   // ruta en storage
  duration_seconds: number
  voice_id: string
  provider: "elevenlabs"|"mock"
  file_size_bytes: number
}
```

## Voces Recomendadas por Estilo (ElevenLabs)
| Voice Style | Voz Sugerida | Voice ID |
|---|---|---|
| dramatic/horror | Antoni | ErXwobaYiN019PkySvjV |
| warm/inspirational | Rachel | 21m00Tcm4TlvDq8ikWAM |
| mysterious/thriller | Domi | AZnzlk1XvdvUeBnXmlld |
| energetic/comedy | Josh | TxGEqnHWrfWFTfGW9XjX |
| documentary | Arnold | VR6AewLTigWG4xSOukaG |
| romance | Bella | EXAVITQu4vr4xnSDxMaL |

## Parámetros de Voz por Tono
```typescript
const VOICE_SETTINGS = {
  horror:        { stability: 0.35, similarity_boost: 0.75, style: 0.8 },
  inspirational: { stability: 0.60, similarity_boost: 0.80, style: 0.5 },
  mystery:       { stability: 0.40, similarity_boost: 0.75, style: 0.7 },
  romance:       { stability: 0.55, similarity_boost: 0.85, style: 0.4 },
  documentary:   { stability: 0.70, similarity_boost: 0.70, style: 0.3 },
  comedy:        { stability: 0.45, similarity_boost: 0.80, style: 0.6 },
}
```

## Reglas
1. Si `ELEVENLABS_API_KEY` no está presente → usar MockVoiceAdapter
2. Si `FORCE_MOCK_VOICE=true` → usar MockVoiceAdapter
3. Cada escena genera UN archivo de audio independiente (scene_001.mp3, scene_002.mp3...)
4. Los archivos se guardan en `/storage/[project_id]/audio/`
5. Nunca concatenar audio automáticamente (eso es trabajo del editor)
6. Si la API falla → retry una vez → si falla → guardar log y continuar con mock

## MockVoiceAdapter
Cuando no hay API key o se fuerza mock:
- Genera archivo MP3 de silencio con duración estimada
- Duración = words_count / 2.5 (aprox 150 wpm narración dramática)
- Archivo nombrado igual para compatibilidad con el sistema

## Checklist
- [ ] ¿El texto tiene menos de 2500 caracteres? (límite ElevenLabs)
- [ ] ¿Se seleccionó la voz correcta para el tono?
- [ ] ¿Los parámetros de voz coinciden con el tono del proyecto?
- [ ] ¿El archivo se guardó en la ruta correcta?
- [ ] ¿Se actualizó el estado del asset en la DB?
- [ ] ¿Se registró el uso en api_logs?

## Errores Comunes
| Error | Causa | Solución |
|---|---|---|
| 401 Unauthorized | API key incorrecta | Verificar ELEVENLABS_API_KEY |
| 422 Text too long | > 2500 chars | Dividir texto en chunks |
| Rate limit | Muchas llamadas | Agregar delay de 500ms entre llamadas |
| Audio file corruption | Red interrupted | Verificar Content-Length y reintento |
