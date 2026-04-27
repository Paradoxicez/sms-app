---
phase: 25-multi-stage-dockerfiles-image-hardening
plan: 04
type: execute
wave: 2
depends_on:
  - 01
files_modified:
  - apps/api/Dockerfile
  - apps/api/.dockerignore
autonomous: true
requirements:
  - DEPLOY-01
must_haves:
  truths:
    - "docker build -f apps/api/Dockerfile . -t sms-api:phase25-test from repo root succeeds without secret leakage"
    - "Resulting image size is at most 450 MB"
    - "Resulting image runs as non-root uid 1001 (app:app); docker run --rm sms-api:phase25-test id confirms"
    - "FFmpeg 5.1.x is on PATH inside the image; docker run --rm sms-api:phase25-test ffmpeg -version exits 0"
    - "tini is PID 1; docker run --rm --entrypoint /bin/sh sms-api:phase25-test -c 'which tini' returns /usr/bin/tini"
    - "Prisma migrations directory (src/prisma/migrations/) is present in the runtime image so Phase 26 sms-migrate init service can run prisma migrate deploy"
    - "apps/api/Dockerfile.dev is byte-identical to its pre-Phase-25 state (Phase 24 D-06 lock)"
  artifacts:
    - path: apps/api/Dockerfile
      provides: "Production multi-stage Dockerfile (4 stages: deps, builder, prod-deps, runtime)"
      contains: "FROM node:22-bookworm-slim"
    - path: apps/api/.dockerignore
      provides: "Per-app build-context exclusions extending root .dockerignore"
      contains: "tests"
  key_links:
    - from: apps/api/Dockerfile (runtime stage)
      to: apps/api/src/health/health.controller.ts (Plan 01)
      via: "HEALTHCHECK CMD curl -fsS http://localhost:3003/api/health"
      pattern: "HEALTHCHECK"
    - from: apps/api/Dockerfile (runtime stage)
      to: "src/prisma/ directory"
      via: "COPY --from=builder /app/apps/api/src/prisma ./apps/api/src/prisma"
      pattern: "src/prisma"
    - from: apps/api/.dockerignore
      to: "root .dockerignore"
      via: "BuildKit closest-wins resolution; per-app extends root"
      pattern: "tests"
---

<objective>
Produce the production api Docker image artifact required by DEPLOY-01:
- 4-stage build (deps then builder then prod-deps then runtime) per ARCHITECTURE.md Dockerfile Strategy lines 137-199, modified per phase decisions D-12, D-13, D-14, D-15.
- Base image node:22-bookworm-slim (D-14, locked decision in research SUMMARY.md line 27).
- Runtime stage installs ffmpeg + tini + curl + openssl + ca-certificates and runs as app:app uid 1001 (non-root).
- ENTRYPOINT [/usr/bin/tini, --] then CMD [node, dist/main] so FFmpeg children are reaped (Pitfall 3 mitigation).
- HEALTHCHECK calls /api/health (the endpoint created in Plan 01).
- --ignore-scripts on every pnpm install invocation to skip the prisma generate postinstall hook (D-12, D-13). prisma generate runs explicitly in the builder stage.
- src/prisma/ directory copied into runtime so Phase 26 sms-migrate init service can run prisma migrate deploy from the same image.
- Drop the COPY packages/ line from the ARCHITECTURE.md sample (D-15). This monorepo has only apps/api + apps/web, no packages/ directory.
- Per-app .dockerignore excludes test files, vitest config, dev scripts; KEEPS src/prisma/migrations/ and prisma/schema.prisma (D-10).

Purpose: Phase 26 compose references the GHCR image built from this Dockerfile; Phase 28 CI builds it via docker buildx build --platform linux/amd64; Phase 30 smoke test boots it on a clean VM.
Output: 2 new files (apps/api/Dockerfile, apps/api/.dockerignore); 0 modifications to other files.
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
@.planning/research/PITFALLS.md
@.planning/research/SUMMARY.md

@apps/api/Dockerfile.dev
@apps/api/package.json
@pnpm-workspace.yaml
@.dockerignore

