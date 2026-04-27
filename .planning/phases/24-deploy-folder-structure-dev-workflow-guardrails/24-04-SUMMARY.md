---
phase: 24
plan: 04
subsystem: dev-workflow
tags: [bash, smoke-test, dev-workflow, guardrail, manual-gate]
dependency_graph:
  requires: []
  provides:
    - "Manual regression smoke test for `pnpm dev` (probes api:3003 + web:3002)"
    - "D-22 step 2 verification artifact for Plan 05"
  affects:
    - "Phase 24 success criterion #1 — proves `pnpm dev` unchanged after deploy/ skeleton + Dockerfile rename + root .dockerignore"
tech_stack:
  added: []
  patterns:
    - "Bash smoke script: `set -euo pipefail` + trap on EXIT/INT/TERM/HUP + status-code-tolerant curl probe"
    - "Process group containment via `setsid` (Linux) with macOS `set -m` subshell fallback"
    - "Port-liveness proof (any 2xx/3xx/4xx accepted) over body-content check — accommodates auth-guarded /api/admin/health"
key_files:
  created:
    - "scripts/dev-smoke.sh (126 lines, executable)"
  modified: []
decisions:
  - "Probe accepts any 2xx/3xx/4xx as port-alive (NOT `curl -fsS`) — /api/admin/health returns 401 under SuperAdminGuard; the script proves the PORT listens, not the response body"
  - "Script lives at repo root `scripts/`, NOT under `deploy/scripts/` (per D-10: deploy/ = prod-only) and NOT under `apps/api/scripts/` (per D-10: smoke covers BOTH api and web)"
  - "Manual-only run in Phase 24 (per D-14) — CI integration deferred to v1.4 / Phase 30"
  - "Process-group cleanup via SIGTERM (3s grace) → SIGKILL → `lsof`-based orphan reap on ports 3003/3002 — three-layer defense against orphaned `pnpm dev` children"
  - "macOS-aware: `setsid` preferred when available; subshell with `set -m` job control as fallback"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-27T13:56:36Z"
  tasks: 1
  files_created: 1
  files_modified: 0
---

# Phase 24 Plan 04: Dev-Workflow Smoke Script Summary

Phase 24 lands a 126-line root-level `scripts/dev-smoke.sh` that boots `pnpm dev` in the background, probes api+web HTTP ports for liveness, and cleanly tears down the process group — providing a mechanical re-check that Phase 24's structural deploy work (deploy/ skeleton, Dockerfile rename, root .dockerignore, CLAUDE.md guardrail) did not regress the dev workflow.

## What Was Built

A single executable bash script at `scripts/dev-smoke.sh` (126 lines) that:

1. Reads optional env-var overrides for `API_PORT` (default 3003), `WEB_PORT` (default 3002), `BOOT_WAIT_SEC` (default 15s)
2. Spawns `pnpm dev` in the background via `setsid` (Linux) or a `set -m` subshell (macOS) so the script can SIGTERM the entire process group on cleanup
3. Sleeps 15s for tsx-watch + Next.js dev cold boot, then verifies the bg pid is still alive (catches crash-on-boot)
4. Probes `http://localhost:3003/api/health` and `http://localhost:3002/` with `curl -sS -o /dev/null -w '%{http_code}'`; accepts any 2xx/3xx/4xx status as "port alive" and only fails on `000` (connection refused/timeout) or `5xx`
5. On EXIT/INT/TERM/HUP: SIGTERMs the process group with 3s grace, SIGKILLs if still alive, then runs `lsof -ti tcp:$port | xargs kill -KILL` as orphan-reap fallback
6. On FAIL: dumps last 80 lines of the captured `pnpm dev` log to stdout for diagnosis

## Why The Probe Tolerates 401/404

Critical nuance documented inline in the script header. The string `/api/health` is referenced in `apps/api/src/audit/audit.interceptor.ts:12` SKIP_PATHS, but the actual NestJS route is `/api/admin/health` under `@Controller('api/admin')` with `@UseGuards(SuperAdminGuard)`. An unauthenticated curl returns 401 or 404 — NOT 200. The smoke script's purpose is to verify the API PORT is listening (port-liveness proof), not to verify a successful response body. This is why the script does NOT use `curl -fsS` (which would treat 4xx as failure) and matches Plan 24-04 D-13/D-15's documented intent.

## Verification Output

