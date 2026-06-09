# SAGAIA

Plataforma SaaS para generar paquetes de producción completos de microhistorias
narrativas con IA. De idea a assets listos en menos de 5 minutos.

---

## ⚠️ Pre-requisito: Instalar Node.js

**Node.js NO está instalado en este sistema. Instálalo primero:**

1. Ir a https://nodejs.org/en/download
2. Descargar **Node.js 20 LTS** (Windows Installer .msi)
3. Ejecutar el instalador con opciones por defecto
4. Reiniciar PowerShell
5. Verificar: `node --version` debe mostrar `v20.x.x`

---

## Instalación

```bash
# 1. Navegar a la carpeta del proyecto
cd C:\Users\DELL5430\SAGAIA-studio

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
copy .env.local.example .env.local
# Editar .env.local con tus API keys

# 4. Crear base de datos local
npm run db:migrate

# 5. Iniciar servidor de desarrollo
npm run dev
```

Abrir http://localhost:3000

---

## Variables de Entorno

Editar `.env.local` (creado desde `.env.local.example`):

### Requeridas para funcionar
```env
NEXTAUTH_SECRET=cualquier-string-de-32-caracteres-aleatorios
NEXTAUTH_URL=http://localhost:3000
```

### OpenAI (para generación real)
```env
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o
```
Sin esta variable, la app corre en **modo mock** automáticamente.

### ElevenLabs (para voz real)
```env
ELEVENLABS_API_KEY=...
ELEVENLABS_DEFAULT_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```
Sin esta variable, la voz corre en **modo mock** automáticamente.

### Modo Mock Forzado (desarrollo sin gastar créditos)
```env
FORCE_MOCK_AI=true
FORCE_MOCK_VOICE=true
```

---

## Correr en Local

```bash
# Desarrollo con hot-reload
npm run dev

# Build de producción
npm run build
npm run start

# Verificar TypeScript
npm run type-check

# Lint
npm run lint

# Tests unitarios
npm test

# Tests en modo watch
npm run test:watch
```

---

## Configurar OpenAI

1. Crear cuenta en https://platform.openai.com
2. Ir a API Keys → Create new secret key
3. Copiar la key (empieza con `sk-proj-`)
4. Pegar en `.env.local` como `OPENAI_API_KEY=sk-proj-...`
5. Recomendado: configurar billing limit en OpenAI dashboard

**Modelos recomendados:**
- `gpt-4o` — mejor calidad, ~$0.005 por historia
- `gpt-4o-mini` — más económico, ~$0.0003 por historia

---

## Configurar ElevenLabs

1. Crear cuenta en https://elevenlabs.io
2. Ir a Profile → API Key
3. Copiar la API key
4. Pegar en `.env.local` como `ELEVENLABS_API_KEY=...`
5. Opcional: elegir voice_id de la biblioteca de voces

**Voice IDs disponibles:**
- `21m00Tcm4TlvDq8ikWAM` — Rachel (cálida, narración)
- `ErXwobaYiN019PkySvjV` — Antoni (dramática, horror)
- `AZnzlk1XvdvUeBnXmlld` — Domi (misteriosa, thriller)

---

## Configurar Cloudflare (Fase 2 — cuando tengas cuenta)

### 1. Instalar Wrangler
```bash
npm install -g wrangler
wrangler login
```

### 2. Crear D1 Database
```bash
wrangler d1 create SAGAIA-db
# Copiar el database_id del output
```

### 3. Crear R2 Bucket
```bash
wrangler r2 bucket create SAGAIA-assets
```

### 4. Configurar wrangler.toml
```toml
name = "SAGAIA-studio-api"
compatibility_date = "2024-09-23"

[[d1_databases]]
binding = "DB"
database_name = "SAGAIA-db"
database_id = "TU_DATABASE_ID_AQUI"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "SAGAIA-assets"
```

### 5. Crear D1 Schema
```bash
wrangler d1 execute SAGAIA-db --file=./db/schema/001_initial.sql
```

### 6. Configurar Secrets
```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put NEXTAUTH_SECRET
```

---

## Desplegar con Wrangler

### Deploy del Worker API (Phase 2)
```bash
wrangler deploy
```

### Deploy del Frontend (Cloudflare Pages)
```bash
# Desde Cloudflare Dashboard → Pages → Connect GitHub
# O via CLI:
wrangler pages deploy .next --project-name=SAGAIA-studio
```

### Desplegar en Hostinger (Phase 1)
```bash
# Build
npm run build

# Subir carpeta .next + package.json al hosting
# Configurar Node.js app en Hostinger panel
# Entry point: node_modules/.bin/next start
```

---

## Estructura del Proyecto

```
SAGAIA-studio/
├── app/                    # Next.js App Router pages y API routes
├── components/             # React components
├── lib/                    # Core: validators, AI adapters, prompts
├── services/               # Business logic (story generator, voice, export)
├── db/                     # Schema SQL + migrations
├── workers/                # Cloudflare Workers (Phase 2)
├── workflows/              # Cloudflare Workflows (Phase 2)
├── skills/                 # AI skill definitions (SKILL.md)
├── mocks/                  # Mock data para tests y dev
├── tests/                  # Vitest unit + Playwright E2E
└── docs/                   # Documentación de producto y arquitectura
```

---

## Próximos Pasos (Post-MVP)

- [ ] UI completa: Dashboard, wizard de proyecto, editor de escenas
- [ ] Autenticación (NextAuth con credentials)
- [ ] Base de datos SQLite funcional
- [ ] Exportación ZIP (script + prompts + metadata)
- [ ] Integración ElevenLabs completa
- [ ] Migración a Cloudflare D1/R2
- [ ] Sistema de créditos y billing (Stripe)
- [ ] Biblioteca de personajes
- [ ] Plantillas de nicho guardadas

---

## Estado Actual

| Módulo | Estado |
|---|---|
| Product Spec | ✅ Completo |
| Arquitectura técnica | ✅ Completo |
| Estructura de carpetas | ✅ Completo |
| Schema de base de datos | ✅ Completo |
| Zod validators | ✅ Completo |
| AI Adapter (OpenAI + Mock) | ✅ Completo |
| Prompt builder | ✅ Completo |
| StoryGeneratorService | ✅ Completo |
| API Route /api/generate/story | ✅ Completo |
| Mock data | ✅ Completo |
| Skills (9 skills) | ✅ Completo |
| Tests unitarios | ✅ Completo |
| UI Dashboard | 🔲 Pendiente |
| Exportación ZIP | 🔲 Pendiente |
| ElevenLabs Service | 🔲 Pendiente |
| Auth (NextAuth) | 🔲 Pendiente |
| DB Connection (SQLite) | 🔲 Pendiente |
