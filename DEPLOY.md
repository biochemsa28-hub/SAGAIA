# Desplegar VYNAVO en contenedor

Serverless no puede correr esta app: el worker de la cola es un proceso vivo, FFmpeg
es un binario que se usa en cuatro puntos, y un video tarda 3-6 minutos. Cualquier
host que corra un contenedor Docker sirve.

## 1. Elegir host (15 min)

**Railway** — el camino más corto. Conectás el repo de GitHub, detecta el
Dockerfile, y despliega. ~$5-20/mes según uso.
Alternativas equivalentes: Fly.io, Render, o un VPS (Hetzner ~$6/mes) con Coolify
o Dokploy, que es lo que el Dockerfile ya contempla.

Lo único que NO sirve: Vercel, Netlify, Cloudflare Workers — todos serverless.

## 2. Variables de entorno

Copiá desde tu `.env.local`, MENOS lo que se indica. Nunca las subas al repo.

### Obligatorias — sin esto no arranca

| Variable | Nota |
|---|---|
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | **Crítico.** Sin Turso la base sería un archivo dentro del contenedor y se borra en cada despliegue |
| `NEXTAUTH_SECRET` | **GENERAR UNO NUEVO** — el local es de desarrollo |
| `NEXTAUTH_URL` | La URL pública real, ej. `https://vynavo.com` |
| `INTERNAL_JOB_SECRET` | **GENERAR UNO NUEVO.** Sin esto `/api/produce` devuelve 503 a propósito |
| `APP_BASE_URL` | `http://127.0.0.1:3000` — el worker se llama a sí mismo por loopback |
| `FAL_API_KEY` | |
| `ANTHROPIC_API_KEY` | **ROTAR** — se expuso en pantalla |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | **ROTAR el token** |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **ROTAR ambos** |

Generar los secretos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### De producción — la configuración que define calidad y costo

```
RENDER_ENGINE=ffmpeg
FORCE_TIER=kenburns
NATIVE_AUDIO=on
NARRATIVE_BLOCKS=on
BLOCK_TARGET_SECONDS=10
HOOK_BLOCK_SECONDS=12
MAX_VIDEO_SECONDS=60
MAX_DAILY_VIDEOS=40
MAX_CONCURRENT_JOBS=2
ADMIN_EMAILS=tu@email.com
```

`MAX_DAILY_VIDEOS` es el kill-switch de gasto. `MAX_CONCURRENT_JOBS` multiplica por
réplica: 2 réplicas × 2 = 4 videos simultáneos de gasto real.

### Faltantes hoy en producción

```
RESEND_API_KEY          sin esto no llega el aviso "tu video está listo"
NEXT_PUBLIC_POSTHOG_KEY sin esto no podés medir retención ni conversión
```

### NO copiar

`DATABASE_PATH`, `FORCE_MOCK_*`, y cualquier `VERCEL_*`.

## 3. Desplegar

Railway/Render/Fly detectan el `Dockerfile` solos. No hace falta configurar build.

El contenedor expone el 3000 y trae healthcheck contra `/api/health`.

## 4. Verificar (5 min, hacelo siempre)

```bash
curl https://TU-DOMINIO/api/health
```

Mirá el bloque `production`:

```json
"queue_worker_configured": true,   ← si es false, falta INTERNAL_JOB_SECRET
"render_engine": "ffmpeg",         ← si dice shotstack, falta RENDER_ENGINE
"native_audio": true,
"max_video_seconds": 60,
"cost_usd_per_video": 1.25
```

Y en los logs del contenedor, al arrancar:

```
[worker] iniciado — hasta 2 trabajos en paralelo
```

**Si esa línea no aparece, la cola no está corriendo** y los videos se van a quedar
encolados para siempre.

## 5. Stripe

El webhook apunta a la URL vieja. En el dashboard de Stripe cambiá el endpoint a
`https://TU-DOMINIO/api/stripe/webhook` y copiá el `whsec_...` nuevo a
`STRIPE_WEBHOOK_SECRET`.

## 6. Primer video

Generá uno y revisá los logs:

```
[anclas] 14 escenas → 7 imágenes (6 bloques)
[continuity] 7 escenas revisadas, sin bloqueos
[blocks] 14 escenas → 6 bloques
[nativo] escena 1: "…" (N palabras)
[worker] job xxxxxxxx done
```

Después leé el costo real en `api_logs` y actualizá `TIER_COST_USD` en
`lib/config.ts` — el precio de los planes se recalcula solo desde ahí.

## Errores que vas a ver si algo falta

| Síntoma | Causa |
|---|---|
| `/api/produce` → 503 | Falta `INTERNAL_JOB_SECRET` |
| Job queda en `queued` | El worker no arrancó — revisá el log de boot |
| "El render final falló" | Falta ffmpeg — no estás usando el Dockerfile |
| Sesión no persiste | `NEXTAUTH_URL` no coincide con el dominio real |
| Datos que desaparecen | Falta Turso: la base vive dentro del contenedor |