<interfaces>
ARCHITECTURE.md Dockerfile Strategy lines 141-199 sample (api Dockerfile) is the BASE template.
Modifications per phase 25 decisions:
- D-14: base image MUST be node:22-bookworm-slim (NOT node:22-slim — bookworm-slim is the explicit research lock).
- D-15: DROP COPY packages/ ./packages/ line — this monorepo has no packages/ dir (verified pnpm-workspace.yaml has only apps/api + apps/web).
- D-12 + D-13: ALL pnpm install invocations use --ignore-scripts to skip postinstall (which runs prisma generate); generate runs explicitly in builder stage.
- HEALTHCHECK target: /api/health (NOT /health — controllers carry their own /api/ prefix in this codebase).
- corepack enable: required because base image has Node 22 but pnpm is downloaded via corepack.

apps/api/package.json engines (verified):
- node: ">=22"
- pnpm: ">=10"

apps/api/package.json prisma config:
- schema: "src/prisma/schema.prisma"
- This means pnpm prisma generate (run from /app/apps/api) reads schema from src/prisma/schema.prisma. The schema MUST be present in builder stage before generate runs.

Files that must reach the runtime stage (verified by reading apps/api source structure):
- node_modules from prod-deps (root + apps/api workspace)
- dist/ from builder (compiled JS — entry point is dist/main.js)
- src/prisma/ from builder (schema.prisma + migrations/ subdirectory) — REQUIRED for Phase 26 sms-migrate
- package.json from apps/api/ (so pnpm prisma migrate deploy invoked at runtime can find schema config)

Files NOT needed at runtime (excluded by per-app .dockerignore or by stage separation):
- tests/, vitest.config.ts, *.test.ts, *.spec.ts, *.e2e-spec.ts (D-10 exclude list)
- scripts/setup-test-db.sh, scripts/backfill-keyframe.mjs (D-10; verified via ls apps/api/scripts/)
- .env (excluded by root .dockerignore — Pitfall 8 BLOCKER)

