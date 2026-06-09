---
name: cloudflare-architect
version: 1.0.0
category: infrastructure
trigger: "cuando el usuario quiere migrar a Cloudflare, configurar Workers/D1/R2, o desplegar la app"
model_recommendation: claude-sonnet-4-6 (mejor conocimiento de infraestructura)
---

# Skill: Cloudflare Architect

## Descripción
Guía la migración de la app de Next.js local a infraestructura Cloudflare.
Cubre Workers, D1, R2, Queues, Workflows y configuración de Wrangler.

## Cuándo Usarla
- Usuario dice "configurar Cloudflare" o "migrar a CF"
- Configuración de wrangler.toml
- Creación de D1 database o R2 bucket
- Deploy de Workers
- Problemas de configuración de Cloudflare

## Checklist de Migración Phase 1 → Phase 2

### Pre-requisitos
- [ ] Cuenta Cloudflare con plan Workers Paid ($5/mes) activa
- [ ] `wrangler` instalado: `npm install -g wrangler`
- [ ] Login: `wrangler login`
- [ ] Hostinger configurado con dominio apuntando a Cloudflare nameservers

### D1 Setup
```bash
# Crear base de datos
wrangler d1 create microdrama-db

# Obtener database_id del output y ponerlo en wrangler.toml
# Correr migrations
wrangler d1 execute microdrama-db --file=./db/schema/001_initial.sql

# Verificar
wrangler d1 execute microdrama-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

### R2 Setup
```bash
# Crear bucket
wrangler r2 bucket create microdrama-assets

# Crear bucket de dev
wrangler r2 bucket create microdrama-assets-dev
```

### wrangler.toml Template
```toml
name = "microdrama-studio-api"
compatibility_date = "2024-09-23"
main = "workers/api/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "microdrama-db"
database_id = "REPLACE_WITH_YOUR_ID"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "microdrama-assets"

[[queues.producers]]
binding = "JOB_QUEUE"
queue = "microdrama-jobs"

[[queues.consumers]]
queue = "microdrama-jobs"
max_batch_size = 10
max_batch_timeout = 30

[vars]
ENVIRONMENT = "production"
```

### Equivalencias Phase 1 → Phase 2
| Phase 1 | Phase 2 | Cambio necesario |
|---|---|---|
| `better-sqlite3` | `env.DB` (D1) | Cambiar imports en repositorios |
| Local filesystem | `env.ASSETS` (R2) | Cambiar StorageService |
| In-process async | `env.JOB_QUEUE` | Mover jobs a Queue |
| Next.js API routes | Hono Workers | Migrar route handlers |

## Reglas
1. Nunca commitear `wrangler.toml` con credentials
2. Los secrets van en: `wrangler secret put OPENAI_API_KEY`
3. Nunca usar `wrangler dev --remote` en producción para tests
4. D1 tiene límite de 100k rows gratis, luego $0.75/millón
5. R2 tiene 10GB gratis, luego $0.015/GB

## Costos Estimados (MV en producción)
| Servicio | Gratis | Costo adicional |
|---|---|---|
| Workers | 100k req/día | $0.30/millón |
| D1 | 5M rows | $0.75/millón reads |
| R2 | 10GB | $0.015/GB |
| Queues | 1M ops | $0.40/millón |
| Total estimado MVP | — | ~$10-30/mes |
