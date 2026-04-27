---
phase: 25-multi-stage-dockerfiles-image-hardening
plan: 05
type: execute
wave: 2
depends_on:
  - 02
  - 03
files_modified:
  - apps/web/Dockerfile
  - apps/web/.dockerignore
autonomous: true
requirements:
  - DEPLOY-02
must_haves:
  truths:
    - "docker build -f apps/web/Dockerfile . -t sms-web:phase25-test from repo root succeeds without secret leakage"
    - "Resulting image size is at most 220 MB"
    - "Resulting image runs as non-root uid 1001 (app:app); docker run --rm sms-web:phase25-test id confirms"
    - "Container boots on port 3000, serves /api/health returning {ok:true} (Plan 02 route handler available)"
    - "Image does NOT contain tini (D-07 — web has no FFmpeg children, single Node process)"
  artifacts:
    - path: apps/web/Dockerfile
      provides: "Production Next.js 15 standalone Dockerfile (3 stages: deps, builder, runtime)"
      contains: "FROM node:22-bookworm-slim"
    - path: apps/web/.dockerignore
      provides: "Per-app build-context exclusions extending root .dockerignore"
      contains: "tests"
  key_links:
    - from: apps/web/Dockerfile (builder stage)
      to: apps/web/next.config.ts (Plan 03 outputFileTracingRoot)
      via: "pnpm build emits .next/standalone/ with workspace files traced"
      pattern: "pnpm build"
    - from: apps/web/Dockerfile (runtime stage)
      to: apps/web/src/app/api/health/route.ts (Plan 02)
      via: "HEALTHCHECK CMD curl -fsS http://localhost:3000/api/health"
      pattern: "HEALTHCHECK"
---

<objective>
Produce the production web Docker image artifact required by DEPLOY-02:
- 3-stage build (deps then builder then runtime) per ARCHITECTURE.md Dockerfile Strategy lines 217-259, modified per phase decisions D-07, D-11, D-16, D-17.
- Base image node:22-bookworm-slim (D-16, locked decision).
- Builder stage runs `pnpm build` after `outputFileTracingRoot` is set (Plan 03 dependency) so `.next/standalone/` includes monorepo workspace files.
- Runtime stage installs `curl` (for HEALTHCHECK) but DOES NOT install tini (D-07 — single Node process, no FFmpeg children, save approximately 600KB).
- Runs as `app:app` uid 1001 (non-root).
- HEALTHCHECK calls `/api/health` (the Next.js route handler created in Plan 02).
- Drop the `COPY packages/` line from the ARCHITECTURE.md sample (D-17, same as D-15 for api).
- Per-app `.dockerignore` excludes test files, `.next/cache/` (build cache, not standalone output), `next-env.d.ts`, vitest config; KEEPS `.next/standalone/`, `.next/static/`, `public/` (D-11).

Purpose: Phase 26 compose references the GHCR image built from this Dockerfile; Phase 27 Caddy proxies the default route to web:3000; Phase 30 smoke test verifies the deployed UI loads.
Output: 2 new files (apps/web/Dockerfile, apps/web/.dockerignore); 0 modifications to other files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md
@.planning/research/ARCHITECTURE.md

@apps/web/next.config.ts
@apps/web/package.json
@pnpm-workspace.yaml
@.dockerignore

<interfaces>
ARCHITECTURE.md Dockerfile Strategy lines 217-259 sample (web Dockerfile) is the BASE template.
Modifications per phase 25 decisions:
- D-16: base image MUST be node:22-bookworm-slim.
- D-17: DROP COPY packages/ line (no packages/ dir in this monorepo).
- D-07: do NOT install tini in runtime stage. ARCHITECTURE.md sample includes tini for web; we deviate. No FFmpeg children + single Node process means no zombie risk + no signal-forwarding need.
- HEALTHCHECK target: /api/health (Plan 02 route handler).
- corepack enable: required because base image has Node 22 but pnpm is downloaded via corepack.

