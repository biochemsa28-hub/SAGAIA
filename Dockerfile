# ─── VYNAVO — Dockerfile para VPS / Coolify / Dokploy (sin Vercel) ───────────
# Build multi-stage: deps → build → runner (imagen final pequeña con standalone).

FROM node:20-alpine AS deps
WORKDIR /app
# libc compat para algunos binarios nativos
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Carpeta de archivos temporales (se suben a fal.storage; pueden ser efímeros)
ENV STORAGE_PATH=/app/storage

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && mkdir -p /app/storage && chown -R nextjs:nodejs /app/storage

# Salida standalone de Next.js (incluye solo lo necesario para correr)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
