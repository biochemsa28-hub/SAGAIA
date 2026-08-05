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

# ffmpeg + ffprobe are NOT optional: the final render (services/ffmpeg/assembler.ts)
# and the storyboard slicer both shell out to them. Without this the container
# builds fine, starts fine, and then every video fails at the last step — the
# worst possible failure mode, because the money is already spent by then.
RUN apk add --no-cache ffmpeg

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

# One long-lived Node process is the whole point of leaving serverless: the job
# worker starts with it (instrumentation.ts) and keeps producing after the user
# closes the tab. Scaling to several replicas is safe — jobs are claimed with an
# atomic UPDATE — but each replica runs MAX_CONCURRENT_JOBS videos, so the real
# spend rate is replicas × MAX_CONCURRENT_JOBS.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
