FROM node:20-bookworm-slim AS base
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies (includes dev deps; needed for `next build` + Prisma generate).
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma

# Make `npm ci` more resilient in Podman/VM networking environments (macOS Podman machine can be flaky).
ENV NPM_CONFIG_FETCH_RETRIES=5 \
  NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
  NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
  NPM_CONFIG_AUDIT=false \
  NPM_CONFIG_FUND=false \
  NPM_CONFIG_UPDATE_NOTIFIER=false

RUN npm ci --no-audit --no-fund

# Build Next.js (production build enables standalone output via `next.config.js`).
FROM deps AS build
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY types ./types
COPY next-env.d.ts next.config.js tsconfig.json tailwind.config.ts postcss.config.js eslint.config.mjs ./

# Next.js can be memory-hungry during `next build`, and Podman on macOS often runs
# inside a VM with limited memory. Reduce worker parallelism to avoid SIGKILL/OOM.
ENV NEXT_PRIVATE_MAX_WORKERS=1
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN npm run build

# A tooling image to run Prisma commands (migrations) in the same network as the DB.
FROM deps AS migrator
COPY prisma ./prisma
COPY tsconfig.json ./
CMD ["npx", "prisma", "migrate", "deploy"]

# Worker image for background job processing (transcript/knowledge context)
FROM deps AS worker-build
COPY lib ./lib
COPY types ./types
COPY scripts/transcript-worker.ts ./scripts/
COPY scripts/build-worker.mjs ./scripts/
RUN node scripts/build-worker.mjs

# Prepare minimal node_modules for worker (only externalized dependencies)
FROM deps AS worker-deps
RUN rm -rf node_modules && npm ci --omit=dev --no-audit --no-fund
# Ensure Prisma client is generated for production
RUN npx prisma generate

FROM base AS worker
WORKDIR /app
ENV NODE_ENV=production
# Copy only production dependencies (much smaller than full node_modules)
COPY --from=worker-deps /app/node_modules ./node_modules
COPY --from=worker-build /app/dist-worker ./dist-worker
COPY prisma ./prisma
CMD ["node", "dist-worker/scripts/transcript-worker.js"]

# Runtime image (standalone output)
FROM base AS web
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
