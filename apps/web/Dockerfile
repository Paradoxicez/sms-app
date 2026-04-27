# apps/web/Dockerfile — Production Next.js 15 standalone build for the SMS Platform web.
# Phase 25 (DEPLOY-02). Build from repo root:
#   docker build -f apps/web/Dockerfile . -t sms-web:phase25-test
#
# 3 stages:
#   1. deps    — install ALL deps for build
#   2. builder — next build (produces .next/standalone/ + .next/static/)
#   3. runtime — minimal final image, non-root, curl for HEALTHCHECK
#
# Phase 25 D-07: NO init shim in web image. Web is a single Node process
# with no FFmpeg children, so there are no zombies to reap and no SIGTERM
# forwarding need. Saves approximately 600KB vs the api image. Phase 26
# compose still gets `init: true` for defense-in-depth.
#
# Phase 25 D-18: requires apps/web/next.config.ts to declare
# `outputFileTracingRoot: path.join(__dirname, '../../')` — Plan 03. Without
# it, .next/standalone/ misses workspace files and the container crashes
# at boot with "Cannot find module".

# ============================================================================
# Stage 1: deps — install ALL deps (dev + prod) for compile
# ============================================================================
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Copy lockfile + workspace manifest + per-app package.json BEFORE source
# so Docker layer cache reuses this stage when only application code changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/

# corepack enable downloads pnpm 10.x as declared in package.json engines.
# --frozen-lockfile: lockfile is source of truth.
# No --ignore-scripts here: web has no postinstall hooks (verified in apps/web/package.json).
RUN corepack enable \
 && pnpm install --frozen-lockfile

# ============================================================================
# Stage 2: builder — next build with standalone output
# ============================================================================
FROM deps AS builder
WORKDIR /app

# Copy the web source — next.config.ts (with outputFileTracingRoot per Plan 03),
# src/, public/, postcss config, tsconfig. Tests excluded by apps/web/.dockerignore.
COPY apps/web/ ./apps/web/

WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
# next build emits .next/standalone/ (server bundle) and .next/static/ (assets).
# outputFileTracingRoot set in next.config.ts ensures the standalone tree
# captures workspace symlinks correctly for pnpm monorepo.
RUN pnpm build

# ============================================================================
# Stage 3: runtime — minimal final image, non-root, curl for HEALTHCHECK
# ============================================================================
FROM node:22-bookworm-slim AS runtime

# curl: HEALTHCHECK probe target.
# Non-root app:app uid 1001 (D-16, defense-in-depth + security scan compliance).
# Note: NO init shim here (D-07) — single Node process, no FFmpeg children.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r -g 1001 app \
 && useradd -r -g app -u 1001 app

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output: server.js + minimal node_modules (built by next).
# Path inside standalone reflects the monorepo: apps/web/server.js.
# Static + public are NOT in standalone — must be copied separately.
COPY --from=builder --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /app/apps/web/public ./apps/web/public

USER app
EXPOSE 3000

# HEALTHCHECK target = /api/health (Plan 02 Next.js route handler).
# Liveness only; route handler returns {ok:true} in-process.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3000/api/health || exit 1

# No ENTRYPOINT — direct CMD. Single Node process under Docker's default PID 1.
# Phase 26 compose adds `init: true` for defense-in-depth zombie reaping at the
# compose layer (cheap insurance even though web doesn't spawn children).
CMD ["node", "apps/web/server.js"]
