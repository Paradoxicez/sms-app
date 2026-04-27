---
phase: 25-multi-stage-dockerfiles-image-hardening
plan: 02
subsystem: infra
tags: [nextjs, app-router, healthcheck, docker, route-handler]

# Dependency graph
requires:
  - phase: 24-deploy-folder-structure-dev-workflow-guardrails
    provides: "Dockerfile.dev rename + root .dockerignore baseline (clears apps/web/Dockerfile slot for Plan 05)"
provides:
  - "Next.js App Router GET /api/health route returning {ok:true} as in-process liveness probe"
  - "Self-contained web container HEALTHCHECK target for apps/web/Dockerfile (Plan 05)"
affects:
  - "25-05 (web Dockerfile HEALTHCHECK CMD curl http://localhost:3000/api/health)"
  - "25-06 (verification — docker run sms-web smoke test hitting /api/health)"
  - "26 (compose) — no override required because HEALTHCHECK is image-level"
  - "27 (Caddy) — proxies /api/* to api:3003, NOT to web; this handler is internal-only"
  - "30 (smoke test) — clean-VM curl on /api/health for both api+web containers"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Next.js App Router route handlers (apps/web/src/app/api/*) — first instance"
    - "Local route handler precedence over next.config.ts rewrites for path-scoped overrides"

key-files:
  created:
    - apps/web/src/app/api/health/route.ts
  modified: []

key-decisions:
  - "D-02: Web /api/health is a local Next.js route handler, NOT a rewrite to api — Dockerfile HEALTHCHECK runs in-container where rewrite chain doesn't apply"
  - "D-03: Response is minimal {ok:true} — pure liveness signal, no DB/Redis dependency check (avoids false-fail cascade)"
  - "Path-scoped to /api/health only — /api/cameras / /api/policies / etc. continue to proxy via the existing rewrite (Task 2 negative-control verified)"

patterns-established:
  - "First app/api/* route in apps/web/ — establishes Next.js App Router route-handler placement convention for any future web-side endpoints"
  - "Liveness response shape {ok:true} — matches future api HealthController shape (Plan 25-01) for consistency across Caddy probes"

requirements-completed: [DEPLOY-02]

# Metrics
duration: 3m21s
completed: 2026-04-27
---

# Phase 25 Plan 02: Web Health Route Summary

**Next.js App Router GET /api/health route handler returning `{ok:true}` in-process — enables self-contained HEALTHCHECK in apps/web/Dockerfile (Plan 05) without depending on the api sibling.**

## Performance

- **Duration:** 3m21s
- **Started:** 2026-04-27T16:06:13Z
- **Completed:** 2026-04-27T16:09:34Z
- **Tasks:** 2 (1 file-creation, 1 runtime smoke verification)
- **Files modified:** 1 (new file)

## Accomplishments

- New `apps/web/src/app/api/health/route.ts` route handler (17 LOC including JSDoc) returning HTTP 200 + `{"ok":true}` for `GET /api/health`
- Smoke-tested live: `pnpm --filter @sms-platform/web dev` boots in ~6s and serves `/api/health` correctly in-process
- Negative-control verified: `/api/cameras` returns 401 from upstream api (NOT `{"ok":true}`) — proves the local handler is path-scoped to `/api/health` only and the existing `'/api/:path*' → ${API_URL}/api/:path*` rewrite rule remains active for all other `/api/*` routes
- First `app/api/*` instance under `apps/web/` — establishes the convention for any future web-side route handlers

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Next.js App Router health route handler** — `e532ebd` (feat)
2. **Task 2: Smoke-test the route via pnpm dev:web** — verification-only, no commit (per plan: `<files>(no file changes — runtime verification only)</files>`)

**Plan metadata:** (final SUMMARY commit performed by orchestrator after wave completes)

## Files Created/Modified

- `apps/web/src/app/api/health/route.ts` — NEW. Exports `async function GET()` returning `NextResponse.json({ ok: true })`. JSDoc explains in-process answering vs. browser-side rewrite, and HEALTHCHECK rationale.

## Decisions Made

None beyond the locked decisions captured in `25-CONTEXT.md` (D-02, D-03). Plan executed exactly as written.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

**1. Worktree missing `node_modules` for pnpm dev smoke test**

- **Found during:** Task 2 (initial probe)
- **Symptom:** `pnpm --filter @sms-platform/web dev` failed with `sh: next: command not found` — fresh worktree did not yet have `node_modules` populated.
- **Resolution:** Ran `pnpm install --prefer-offline --frozen-lockfile` at the worktree root (14.8s using local pnpm store cache, all deps resolved offline — no network downloads). After install, `pnpm dev` booted in 6s and the smoke test passed cleanly.
- **No source files modified.** This was a worktree environment setup issue, not a plan deviation.

## Smoke Test Results

```
HEALTH_CODE=200
HEALTH_BODY={"ok":true}
CAMERAS_CODE=401
CAMERAS_BODY={"message":"Not authenticated","error":"Unauthorized","statusCode":401}
HEALTH: PASS
CAMERAS: PASS (route NOT shadowed)
```

Both verification assertions satisfied:

- `curl -fsS http://localhost:3000/api/health` → 200 + `{"ok":true}` (in-process handler answers correctly)
- `curl -sS http://localhost:3000/api/cameras` → 401 from upstream api (proves the rewrite still applies to non-health paths; the handler is path-scoped to `/api/health` only — not greedy)

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 05 (web Dockerfile)** can now declare `HEALTHCHECK CMD curl -fsS http://localhost:3000/api/health` against this in-process handler. A standalone `docker run` of the web image will be healthy without any api sibling running.
- **No regression to existing browser-side `/api/*` proxy behaviour** — verified via negative-control probe.
- **No new threat surface beyond the plan's threat_model.** T-25-04 (information disclosure) and T-25-05 (route shadowing) both mitigated as planned. No new threat flags emitted.
- **No stubs introduced.** The handler answers fully in-process with the documented response shape.

## Self-Check: PASSED

- `apps/web/src/app/api/health/route.ts` — FOUND
- Commit `e532ebd` — FOUND in `git log`
- Acceptance criteria all PASS (file exists, contains `export async function GET`, contains `NextResponse.json({ ok: true })`, contains `from 'next/server'`, no `POST/PUT/DELETE/PATCH` exports)
- Live smoke verification PASS (HEALTH 200 + body, CAMERAS not-shadowed)

---
*Phase: 25-multi-stage-dockerfiles-image-hardening*
*Plan: 02*
*Completed: 2026-04-27*
