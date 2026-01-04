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

# Prisma schema includes a second generator that outputs into `backend/node_modules/...`.
# Ensure the path exists so `npm ci` (and Prisma generate) does not fail.
RUN mkdir -p backend/node_modules/.prisma/client

RUN npm ci

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