Next.js 15 standalone output structure (verified via Task 2 of Plan 03 build):
- apps/web/.next/standalone/ — top-level node_modules + apps/web/server.js + apps/web/.next/server (server bundle)
- apps/web/.next/standalone/apps/web/server.js — entry point (path reflects monorepo structure when outputFileTracingRoot points at repo root)
- apps/web/.next/static/ — static assets (NOT under standalone, must be copied separately)
- apps/web/public/ — public assets (NOT under standalone, must be copied separately)

Runtime CMD entry point: `node apps/web/server.js`. WORKDIR for the runtime stage is /app. Standalone is copied flat into /app; Next.js standalone server.js path becomes /app/apps/web/server.js.

apps/web/package.json (verified):
- "dev": "next dev --turbopack --port 3000" (default port 3000)
- "build": "next build" (produces .next/standalone via output:'standalone' in next.config.ts)

Build command (used by Plan 06 verification + Phase 28 CI):
docker build -f apps/web/Dockerfile . -t sms-web:phase25-test
Build context = repo root (.) — required so root pnpm-workspace.yaml + pnpm-lock.yaml are accessible.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create apps/web/.dockerignore (per-app build-context exclusions)</name>
  <files>apps/web/.dockerignore</files>
  <read_first>
    - .dockerignore (root, Phase 24) — verify what is already excluded; per-app extends root via BuildKit closest-wins
    - apps/web/package.json (verify there are no dev scripts to exclude beyond vitest)
    - apps/web/next.config.ts (verify outputFileTracingRoot is set per Plan 03 — required for the standalone output we COPY in runtime stage)
  </read_first>
  <action>
    Create file apps/web/.dockerignore with EXACTLY this content:

    --- BEGIN FILE CONTENT ---
    # apps/web/.dockerignore — extends root .dockerignore with web-specific scope.
    # Phase 25 D-11. BuildKit applies the closest .dockerignore to each build
    # context; root .dockerignore (Phase 24) covers Secrets / VCS / Dependencies
    # / Build / Coverage / Planning / Data / IDE / Logs / Examples — DO NOT
    # duplicate those patterns here. This file adds web-only exclusions.
    #
    # CRITICAL — DO NOT exclude any of:
    #   - .next/standalone/  (the production server bundle, runtime COPY target)
    #   - .next/static/      (static assets served by the standalone server)
    #   - public/            (public assets — favicon, og images, etc.)
    # The root .dockerignore excludes `.next/` recursively, but we re-include
    # the standalone+static subdirs by NOT listing them here. (BuildKit applies
    # the closest .dockerignore; root rule is "ignore .next" which still ignores
    # .next/cache and .next/server/.cache from the build context — but in the
    # multi-stage Dockerfile we COPY .next/standalone and .next/static FROM the
    # builder stage, not from the build context, so root's `.next` rule does
    # not affect them. This file simply adds the per-app extras.)

    # === Tests ===
    tests
    **/tests
    **/*.test.ts
    **/*.spec.ts
    **/*.test.tsx
    **/*.spec.tsx
    vitest.config.ts
    vitest.config.*.ts

    # === Build artifacts not needed at runtime ===
    # .next/cache/ is the build cache — large, not needed once standalone is produced.
    .next/cache
    # next-env.d.ts is regenerated by next on every dev start; not needed in the image.
    next-env.d.ts
    tsconfig.tsbuildinfo

    # === Local debug/instrumentation ===
    *.log
    npm-debug.log*
    pnpm-debug.log*
    --- END FILE CONTENT ---

    Do NOT add patterns that exclude `public/`, `src/`, `next.config.ts`, `package.json`, or `.next/standalone/`/`.next/static/` — these MUST be in build context (D-11 Keep list).
  </action>
  <verify>
    <automated>test -f apps/web/.dockerignore && grep -qE "^tests$" apps/web/.dockerignore && grep -q "vitest.config.ts" apps/web/.dockerignore && grep -q ".next/cache" apps/web/.dockerignore && grep -q "next-env.d.ts" apps/web/.dockerignore && ! grep -qE "^\.next/standalone" apps/web/.dockerignore && ! grep -qE "^public" apps/web/.dockerignore && ! grep -qE "^src" apps/web/.dockerignore</automated>
  </verify>
  <acceptance_criteria>
    - File apps/web/.dockerignore exists.
    - Contains line `tests` (exact match).
    - Contains line `vitest.config.ts`.
    - Contains line `.next/cache`.
    - Contains line `next-env.d.ts`.
    - Does NOT contain a line starting with `.next/standalone` (would break runtime).
    - Does NOT contain a line starting with `public` or `public/` (would break static assets).
    - Does NOT contain a line starting with `src` (would break the build).
    - Does NOT contain `package.json` (would break workspace dependency resolution).
  </acceptance_criteria>
  <done>Per-app .dockerignore exists with all required exclusions and zero accidental exclusions of must-keep paths.</done>
