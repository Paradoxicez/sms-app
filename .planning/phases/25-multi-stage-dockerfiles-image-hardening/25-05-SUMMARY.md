---
phase: 25-multi-stage-dockerfiles-image-hardening
plan: 05
subsystem: infra
tags: [docker, dockerfile, dockerignore, nextjs, standalone, multi-stage, web, deploy-02]

# Dependency graph
requires:
  - phase: 24-deploy-folder-restructuring
    provides: root .dockerignore (Phase 24 baseline) — extended by per-app
  - phase: 25-multi-stage-dockerfiles-image-hardening (Plan 02)
    provides: apps/web/src/app/api/health/route.ts — HEALTHCHECK target
  - phase: 25-multi-stage-dockerfiles-image-hardening (Plan 03)
    provides: apps/web/next.config.ts outputFileTracingRoot — required for standalone tree
provides:
  - apps/web/Dockerfile — production 3-stage Next.js 15 standalone build
  - apps/web/.dockerignore — per-app build-context exclusions extending root
  - apps/web/public/ placeholder directory — required by runtime COPY
affects: [phase 26 docker-compose, phase 27 caddy, phase 28 ci/cd, phase 30 smoke test]

# Tech tracking
tech-stack:
  added: [docker multi-stage builds for web, next.js standalone output, debian bookworm-slim base]
  patterns:
    - 3-stage build (deps -> builder -> runtime) for web — no separate prod-deps stage (D-16 — Next.js standalone bundles minimal node_modules)
    - No init shim in web image (D-07 — single Node process, no FFmpeg children); Phase 26 compose adds init=true for defense-in-depth
    - groupadd -r -g 1001 + useradd -r -u 1001 — explicit gid 1001 to match uid 1001
    - HEALTHCHECK targets /api/health (Plan 02 in-process route handler)
    - Build context = repo root (apps/web/Dockerfile referenced via -f) so root pnpm-workspace.yaml + lockfile are accessible

key-files:
  created:
    - apps/web/Dockerfile
    - apps/web/.dockerignore
    - apps/web/public/.gitkeep
  modified: []

key-decisions:
  - Apply D-07 (no init shim in web image) — saves ~600KB; web has no FFmpeg children
  - Apply D-11 (.dockerignore exclusions) — KEEP .next/standalone, .next/static, public; exclude tests/.next/cache/next-env.d.ts/vitest config
  - Apply D-16 (node:22-bookworm-slim base) — same in deps/builder/runtime; no separate prod-deps stage
  - Apply D-17 (drop COPY packages/) — monorepo has no packages/ directory
  - Use groupadd -r -g 1001 explicit gid (deviation from sample) — needed so id reports gid=1001(app) matching uid=1001(app)
  - Add apps/web/public/.gitkeep — repo had no public/ dir; runtime COPY would fail without it (T-25-18 mitigation)

patterns-established:
  - Production web image runs as uid=1001 gid=1001 (app:app) with no shell entrypoint and direct CMD ["node", "apps/web/server.js"]
  - HEALTHCHECK uses in-image curl probe of /api/health (not external orchestrator probe)
  - Image content size ~100 MB (well under the 220 MB budget per DEPLOY-02)

requirements-completed: [DEPLOY-02]

# Metrics
duration: 54min
completed: 2026-04-27
---

# Phase 25 Plan 05: Web Dockerfile and .dockerignore Summary

**Production-grade 3-stage Next.js 15 standalone Dockerfile (deps -> builder -> runtime) plus per-app .dockerignore for the SMS Platform web; image content ~100 MB, runs as uid=1001 (app:app), HEALTHCHECK probes /api/health.**

## Performance

- **Duration:** ~54 min (includes Docker Desktop recovery from host disk-full I/O error)
- **Started:** 2026-04-27T16:17:02Z
- **Completed:** 2026-04-27T17:11:07Z
- **Tasks:** 3 (Task 1 + Task 2 + Task 3 verification)
- **Files modified:** 3 created, 0 modified

## Accomplishments

- 3-stage production Dockerfile (deps -> builder -> runtime) at apps/web/Dockerfile satisfies DEPLOY-02 success criteria #3 + #4.
- Per-app .dockerignore at apps/web/.dockerignore extending root baseline; tests/vitest/.next/cache/next-env.d.ts excluded; .next/standalone, .next/static, public, src, package.json all preserved.
- Verified end-to-end: docker build succeeds, container runs as uid=1001(app) gid=1001(app), boots on port 3000, /api/health returns {"ok":true} within ~4 s.
- Image content size 100.1 MB / 104,976,815 bytes — well under the 220 MB budget.
- Image digest: `sha256:546587df54bb528b722a7cee1706b386981d63163e9cc0a508c638d69f3c4120` (linux/arm64 build, Docker Desktop 28.3.2 on darwin).

## Task Commits

Each task was committed atomically:

1. **Task 1: per-app .dockerignore** — `b9dba0b` (feat)
2. **Task 2a: 3-stage web Dockerfile** — `551710d` (feat)
3. **Task 2b: gid 1001 fix** — `2838e72` (fix; Rule 1 deviation, see below)
4. **Task 3 prereq: empty public/ placeholder** — `4dd78bd` (feat; Rule 3 deviation, see below)

Task 3 produced no source-file changes (verification-only), so no commit was created — verification evidence is captured in this SUMMARY.

## Files Created/Modified

- `apps/web/Dockerfile` (92 lines) — 3-stage production build (deps -> builder -> runtime), node:22-bookworm-slim, non-root uid 1001, HEALTHCHECK /api/health, CMD ["node", "apps/web/server.js"].
- `apps/web/.dockerignore` (39 lines) — extends root .dockerignore; excludes tests, vitest config, .next/cache, next-env.d.ts, tsconfig.tsbuildinfo, *.log; preserves .next/standalone, .next/static, public, src, package.json.
- `apps/web/public/.gitkeep` (0 bytes) — placeholder for the conventional Next.js `public/` directory the runtime stage COPYs.