Build command (used by Plan 06 verification + Phase 28 CI):
docker build -f apps/api/Dockerfile . -t sms-api:phase25-test
NOTE: build context is repo root (.), NOT apps/api/. Required so root pnpm-workspace.yaml + pnpm-lock.yaml are accessible.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create apps/api/.dockerignore (per-app build-context exclusions)</name>
  <files>apps/api/.dockerignore</files>
  <read_first>
    - .dockerignore (root, Phase 24) — verify what is already excluded so we do not duplicate; per-app .dockerignore EXTENDS root via BuildKit closest-wins resolution
    - apps/api/package.json (verify scripts/ directory references — backfill-keyframe.mjs, setup-test-db.sh)
    - apps/api/Dockerfile.dev (do NOT modify; referenced for context only; Phase 24 D-06 byte-identical lock)
  </read_first>
  <action>
    Create file apps/api/.dockerignore with EXACTLY this content (groups must be present; comments help future maintainers; NO blank lines INSIDE pattern groups):

    --- BEGIN FILE CONTENT ---
    # apps/api/.dockerignore — extends root .dockerignore with api-specific scope.
    # Phase 25 D-10. BuildKit applies the closest .dockerignore to each build
    # context; root .dockerignore (Phase 24) covers Secrets / VCS / Dependencies
    # / Build / Coverage / Planning / Data / IDE / Logs / Examples — DO NOT
    # duplicate those patterns here. This file adds api-only exclusions.
    #
    # CRITICAL: do NOT exclude src/prisma/migrations/ — Phase 26 sms-migrate
    # init service runs prisma migrate deploy from the api image and needs
    # the migrations directory present at runtime. Same for src/prisma/schema.prisma.

    # === Tests ===
    tests
    **/tests
    **/*.test.ts
    **/*.spec.ts
    **/*.e2e-spec.ts
    vitest.config.ts
    vitest.config.*.ts

    # === Dev scripts ===
    # backfill-keyframe.mjs is a one-off historical migration script — not needed at runtime.
    # setup-test-db.sh references the test DB — never runs in production.
    scripts/backfill-keyframe.mjs
    scripts/setup-test-db.sh

    # === Build artifacts (rebuilt in builder stage) ===
    dist
    tsconfig.tsbuildinfo

    # === Local debug/instrumentation ===
    *.log
    npm-debug.log*
    pnpm-debug.log*
    --- END FILE CONTENT ---

    Do NOT add patterns that exclude src/, src/prisma/, src/prisma/migrations/, src/prisma/schema.prisma, or package.json — these MUST be in build context (D-10 Keep list).
  </action>
  <verify>
    <automated>test -f apps/api/.dockerignore && grep -qE "^tests$" apps/api/.dockerignore && grep -q "vitest.config.ts" apps/api/.dockerignore && grep -q "scripts/setup-test-db.sh" apps/api/.dockerignore && ! grep -qE "^src/prisma" apps/api/.dockerignore</automated>
  </verify>
  <acceptance_criteria>
    - File apps/api/.dockerignore exists.
    - File contains line `tests` (exact, no leading/trailing chars on that line).
    - File contains line `vitest.config.ts`.
    - File contains line `scripts/setup-test-db.sh`.
    - File contains line `scripts/backfill-keyframe.mjs`.
    - File contains line `dist`.
    - File does NOT contain any line starting with `src/prisma` (would break Phase 26 migrate init).
    - File does NOT contain any line equal to `package.json` (would break workspace dependency resolution).
  </acceptance_criteria>
  <done>Per-app .dockerignore exists with all required exclusions and zero accidental exclusions of must-keep paths.</done>
</task>

<task type="auto">
  <name>Task 2: Create apps/api/Dockerfile (4-stage production multi-stage build)</name>
  <files>apps/api/Dockerfile</files>
  <read_first>
    - apps/api/Dockerfile.dev (Phase 24 D-06 byte-identical lock — DO NOT MODIFY THIS FILE; reference only for the apt install pattern)
    - apps/api/package.json (verify engines.node, engines.pnpm, scripts.build, prisma.schema)
    - .planning/research/ARCHITECTURE.md lines 141-199 (the canonical 4-stage sample to adapt)
    - .planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md decisions D-12 through D-15 (modifications to the sample)
    - pnpm-workspace.yaml (confirm only apps/api + apps/web — justifies dropping COPY packages/)
  </read_first>
  <action>
    Create file apps/api/Dockerfile with the following 4-stage structure. EXACT content below — copy verbatim except where noted otherwise. Build context is repo root.

    --- BEGIN FILE CONTENT ---
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
     && groupadd -r app \
     && useradd -r -g app -u 1001 app

    WORKDIR /app
    ENV NODE_ENV=production

    # Copy production deps (root + apps/api workspace), built code, Prisma client,
    # schema + migrations (Phase 26 sms-migrate runs prisma migrate deploy from this
    # image), and apps/api/package.json (for pnpm prisma * commands at runtime).
    COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
    COPY --from=prod-deps --chown=app:app /app/apps/api/node_modules ./apps/api/node_modules
    COPY --from=builder --chown=app:app /app/apps/api/dist ./apps/api/dist
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
    --- END FILE CONTENT ---

    Critical do-NOTs:
    - Do NOT add `COPY packages/ ./packages/` (D-15: monorepo has no packages/ dir).
    - Do NOT use `node:22-slim` — must be `node:22-bookworm-slim` (D-14).
    - Do NOT omit `--ignore-scripts` on any pnpm install (D-12, D-13).
    - Do NOT change HEALTHCHECK path to `/health` (codebase uses /api prefix).
    - Do NOT install tini on the web Dockerfile (that is Plan 05; D-07 says web SKIPS tini).
    - Do NOT touch apps/api/Dockerfile.dev (Phase 24 D-06 byte-identical lock).
  </action>
  <verify>
    <automated>test -f apps/api/Dockerfile && grep -q "FROM node:22-bookworm-slim AS deps" apps/api/Dockerfile && grep -q "FROM deps AS builder" apps/api/Dockerfile && grep -q "FROM node:22-bookworm-slim AS prod-deps" apps/api/Dockerfile && grep -q "FROM node:22-bookworm-slim AS runtime" apps/api/Dockerfile && grep -q "useradd -r -g app -u 1001 app" apps/api/Dockerfile && grep -q "ENTRYPOINT \[\"/usr/bin/tini\", \"--\"\]" apps/api/Dockerfile && grep -q "CMD \[\"node\", \"dist/main\"\]" apps/api/Dockerfile && grep -q "curl -fsS http://localhost:3003/api/health" apps/api/Dockerfile && grep -q "USER app" apps/api/Dockerfile && grep -q "EXPOSE 3003" apps/api/Dockerfile && grep -q "pnpm prisma generate" apps/api/Dockerfile && grep -c "ignore-scripts" apps/api/Dockerfile | awk '$1 >= 2 {exit 0} {exit 1}' && ! grep -q "COPY packages" apps/api/Dockerfile && ! grep -q "node:22-slim AS" apps/api/Dockerfile && git diff --quiet HEAD -- apps/api/Dockerfile.dev</automated>
  </verify>
  <acceptance_criteria>
    - File apps/api/Dockerfile exists.
    - Contains exactly 4 stage declarations (verifiable: `grep -c "^FROM " apps/api/Dockerfile` returns 4).
    - Contains exact string `FROM node:22-bookworm-slim AS deps`.
    - Contains exact string `FROM deps AS builder`.
    - Contains exact string `FROM node:22-bookworm-slim AS prod-deps`.
    - Contains exact string `FROM node:22-bookworm-slim AS runtime`.
    - Contains exact string `useradd -r -g app -u 1001 app`.
    - Contains exact string `ENTRYPOINT ["/usr/bin/tini", "--"]`.
    - Contains exact string `CMD ["node", "dist/main"]`.
    - Contains exact string `EXPOSE 3003`.
    - Contains exact string `USER app`.
    - HEALTHCHECK line targets `http://localhost:3003/api/health`.
    - Contains string `--ignore-scripts` at LEAST 2 times (deps stage + prod-deps stage).
    - Contains exact string `pnpm prisma generate` (explicit generate in builder).
    - Does NOT contain string `COPY packages` (D-15).
    - Does NOT contain `node:22-slim AS` (must be bookworm-slim, D-14).
    - apps/api/Dockerfile.dev is byte-identical to its pre-Phase-25 state: `git diff --quiet HEAD -- apps/api/Dockerfile.dev` exits 0.
  </acceptance_criteria>
  <done>4-stage production Dockerfile exists with all required hardening (non-root, tini, ffmpeg, curl, openssl, healthcheck) and zero deviations from D-12..D-15 decisions.</done>
</task>

<task type="auto">
  <name>Task 3: Build the api image and verify size + non-root + ffmpeg + tini</name>
  <files>(no file changes — verification only)</files>
  <read_first>
    - apps/api/Dockerfile (file from Task 2 — must exist)
    - apps/api/.dockerignore (file from Task 1 — must exist)
  </read_first>
  <action>
    Build the image and run the D-19 partial checklist (steps 1-5 specific to api). Plan 06 will run the full 11-step checklist.

    1. Build:
       `docker build -f apps/api/Dockerfile . -t sms-api:phase25-test`
       Expected: build succeeds, all 4 stages complete.

    2. Size check (D-19 step 2):
       `docker images sms-api:phase25-test --format '{{.Size}}'`
       Expected output: a value parseable as at most 450 MB. Acceptable formats from docker include `412MB`, `1.2GB`, etc. Convert to bytes and assert at most 450 * 1024 * 1024.

    3. Non-root check (D-19 step 3):
       `docker run --rm sms-api:phase25-test id`
       Expected stdout: contains substring `uid=1001(app) gid=1001(app)`.

    4. FFmpeg-on-PATH check (D-19 step 4):
       `docker run --rm sms-api:phase25-test ffmpeg -version`
       Expected stdout first line begins with `ffmpeg version 5.1` (Bookworm-slim ships FFmpeg 5.1.x).

    5. tini check (D-19 step 5):
       `docker run --rm --entrypoint /bin/sh sms-api:phase25-test -c 'which tini && /usr/bin/tini --version'`
       Expected stdout: contains `/usr/bin/tini` AND a version line beginning `tini version`.

    6. Migrations directory present check (Phase 26 prerequisite):
       `docker run --rm --entrypoint /bin/sh sms-api:phase25-test -c 'ls /app/apps/api/src/prisma/migrations/ | head'`
       Expected stdout: contains `20260427000000_init` (the squashed init migration directory verified earlier in apps/api/src/prisma/migrations/).

    Capture the build log + each command's output for inclusion in the SUMMARY.md.
  </action>
  <verify>
    <automated>docker build -f apps/api/Dockerfile . -t sms-api:phase25-test > /tmp/api-build-25-04.log 2>&1 && SIZE=$(docker images sms-api:phase25-test --format '{{.Size}}') && docker run --rm sms-api:phase25-test id | grep -q "uid=1001(app)" && docker run --rm sms-api:phase25-test ffmpeg -version | head -1 | grep -q "ffmpeg version 5" && docker run --rm --entrypoint /bin/sh sms-api:phase25-test -c 'which tini' | grep -q "/usr/bin/tini" && docker run --rm --entrypoint /bin/sh sms-api:phase25-test -c 'ls /app/apps/api/src/prisma/migrations/' | grep -q "_init"</automated>
  </verify>
  <acceptance_criteria>
    - `docker build -f apps/api/Dockerfile . -t sms-api:phase25-test` exits 0.
    - `docker images sms-api:phase25-test --format '{{.Size}}'` returns a value at most 450MB. Plan 06 will assert numerically; this task records the value.
    - `docker run --rm sms-api:phase25-test id` stdout contains `uid=1001(app) gid=1001(app)`.
    - `docker run --rm sms-api:phase25-test ffmpeg -version` stdout first line matches pattern `ffmpeg version 5\.`.
    - `docker run --rm --entrypoint /bin/sh sms-api:phase25-test -c 'which tini'` returns `/usr/bin/tini`.
    - `docker run --rm --entrypoint /bin/sh sms-api:phase25-test -c 'ls /app/apps/api/src/prisma/migrations/'` lists at least one `*_init` directory.
  </acceptance_criteria>
  <done>api image builds successfully, runs as uid 1001, has ffmpeg 5.x + tini + curl on PATH, includes prisma migrations directory.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Build context (repo) -> image layers | COPY commands move files into layers; .dockerignore is the only barrier |
| Image layer -> docker history | Layers are public-readable on GHCR (Phase 28); secrets in any layer leak via `docker history` (Pitfall 8) |
| Container PID 1 -> kernel | Bad PID 1 (e.g. naked node) leaks zombies + drops SIGTERM forwarding (Pitfall 3) |
| Non-root container user -> host kernel | uid 1001 minimizes damage from container escape |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-08 | Information Disclosure | .env / secrets in image layer | mitigate | Root .dockerignore (Phase 24) excludes .env*, .git, .planning/, etc. Per-app apps/api/.dockerignore extends with tests/scripts/dist exclusions. Multi-stage runtime stage NEVER does `COPY .` — only specific `COPY --from=builder /app/...` paths. |
| T-25-09 | Elevation of Privilege | Container running as root | mitigate | Runtime stage creates `app:app` uid 1001 via `groupadd -r && useradd -r -u 1001` and switches via `USER app` before CMD. |
| T-25-10 | Denial of Service | FFmpeg zombie processes leak PIDs | mitigate | tini installed in runtime; `ENTRYPOINT ["/usr/bin/tini", "--"]` makes tini PID 1, which reaps zombies + forwards SIGTERM (Pitfall 3 mitigation). |
| T-25-11 | Tampering | Missing prisma migrations at runtime | mitigate | Runtime stage explicitly `COPY --from=builder /app/apps/api/src/prisma ./apps/api/src/prisma` so Phase 26 sms-migrate init service can run `prisma migrate deploy`. Verified by Task 3 step 6 (`ls /app/apps/api/src/prisma/migrations/` lists `_init`). |
| T-25-12 | Spoofing | pnpm postinstall scripts run unsanitized in build context | mitigate | Every `pnpm install` invocation in the Dockerfile uses `--ignore-scripts` (D-12, D-13). Prisma generate runs explicitly in builder stage with the schema we control. |
| T-25-13 | Information Disclosure | Build context exfiltration | mitigate | Combined root + per-app .dockerignore exclude .env*, .git, .planning/, .claude/, *.log, docker-data/, tests/, vitest.config.ts, etc. Verified by Plan 06 D-19 manual `docker history` inspection. |
</threat_model>

<verification>
1. `apps/api/.dockerignore` exists and matches D-10 spec (Task 1 acceptance).
2. `apps/api/Dockerfile` exists, has 4 stages, uses bookworm-slim base, runs as uid 1001, has tini PID 1, healthchecks /api/health (Task 2 acceptance).
3. Image builds and passes non-root + ffmpeg + tini + migrations smoke checks (Task 3 acceptance).
4. `git diff --quiet HEAD -- apps/api/Dockerfile.dev` exits 0 (Phase 24 D-06 lock preserved).
</verification>

<success_criteria>
- DEPLOY-01 success criteria #1, #2 satisfied: api image builds, is at most 450MB, runs non-root with FFmpeg + tini.
- Phase 26 sms-migrate init service has prisma migrations available in this image.
- Phase 27 Caddy + Phase 30 nmap can rely on /api/health HEALTHCHECK.
- Phase 28 CI can `docker buildx build --platform linux/amd64 -f apps/api/Dockerfile .` without modification.
</success_criteria>

<output>
After completion, create `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-04-SUMMARY.md` recording image size, sha256 digest, and the 6 verification command outputs from Task 3.
</output>
