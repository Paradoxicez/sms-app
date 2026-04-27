---
phase: 25-multi-stage-dockerfiles-image-hardening
plan: 01
subsystem: api
tags: [nestjs, healthcheck, liveness, docker, swagger]

# Dependency graph
requires:
  - phase: 24-deploy-folder-structure-dev-workflow-guardrails
    provides: dev-smoke.sh regression check + audit.interceptor.ts SKIP_PATHS slot for /api/health
provides:
  - Public, unguarded GET /api/health endpoint returning {ok:true}
  - HealthController + HealthModule pattern (separate from SuperAdminGuard-protected AdminController)
  - Stable in-container probe target for Phase 25 Plan 04 (api Dockerfile HEALTHCHECK), Phase 27 (Caddy upstream probe), and Phase 30 (smoke test on clean VM)
affects:
  - 25-04-api-dockerfile (HEALTHCHECK CMD curl -fsS http://localhost:3003/api/health)
  - 25-05-web-dockerfile (web probes its own /api/health via Next.js App Router route)
  - 27-caddy-reverse-proxy (Caddy upstream health probe target)
  - 30-smoke-test (nmap + curl liveness verification on clean Ubuntu VM)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-controller liveness module pattern (controllers:[HealthController], no providers/imports)"
    - "Liveness-only response (no DB/Redis ping) per D-03 — prevents transient dependency outages from poisoning Caddy upstream selection"

key-files:
  created:
    - apps/api/src/health/health.controller.ts
    - apps/api/src/health/health.module.ts
  modified:
    - apps/api/src/app.module.ts

key-decisions:
  - "Separate HealthController + HealthModule (D-01) — matches audit.interceptor SKIP_PATHS slot at /api/health, avoids exposing SuperAdminGuard-protected AdminController"
  - "Response shape {ok:true} only (D-03) — pure liveness, no dependency probe, prevents Postgres restart cascade unhealthy → Caddy strip traffic"
  - "Swagger inclusion via @ApiTags('Health') instead of @ApiExcludeController() — Phase 28+ Caddy/operator monitoring tools can discover endpoint via OpenAPI"

patterns-established:
  - "Liveness probe pattern: @Controller('api/...') + @Get() + @ApiTags + @ApiOperation + @ApiResponse with example schema, NO @UseGuards, response {ok:true}"
  - "Single-controller module pattern: @Module({ controllers: [X] }) — no providers, no imports — for pure routing modules"

requirements-completed: [DEPLOY-01]

# Metrics
duration: 4min
completed: 2026-04-27
---

# Phase 25 Plan 01: API Health Controller Summary

**Public unguarded `GET /api/health` endpoint returning `{ok:true}` via new HealthController/HealthModule, wired into AppModule and verified against the dev pipeline.**

## Performance

- **Duration:** ~4 min (3m 35s wall clock; includes initial `pnpm install` to populate worktree node_modules)
- **Started:** 2026-04-27T16:06:41Z
- **Completed:** 2026-04-27T16:10:16Z
- **Tasks:** 3 / 3
- **Files modified:** 3 (2 created, 1 edited)

## Accomplishments

- Created `HealthController` exposing `GET /api/health` returning `{ok:true}` — public, unguarded, audited via existing SKIP_PATHS slot.
- Created `HealthModule` (single-controller, zero providers/imports) and registered it in `AppModule.imports` between `AdminModule` and `UsersModule`.
- Verified `pnpm --filter @sms-platform/api build` compiles cleanly (171 files via SWC).
- Smoke-tested live endpoint: `curl -fsS http://localhost:3003/api/health` returns HTTP 200 + body `{"ok":true}` with no auth headers.
- `bash scripts/dev-smoke.sh` PASS — both api (port 3003) and web (port 3000) respond after registering the new module; api now returns true 200 instead of the previous status-tolerant 404.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create HealthController + HealthModule** — `bfd861a` (feat)
2. **Task 2: Register HealthModule in AppModule** — `4d81b3a` (feat)
3. **Task 3: Smoke-test the endpoint locally via pnpm dev** — runtime verification only (no file changes)

_Plan metadata commit (SUMMARY) added by orchestrator after wave completes._

## Files Created/Modified

- `apps/api/src/health/health.controller.ts` (created, 28 LOC) — `@Controller('api/health')` returning `{ ok: true }`, Swagger annotated, no guards.
- `apps/api/src/health/health.module.ts` (created, 11 LOC) — single-controller NestJS module.
- `apps/api/src/app.module.ts` (modified, +2 LOC) — `import { HealthModule }` line and entry in `imports: [...]` between `AdminModule` and `UsersModule`.

## Decisions Made

- **Response format:** Used the literal `{ ok: true }` (not `{status:'ok'}` or `{ok:true, version:...}`) per D-03 to keep the body free of fingerprinting data and avoid future drift between probe expectations.
- **Module placement in `AppModule.imports`:** Placed `HealthModule,` directly after `AdminModule,` for grouping clarity (admin/health-style routes adjacent), per the plan's preferred ordering. No reorder of existing entries.
- **Verification env source:** Copied `apps/api/.env` from the canonical worktree into this parallel worktree (it is gitignored, never committed) so `start:prod` could boot — pnpm install in the worktree did not include a developer `.env`. This is environmental, not a code change.
- **Boot strategy for verification:** Used `pnpm --filter @sms-platform/api start:prod` (compiled `dist/main`) rather than `start:dev` to skip the tsx-watch warm-up, since the build was already produced by Task 2's verification step.

## Deviations from Plan

### Auto-fixed Issues

None — Tasks 1 and 2 ran exactly as written.

### Notes (non-deviations)

**Negative-control admin probe returned 404 instead of 401/403.**
- **Found during:** Task 3 (smoke-test).
- **Observation:** `curl http://localhost:3003/api/admin/health` returns 404, not 401/403 as the plan's acceptance criterion phrased it.
- **Root cause (pre-existing):** `apps/api/src/admin/admin.controller.ts` declares `AdminController` but `apps/api/src/admin/admin.module.ts` does not list it under `controllers:` (only `AdminDashboardController` and `AdminAuditLogController`). The `/api/admin/health` route therefore was never reachable in the running app — a 404 has been the actual behavior since before this plan started.
- **Why not auto-fixed:** Out of scope. The acceptance criterion's intent ("did not break the existing guarded admin route") is still satisfied — our changes added a brand-new module/controller and only edited `app.module.ts` to import it. The 404 is the *unchanged* pre-existing behavior. Touching `admin.module.ts` to register `AdminController` would be Rule 4 territory (architectural / behavior change for an unrelated controller) and explicitly outside this plan's scope.
- **Action:** Logged as a candidate for the deferred-items / future-cleanup register; no commit in this plan.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** Plan executed exactly as written; one pre-existing observation captured for later cleanup.

## Issues Encountered

- **Worktree lacked `node_modules`** — initial `pnpm --filter @sms-platform/api build` failed with `prisma: command not found` because the worktree was a fresh checkout. Resolved with `pnpm install --frozen-lockfile` (postinstall ran `prisma generate` automatically). Not a code issue, just first-time worktree bootstrap.

## User Setup Required

None — no external service configuration required. The endpoint is liveness-only and self-contained.

## Next Phase Readiness

- `GET /api/health` is stable and returns `{ok:true}` over HTTP 200 to unauthenticated callers.
- Phase 25 Plan 04 (api Dockerfile) can now declare `HEALTHCHECK CMD curl -fsS http://localhost:3003/api/health` against this endpoint with confidence.
- `audit.interceptor.ts` SKIP_PATHS already lists `/api/health` (untouched in this plan), so the route emits zero audit rows even when probed every 30s by Docker.
- Build verified (`pnpm --filter @sms-platform/api build` → 171 files compiled). Dev workflow regression (`scripts/dev-smoke.sh`) PASS.

## Self-Check: PASSED

**Files exist:**
- FOUND: apps/api/src/health/health.controller.ts
- FOUND: apps/api/src/health/health.module.ts
- FOUND: apps/api/src/app.module.ts (modified — `HealthModule` import + array entry confirmed via grep)

**Commits exist:**
- FOUND: bfd861a (Task 1)
- FOUND: 4d81b3a (Task 2)

**Runtime verification:**
- `curl -fsS http://localhost:3003/api/health` → HTTP 200, body `{"ok":true}` (verified live)
- `bash scripts/dev-smoke.sh` → exit 0 (PASS)

---
*Phase: 25-multi-stage-dockerfiles-image-hardening*
*Plan: 01*
*Completed: 2026-04-27*