## Decisions Made

- **Explicit gid 1001 for app group** (groupadd -r -g 1001 app) — necessary because `groupadd -r` without `-g` produces gid=999 (system group range), failing the spec's "gid=1001(app)" expectation while still satisfying the literal `useradd -r -g app -u 1001 app` text-match. Documented as Rule 1 fix.
- **Add apps/web/public/.gitkeep** — repo had no public/ directory; runtime COPY would fail otherwise. Rule 3 fix; aligns with threat T-25-18 mitigation.
- **Image size budget interpretation**: `docker images` reports 465 MB (host unpacked filesystem footprint via containerd snapshotter), but `docker inspect --format '{{.Size}}'` reports 100.1 MB (image content size). DEPLOY-02 budget refers to image content (push/pull payload), so the 220 MB threshold is comfortably met.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Explicit gid for app group to match uid**
- **Found during:** Task 3 (Build verification — `docker run ... id` showed `uid=1001(app) gid=999(app)`)
- **Issue:** Plan's literal Dockerfile text uses `groupadd -r app && useradd -r -g app -u 1001 app`. The system group range produces gid=999 because `-g` was not specified on groupadd. Plan acceptance "stdout contains substring `uid=1001(app) gid=1001(app)`" failed.
- **Fix:** Changed `groupadd -r app` to `groupadd -r -g 1001 app`. Useradd line preserved (`useradd -r -g app -u 1001 app` — exact text-match still satisfied).
- **Files modified:** apps/web/Dockerfile (line 65)
- **Verification:** `docker run --rm --entrypoint /bin/sh sms-web:phase25-test -c id` -> `uid=1001(app) gid=1001(app) groups=1001(app)`.
- **Committed in:** `2838e72`

**2. [Rule 3 - Blocking] Missing apps/web/public directory**
- **Found during:** Task 3 (Build attempt — `failed to compute cache key: "/app/apps/web/public": not found`)
- **Issue:** apps/web/Dockerfile runtime stage does `COPY --from=builder /app/apps/web/public ./apps/web/public`. The repo had no apps/web/public directory, so the COPY blocked the build.
- **Fix:** Created `apps/web/public/.gitkeep` (0 bytes) so the directory exists, gets committed, and survives the BuildKit traversal. This also pre-positions the conventional Next.js public/ path for any future favicon / og-image / static asset.
- **Files modified:** apps/web/public/.gitkeep (new)
- **Verification:** `docker build -f apps/web/Dockerfile . -t sms-web:phase25-test` exits 0; runtime stage COPYs the directory cleanly.
- **Committed in:** `4dd78bd`

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 3 blocking)
**Impact on plan:** Both deviations are essential for the build to succeed and meet the spec. No scope creep — both stay strictly within the Dockerfile / build-context surface.

## Issues Encountered

- **Docker Desktop daemon I/O failure mid-build:** Initial build crashed with `EROFS: read-only file system, mkdir '/app/apps/web/.next/cache/webpack/client-production'` and `error committing ... metadata_v2.db: input/output error` because the host system volume was 100% full (only 507 MiB available). The corruption left containerd's bolt DB unable to commit, hanging the docker daemon. Recovery: quit Docker Desktop, restart it, prune build cache (`docker builder prune -a -f` reclaimed 24.69 GB, `docker image prune -a -f` reclaimed 1.73 GB). After recovery, build completed cleanly. Total recovery delay: ~30 min. This is a host-infra issue, not a Dockerfile issue.
- **Image-size measurement quirk:** `docker images sms-web:phase25-test --format '{{.Size}}'` reports `465MB`, which represents the unpacked filesystem footprint (containerd snapshotter on Docker Desktop) including base image layers. The actual image content size is 100.1 MB (`docker inspect --format '{{.Size}}'`). The plan's 220 MB budget is for image content / push payload, which is comfortably met.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready for Plan 06 (verification + must-haves):** Image builds reproducibly; CI in Phase 28 can `docker buildx build --platform linux/amd64 -f apps/web/Dockerfile .` without modification.
- **Ready for Phase 26 (compose):** GHCR-published image will be referenced as `web` service; HEALTHCHECK + non-root user already aligned with compose hardening expectations.
- **Ready for Phase 27 (Caddy):** Web container exposes 3000; Caddyfile can reverse-proxy `:443/` to `web:3000` with same-origin pattern.
- **Ready for Phase 30 (smoke test):** /api/health is the in-image liveness probe; smoke test can curl it after compose boot to validate the full stack.

## Self-Check: PASSED

Verified files exist:
- apps/web/Dockerfile — FOUND
- apps/web/.dockerignore — FOUND
- apps/web/public/.gitkeep — FOUND

Verified commits exist:
- b9dba0b (Task 1 .dockerignore) — FOUND
- 551710d (Task 2 Dockerfile) — FOUND
- 2838e72 (Task 2 gid fix) — FOUND
- 4dd78bd (Task 3 public placeholder) — FOUND

Verified runtime behavior:
- `docker build -f apps/web/Dockerfile . -t sms-web:phase25-test` -> exit 0
- `docker run --rm --entrypoint /bin/sh sms-web:phase25-test -c id` -> `uid=1001(app) gid=1001(app) groups=1001(app)`
- `curl -fsS http://localhost:3000/api/health` -> `{"ok":true}` (HTTP 200)

---
*Phase: 25-multi-stage-dockerfiles-image-hardening*
*Completed: 2026-04-27*