</task>

<task type="auto">
  <name>Task 2: Create apps/web/Dockerfile (3-stage Next.js standalone build)</name>
  <files>apps/web/Dockerfile</files>
  <read_first>
    - apps/web/next.config.ts (verify Plan 03 outputFileTracingRoot is in place — REQUIRED prerequisite for this Dockerfile to produce a working standalone tree)
    - apps/web/package.json (verify scripts.build = "next build")
    - .planning/research/ARCHITECTURE.md lines 217-259 (the canonical 3-stage sample to adapt)
    - .planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md decisions D-07, D-11, D-16, D-17 (modifications to the sample)
  </read_first>
  <action>
    Create file apps/web/Dockerfile with the following 3-stage structure. EXACT content below — copy verbatim except where noted otherwise. Build context is repo root.

    --- BEGIN FILE CONTENT ---
    # apps/web/Dockerfile — Production Next.js 15 standalone build for the SMS Platform web.
    # Phase 25 (DEPLOY-02). Build from repo root:
    #   docker build -f apps/web/Dockerfile . -t sms-web:phase25-test
    #
    # 3 stages:
    #   1. deps    — install ALL deps for build
    #   2. builder — next build (produces .next/standalone/ + .next/static/)
    #   3. runtime — minimal final image, non-root, curl for HEALTHCHECK
    #
    # Phase 25 D-07: NO tini in web image. Web is a single Node process with no
    # FFmpeg children, so there are no zombies to reap and no SIGTERM forwarding
    # need. Saves approximately 600KB vs the api image. Phase 26 compose still
    # gets `init: true` for defense-in-depth.
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
    # Note: NO tini here (D-07) — single Node process, no FFmpeg children.
    RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
     && rm -rf /var/lib/apt/lists/* \
     && groupadd -r app \
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
    --- END FILE CONTENT ---

    Critical do-NOTs:
    - Do NOT add `COPY packages/ ./packages/` (D-17: monorepo has no packages/ dir).
    - Do NOT use `node:22-slim` — must be `node:22-bookworm-slim` (D-16).
    - Do NOT install tini in runtime (D-07).
    - Do NOT add `ENTRYPOINT ["/usr/bin/tini", "--"]` (D-07).
    - Do NOT change HEALTHCHECK path (must be /api/health to match Plan 02 route handler).
  </action>
  <verify>
    <automated>test -f apps/web/Dockerfile && grep -q "FROM node:22-bookworm-slim AS deps" apps/web/Dockerfile && grep -q "FROM deps AS builder" apps/web/Dockerfile && grep -q "FROM node:22-bookworm-slim AS runtime" apps/web/Dockerfile && grep -q "useradd -r -g app -u 1001 app" apps/web/Dockerfile && grep -q "CMD \[\"node\", \"apps/web/server.js\"\]" apps/web/Dockerfile && grep -q "curl -fsS http://localhost:3000/api/health" apps/web/Dockerfile && grep -q "USER app" apps/web/Dockerfile && grep -q "EXPOSE 3000" apps/web/Dockerfile && ! grep -q "tini" apps/web/Dockerfile && ! grep -q "COPY packages" apps/web/Dockerfile && ! grep -q "node:22-slim AS" apps/web/Dockerfile</automated>
  </verify>
  <acceptance_criteria>
    - File apps/web/Dockerfile exists.
    - Contains exactly 3 stage declarations (verifiable: `grep -c "^FROM " apps/web/Dockerfile` returns 3).
    - Contains exact string `FROM node:22-bookworm-slim AS deps`.
    - Contains exact string `FROM deps AS builder`.
    - Contains exact string `FROM node:22-bookworm-slim AS runtime`.
    - Contains exact string `useradd -r -g app -u 1001 app`.
    - Contains exact string `CMD ["node", "apps/web/server.js"]`.
    - Contains exact string `EXPOSE 3000`.
    - Contains exact string `USER app`.
    - HEALTHCHECK line targets `http://localhost:3000/api/health`.
    - Does NOT contain string `tini` anywhere (D-07 — case-sensitive grep).
    - Does NOT contain string `COPY packages` (D-17).
    - Does NOT contain `node:22-slim AS` (must be bookworm-slim, D-16).
  </acceptance_criteria>
  <done>3-stage production Dockerfile exists with all required hardening (non-root, curl, no tini per D-07, healthcheck) and zero deviations from D-07/D-11/D-16/D-17 decisions.</done>
</task>

<task type="auto">
  <name>Task 3: Build the web image and verify size + non-root + boot + health endpoint</name>
  <files>(no file changes — verification only)</files>
  <read_first>
    - apps/web/Dockerfile (file from Task 2 — must exist)
    - apps/web/.dockerignore (file from Task 1 — must exist)
    - apps/web/next.config.ts (verify Plan 03 outputFileTracingRoot is in place — REQUIRED prerequisite)
    - apps/web/src/app/api/health/route.ts (verify Plan 02 route handler is in place)
  </read_first>
  <action>
    Build the image and run the D-19 partial checklist (steps 6-8 specific to web). Plan 06 will run the full 11-step checklist.

    1. Build:
       `docker build -f apps/web/Dockerfile . -t sms-web:phase25-test`
       Expected: build succeeds, all 3 stages complete.

    2. Size check (D-19 step 7):
       `docker images sms-web:phase25-test --format '{{.Size}}'`
       Expected output: a value parseable as at most 220 MB. Convert to bytes and assert at most 220 * 1024 * 1024.

    3. Non-root check:
       `docker run --rm sms-web:phase25-test id`
       Note: web image has no shell entrypoint by default; `id` may not be on PATH for the default CMD. Use:
       `docker run --rm --entrypoint /bin/sh sms-web:phase25-test -c id`
       Expected stdout: contains substring `uid=1001(app) gid=1001(app)`.

    4. Boot + health check (D-19 step 8):
       Run the container detached, wait, curl /api/health, then clean up:
       ```
       docker run --rm -d -p 3000:3000 --name sms-web-25-05 sms-web:phase25-test
       sleep 12
       curl -fsS http://localhost:3000/api/health
       docker rm -f sms-web-25-05
       ```
       Expected curl output: `{"ok":true}` (HTTP 200, served by the Next.js route handler from Plan 02).

    Capture the build log + each command's output for the SUMMARY.md.
  </action>
  <verify>
    <automated>docker build -f apps/web/Dockerfile . -t sms-web:phase25-test > /tmp/web-build-25-05.log 2>&1 && SIZE=$(docker images sms-web:phase25-test --format '{{.Size}}') && docker run --rm --entrypoint /bin/sh sms-web:phase25-test -c 'id' | grep -q "uid=1001(app)" && docker run --rm -d -p 3000:3000 --name sms-web-25-05-verify sms-web:phase25-test > /dev/null && sleep 12 && curl -fsS http://localhost:3000/api/health | grep -q '"ok":true' && docker rm -f sms-web-25-05-verify > /dev/null</automated>
  </verify>
  <acceptance_criteria>
    - `docker build -f apps/web/Dockerfile . -t sms-web:phase25-test` exits 0.
    - `docker images sms-web:phase25-test --format '{{.Size}}'` returns a value at most 220MB. Plan 06 will assert numerically.
    - `docker run --rm --entrypoint /bin/sh sms-web:phase25-test -c 'id'` stdout contains `uid=1001(app) gid=1001(app)`.
    - Container started detached on port 3000 responds to `curl http://localhost:3000/api/health` with HTTP 200 and body containing `"ok":true`.
    - Container cleanup (`docker rm -f sms-web-25-05-verify`) succeeds.
  </acceptance_criteria>
  <done>web image builds successfully, runs as uid 1001, boots to port 3000, /api/health returns {ok:true}.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Build context (repo) -> image layers | COPY commands move files into layers; root + per-app .dockerignore are the only barriers |
| Image layer -> docker history | Layers are public-readable on GHCR (Phase 28); secrets in any layer leak via `docker history` (Pitfall 8) |
| Container PID 1 -> kernel | Web has no child processes; default Node-as-PID-1 is acceptable (D-07). Phase 26 compose adds `init: true` for defense-in-depth. |
| Non-root container user -> host kernel | uid 1001 minimizes damage from container escape |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-14 | Information Disclosure | .env / secrets in image layer | mitigate | Root .dockerignore (Phase 24) excludes .env*, .git, .planning/, etc. Per-app apps/web/.dockerignore extends with tests/.next/cache exclusions. Multi-stage runtime stage NEVER does `COPY .` — only specific `COPY --from=builder /app/apps/web/.next/...` paths. |
| T-25-15 | Elevation of Privilege | Container running as root | mitigate | Runtime stage creates `app:app` uid 1001 via `groupadd -r && useradd -r -u 1001` and switches via `USER app` before CMD. |
| T-25-16 | Denial of Service | Container boot fails (missing workspace files) | mitigate | Plan 03 sets outputFileTracingRoot in next.config.ts so .next/standalone/ captures pnpm workspace files. Task 3 step 4 verifies boot + health response. |
| T-25-17 | Information Disclosure | Build context exfiltration | mitigate | Combined root + per-app .dockerignore exclude .env*, .git, .planning/, .claude/, *.log, docker-data/, tests/, vitest.config.ts, .next/cache, etc. |
| T-25-18 | Tampering | Public assets missing at runtime | mitigate | Runtime stage explicitly `COPY --from=builder /app/apps/web/public ./apps/web/public` (separate from standalone since public is not in .next/standalone). |
</threat_model>

<verification>
1. `apps/web/.dockerignore` exists and matches D-11 spec (Task 1 acceptance).
2. `apps/web/Dockerfile` exists, has 3 stages, uses bookworm-slim base, runs as uid 1001, has NO tini (D-07), healthchecks /api/health (Task 2 acceptance).
3. Image builds, is at most 220MB, boots to port 3000, /api/health returns {ok:true} (Task 3 acceptance).
</verification>

<success_criteria>
- DEPLOY-02 success criteria #3, #4 satisfied: web image builds, is at most 220MB, runs non-root, boots port 3000, serves /api/health.
- Phase 27 Caddy can proxy default route to web:3000 with same-origin pattern.
- Phase 28 CI can `docker buildx build --platform linux/amd64 -f apps/web/Dockerfile .` without modification.
</success_criteria>

<output>
After completion, create `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-05-SUMMARY.md` recording image size, sha256 digest, and the verification command outputs from Task 3.
</output>
