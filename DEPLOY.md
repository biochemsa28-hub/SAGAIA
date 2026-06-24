# 🚀 Desplegar VYNAVO (sin Vercel) — Hetzner + Coolify

Guía paso a paso para poner VYNAVO en producción en un VPS barato (~€4/mes)
con una capa tipo Vercel (Coolify) y SSL gratis. La app ya está lista:
`output: standalone` + `Dockerfile` incluidos.

---

## 0) Antes de empezar (lo que necesitas tener a mano)
- [ ] Tarjeta para el VPS (Hetzner ~€4/mes)
- [ ] Un dominio (Namecheap/Cloudflare ~$10/año)
- [ ] Tus API keys: OpenAI, ElevenLabs, fal, Shotstack, Stripe (live), Turso
- [ ] **Regenera las llaves de Stripe expuestas** antes de usarlas en producción
- [ ] **Recarga saldo en fal.ai y Shotstack** (sin esto no se produce nada)

---

## 1) Crear el VPS (Hetzner)
1. Entra a https://console.hetzner.cloud → New Project → "vynavo".
2. Add Server:
   - Location: el más cercano a tus usuarios.
   - Image: **Ubuntu 24.04**.
   - Type: **CX22** (2 vCPU / 4 GB) — suficiente para empezar.
   - SSH key: agrega tu llave pública (o usa contraseña).
3. Crea el servidor y **anota la IP pública**.

---

## 2) Instalar Coolify (el "Vercel self-hosted")
Conéctate por SSH y corre el instalador oficial:
```bash
ssh root@TU_IP
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```
Cuando termine, abre en el navegador:
```
http://TU_IP:8000
```
Crea tu cuenta de admin (la primera cuenta es la dueña).

---

## 3) Conectar el dominio + SSL
1. En tu proveedor DNS (recomendado **Cloudflare**, gratis):
   - Registro **A**: `@` → `TU_IP`
   - Registro **A**: `www` → `TU_IP`
   - (Cloudflare) deja el proxy en **DNS only** (nube gris) durante el primer
     deploy para que Coolify pueda emitir el certificado; luego puedes activar
     el proxy naranja para CDN.
2. En Coolify asignarás el dominio en el paso 4 → SSL (Let's Encrypt) automático.

---

## 4) Desplegar la app
1. En Coolify: **Sources** → conecta tu GitHub (repo `SAGAIA`).
2. **+ New Resource** → **Application** → elige el repo y la rama (`main`).
3. Build Pack: **Dockerfile** (Coolify detecta el `Dockerfile` del repo).
4. **Domains**: pon `https://tudominio.com` → Coolify emite el SSL solo.
5. **Environment Variables**: pega las del bloque de abajo.
6. **Deploy**. En cada `git push` se redesplega automáticamente.

---

## 5) Variables de entorno (pégalas en Coolify)

### Imprescindibles
```
NEXTAUTH_SECRET=          # genera: openssl rand -base64 32
NEXTAUTH_URL=https://tudominio.com
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
FAL_API_KEY=
SHOTSTACK_API_KEY=
STRIPE_SECRET_KEY=sk_live_...        # ⚠️ regenerada
STRIPE_WEBHOOK_SECRET=whsec_...      # ⚠️ del webhook nuevo (paso 6)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Pipeline creativo
```
FLUX_QUALITY=cinematic
FLUX_REALISM_LORA=strangerzonehf/Flux-Super-Realism-LoRA
FLUX_REALISM_TRIGGER=Super Realism
CHARACTER_CONSISTENCY=on
VIDEO_MODEL=fal-ai/bytedance/seedance/v1/pro/image-to-video
LIPSYNC_MODEL=veed/fabric-1.0
AUTO_SFX=on
AUTO_MUSIC=on
CASTING_OPTIONS=2
```

### Opcionales (recomendadas para lanzar)
```
RESEND_API_KEY=                 # emails (recibos, recuperar cuenta)
NEXT_PUBLIC_POSTHOG_KEY=        # analítica
ANTHROPIC_API_KEY=             # alternativa de guion a OpenAI
```

### Para activar el pipeline PRO (después de validarlo en vivo)
```
PRO_PIPELINE=on
VIDEO_LIPSYNC_MODEL=fal-ai/sync-lipsync
```

---

## 6) Configurar el webhook de Stripe
1. En https://dashboard.stripe.com → Developers → Webhooks → Add endpoint.
2. URL: `https://tudominio.com/api/stripe/webhook`
3. Eventos: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted` (y los que use tu integración).
4. Copia el **Signing secret** (`whsec_...`) → ponlo en `STRIPE_WEBHOOK_SECRET`
   en Coolify → redeploy.

---

## 7) Checklist post-deploy (verificar que todo vive)
- [ ] `https://tudominio.com` carga el landing
- [ ] `https://tudominio.com/api/health` → todas las claves en `true`
- [ ] Registrarte crea cuenta y da los NAVOS de bienvenida
- [ ] Crear un video real → sale el MP4 (requiere saldo fal + Shotstack)
- [ ] Compra de prueba en Stripe (modo test primero) → suma NAVOS
- [ ] Webhook de Stripe responde 200 en el dashboard de Stripe

---

## Notas importantes
- **Almacenamiento:** `/app/storage` del contenedor es efímero (se borra al
  redesplegar) — está bien: los videos finales viven en fal.storage.
- **Base de datos:** Turso es remoto, funciona igual desde el VPS. No pierdes
  datos en redeploys.
- **Jobs largos:** en VPS no hay timeout de función (a diferencia de Vercel),
  así que la producción de minutos corre sin problema.
- **Escalar:** cuando tengas volumen, mueve los jobs de video a una cola +
  worker para que el servidor web quede liviano.