```
$ test -d scripts && test -f scripts/dev-smoke.sh && test -x scripts/dev-smoke.sh
(exit 0)

$ bash -n scripts/dev-smoke.sh
(exit 0)

$ wc -l scripts/dev-smoke.sh
     126 scripts/dev-smoke.sh

$ stat -f '%Sp' scripts/dev-smoke.sh
-rwxr-xr-x

$ head -20 scripts/dev-smoke.sh
#!/usr/bin/env bash
# scripts/dev-smoke.sh — Phase 24 dev-workflow regression check.
#
# Purpose:
#   Boot `pnpm dev` in the background, wait for the api (port 3003) and web
#   (port 3002) dev servers to come up, probe each port for HTTP liveness,
#   then cleanly kill the background processes. Exits 0 on success.
#
# Why a smoke script:
#   Phase 24 restructures the deploy surface (deploy/ skeleton, Dockerfile
#   rename, root .dockerignore, CLAUDE.md guardrail). None of those changes
#   should affect `pnpm dev`. This script proves it mechanically.
#
# Health-probe nuance:
#   The api's /api/admin/health route is guarded by SuperAdminGuard, so an
#   unauthenticated curl will return 401 or 404. That's fine — we want to
#   prove the PORT is listening, not that the body is 200. We accept any
#   HTTP status code in 2xx/3xx/4xx as "port is alive" and only fail on
#   curl exit-codes that mean "connection refused" or "timed out".
#
```

All 21 acceptance criteria from Plan 24-04 Task 1 PASSED:

- ✓ `test -d scripts`
- ✓ `test -f scripts/dev-smoke.sh`
- ✓ `test -x scripts/dev-smoke.sh` (mode `-rwxr-xr-x`)
- ✓ `head -1` outputs `#!/usr/bin/env bash`
- ✓ `bash -n scripts/dev-smoke.sh` exits 0
- ✓ Contains `set -euo pipefail`
- ✓ Contains `trap cleanup EXIT INT TERM HUP`
- ✓ Contains `pnpm dev` invocation (3 references)
- ✓ Contains `localhost:${API_PORT}/api/health`
- ✓ Contains `localhost:${WEB_PORT}/`
- ✓ Default `API_PORT=3003` matches `apps/api/.env` PORT
- ✓ Default `WEB_PORT=3002` matches CORS allowlist in `apps/api/src/main.ts:25`
- ✓ Default `BOOT_WAIT_SEC=15`
- ✓ Cleanup uses `kill -TERM` + `kill -KILL` + `lsof` orphan reap
- ✓ Probe uses `curl -sS -o /dev/null -w` (status-code only)
- ✓ Status switch `case "$code" in` with `000|5*) return 1`
- ✓ Does NOT use `curl -fsS` (would break against 401-guarded /api/admin/health)
- ✓ Line count = 126 (≥ 80 required)
- ✓ Does NOT hardcode stale `localhost:3001` from old Dockerfile.dev EXPOSE
- ✓ Existing files (package.json, pnpm-workspace.yaml, docker-compose.yml, .env, apps/api/src/main.ts) untouched
- ✓ No CI workflow edits (manual-only per D-14)

## Confirmation: No Other Files Modified

```
$ git diff --name-only -- package.json pnpm-workspace.yaml docker-compose.yml .env apps/api/src/main.ts
(empty)

$ git status --porcelain
(empty after commit)
```

Only one file was added (`scripts/dev-smoke.sh`); no edits to source code, package configs, compose files, or env files.

## Manual-Run Gate

Per Plan 24-04 D-15 and the script's header docblock, the actual `bash scripts/dev-smoke.sh` exit-0 run is performed in **PLAN 05 D-22 step 2** (manual verification checklist). Plan 24-04's job is only to land a syntactically valid executable script — which is now done.

## Deviations from Plan

None — plan executed exactly as written. The exact script body specified in Task 1's `<action>` block was copied verbatim, the directory was created at the documented location (repo root `scripts/`), and the executable bit was set. All 21 acceptance criteria pass on first run.

## Threat Flags

None. Smoke script does not introduce new network endpoints, auth surface, file access patterns, or schema changes. The threat model in the plan (T-24-12 DoS via orphaned processes, T-24-13 tampering via `curl -fsS`, T-24-14 secret disclosure in logs) is fully mitigated by the script's design as written.

## Commits

| Hash      | Type | Message                                                          |
| --------- | ---- | ---------------------------------------------------------------- |
| `934f398` | feat | `feat(24-04): add scripts/dev-smoke.sh dev-workflow regression check` |

## Self-Check: PASSED

- ✓ `scripts/dev-smoke.sh` exists (FOUND)
- ✓ Commit `934f398` exists in git log (FOUND)
- ✓ All 21 acceptance criteria from Task 1 verified above (no MISSING items)
