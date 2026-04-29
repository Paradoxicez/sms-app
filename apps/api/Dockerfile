# apps/api/Dockerfile — Production multi-stage build for the SMS Platform api.
# Phase 25 (DEPLOY-01). Build from repo root:
#   docker build -f apps/api/Dockerfile . -t sms-api:phase25-test
#
# 4 stages:
#   1. deps      — install ALL deps (incl. dev) for compile
#   2. builder   — prisma generate + nest build (SWC)
#   3. prod-deps — re-install only production deps (smaller layer)
#   4. runtime   — slim final image with ffmpeg + tini + non-root user
#
# Per Phase 25 D-13: --ignore-scripts on every pnpm install to skip the
# `postinstall: prisma generate` hook (schema is not present at deps-stage time).
# `prisma generate` runs explicitly in the builder stage where the schema is
# available. This does NOT affect host `pnpm install` (CLAUDE.md "Prisma
# schema change workflow" still works on developer machines).

# ============================================================================
# Stage 1: deps — install ALL deps (dev + prod) so the builder can compile
# ============================================================================
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# OpenSSL + ca-certificates required by Prisma engines and HTTPS to MinIO.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy lockfile + workspace manifest + per-app package.json BEFORE source
# so Docker layer cache reuses this stage when only application code changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/

# corepack enable downloads pnpm 10.x as declared in package.json engines.
# --frozen-lockfile: lockfile is source of truth (Phase 23 DEBT-05 dictates).
# --ignore-scripts: skip postinstall (`prisma generate`) — schema not yet present.
RUN corepack enable \
 && pnpm install --frozen-lockfile --ignore-scripts

# ============================================================================
# Stage 2: builder — prisma generate + nest build (SWC)
# ============================================================================
FROM deps AS builder
WORKDIR /app

# Now copy the api source — schema.prisma + src/ + tsconfig + nest-cli.json.
# Tests/dev scripts are excluded by apps/api/.dockerignore at COPY time.
COPY apps/api/ ./apps/api/

WORKDIR /app/apps/api
# Explicit prisma generate (postinstall was skipped via --ignore-scripts).
# nest build runs SWC compile and writes to apps/api/dist/.
RUN pnpm prisma generate \
 && pnpm build

# ============================================================================
# Stage 3: prod-deps — re-install ONLY production deps for smaller runtime
# ============================================================================
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/

# --prod: skip devDependencies. --ignore-scripts: same rationale as deps stage.
RUN corepack enable \
 && pnpm install --frozen-lockfile --prod --ignore-scripts

# ============================================================================
# Stage 4: runtime — slim final image with ffmpeg + tini + non-root user
# ============================================================================
FROM node:22-bookworm-slim AS runtime

# ffmpeg: required by ResilienceService child processes (Phase 15).
# tini: PID 1 reaper for FFmpeg zombies + signal forwarding (Pitfall 3, D-06).
# curl: HEALTHCHECK probe target.
# openssl + ca-certificates: Prisma engines + HTTPS to MinIO/external services.
# Non-root app:app uid 1001 (D-14, defense-in-depth + security scan compliance).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    tini \
    curl \
    openssl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r -g 1001 app \
 && useradd -r -g app -u 1001 app

WORKDIR /app
ENV NODE_ENV=production

# Copy production deps (root + apps/api workspace), built code, Prisma client,
# schema + migrations (Phase 26 sms-migrate runs prisma migrate deploy from this
# image), and apps/api/package.json (for pnpm prisma * commands at runtime).
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=prod-deps --chown=app:app /app/apps/api/node_modules ./apps/api/node_modules
# Override @prisma + .prisma from builder: prod-deps was installed with
# --ignore-scripts which skips @prisma/engines postinstall (downloads
# schema-engine + libquery_engine binaries). Builder ran `prisma generate`
# which triggered the engine download. Without these overrides, runtime
# `prisma migrate deploy` tries to fetch engines from binaries.prisma.sh
# at runtime → fails on the internal-only network used by sms-migrate.
COPY --from=builder --chown=app:app /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=app:app /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=app:app /app/apps/api/bin ./apps/api/bin
COPY --from=builder --chown=app:app /app/apps/api/src/prisma ./apps/api/src/prisma
COPY --from=builder --chown=app:app /app/apps/api/package.json ./apps/api/

USER app
WORKDIR /app/apps/api
EXPOSE 3003

# HEALTHCHECK target = /api/health (Plan 01 of Phase 25).
# Liveness only; no DB/Redis ping (D-03 minimal).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3003/api/health || exit 1

# tini as PID 1 reaps FFmpeg zombies and forwards SIGTERM correctly.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main"]
