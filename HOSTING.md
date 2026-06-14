# VYNAVO — Guía de Hosting para Producción en Masa

## Resumen de costos por etapa

| Etapa        | Usuarios | Hosting recomendado          | Costo/mes |
|--------------|----------|------------------------------|-----------|
| Lanzamiento  | 0–50     | Vercel Pro o Railway         | $10–20    |
| Crecimiento  | 50–500   | DigitalOcean Droplet + Coolify | $12–18  |
| Escala       | 500+     | Hetzner CX32 + Coolify       | €14       |
| Enterprise   | 5,000+   | Hetzner CX52 + múltiples workers | €45   |

---

## Opción A: Railway (migración más rápida desde Vercel)

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Variables a configurar en Railway:
- NEXTAUTH_URL
- NEXTAUTH_SECRET
- TURSO_DATABASE_URL
- TURSO_AUTH_TOKEN
- FAL_API_KEY
- ELEVENLABS_API_KEY
- SHOTSTACK_API_KEY
- OPENAI_API_KEY
- STRIPE_SECRET_KEY
- NEXT_PUBLIC_STRIPE_PUBLIC_KEY
- STRIPE_WEBHOOK_SECRET

---

## Opción B: Hetzner + Coolify (recomendada para escala)

### 1. Crear servidor en Hetzner

Ve a https://hetzner.com/cloud
- Servidor: CX22 (€4.5/mes) para empezar, CX32 (€14/mes) para producción
- OS: Ubuntu 22.04
- Región: Nuremberg o Helsinki (más baratos)
- Activa firewall: abre puertos 80, 443, 8000 (solo setup), 22

### 2. Instalar Coolify

```bash
ssh root@TU_IP_HETZNER
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Abre http://TU_IP:8000 en el navegador → crea tu cuenta admin.

### 3. Conectar GitHub y desplegar VYNAVO

1. En Coolify → Sources → Add GitHub App
2. New Resource → Application → tu repo VYNAVO
3. Build Pack: Nixpacks (detecta Next.js automáticamente)
4. Variables de entorno → agrega todas las del .env.local
5. Deploy → Coolify construye y despliega con SSL automático

### 4. Agregar Redis para jobs en background

En Coolify → New Resource → Database → Redis
- Coolify crea Redis en el mismo servidor
- Copia la URL de conexión → agrégala como REDIS_URL en la app

### 5. Correr el worker de producción

En Coolify → New Resource → Application
- Repo: el mismo de VYNAVO
- Start command: `npx tsx workers/production-worker.ts`
- Este proceso corre 24/7 y procesa los jobs de video

---

## Arquitectura de jobs (sin límite de tiempo)

```
Usuario → /api/produce-job → agrega a cola Redis
                                     ↓
                            Worker (proceso separado)
                                     ↓
                    voz → imágenes → clips → video final
                                     ↓
                            Actualiza DB → notifica usuario
```

### Paquetes necesarios para BullMQ:
```bash
npm install bullmq ioredis
```

---

## Checklist antes de migrar

- [ ] Exportar variables de entorno de Vercel
- [ ] Probar build local: `npm run build`
- [ ] Crear servidor en Hetzner/Railway
- [ ] Instalar Coolify (Hetzner) o hacer `railway init` (Railway)
- [ ] Configurar todas las variables de entorno
- [ ] Actualizar NEXTAUTH_URL con el nuevo dominio
- [ ] Actualizar redirect URLs en Google OAuth (si aplica)
- [ ] Actualizar webhooks en Stripe con la nueva URL
- [ ] Apuntar dominio DNS al nuevo servidor
- [ ] Verificar que SSL funciona
- [ ] Cambiar STRIPE_WEBHOOK_SECRET si es necesario

---

## Costos mensuales proyectados (Hetzner)

| Componente              | Costo      |
|-------------------------|------------|
| Servidor CX32 (app+worker) | €14/mes |
| Dominio .app o .io      | ~€12/año   |
| Turso DB (ya incluido)  | Gratis hasta 500MB |
| Total                   | **~€15/mes** |

Para comparar: Vercel Pro = $20/mes SIN jobs en background y CON límite de 60s.
