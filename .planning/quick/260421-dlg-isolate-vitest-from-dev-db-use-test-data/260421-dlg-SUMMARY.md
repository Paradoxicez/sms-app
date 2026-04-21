---
phase: 260421-dlg
plan: 01
subsystem: testing
tags: [vitest, prisma, postgres, test-isolation, rls, safety-guard]

# Dependency graph
requires:
  - phase: 260420-nmu
    provides: SystemPrismaService swap pattern (the trigger that exposed the dev-DB-wipe risk in test cleanup)
provides:
  - Dedicated `sms_platform_test` Postgres database with full Prisma schema + all RLS policies
  - Vitest globalSetup that rewrites `DATABASE_URL` / `DATABASE_URL_MIGRATE` / `SYSTEM_DATABASE_URL` to `TEST_DATABASE_URL` before any Prisma client is constructed
  - Triple-layer safety guard preventing `pnpm test` from ever connecting to the dev DB
  - Idempotent bootstrap script auto-invoked by the `pretest` npm hook
affects: [all future apps/api test work, CI pipeline setup, contributor onboarding]

# Tech tracking
tech-stack:
  added: []  # No new dependencies — pure config + 15-line .env loader
  patterns:
    - "Vitest globalSetup as connection-target rewriter (runs before setupFiles, before any module-load-time Prisma constructor)"
    - "Triple-guard test-DB isolation: bootstrap script + globalSetup + per-file setup all enforce *test* in DB name"
    - "Bootstrap script idempotency via SELECT-then-CREATE for `CREATE DATABASE` (Postgres has no IF NOT EXISTS for CREATE DATABASE)"

key-files:
  created:
    - apps/api/.env.test.example
    - apps/api/scripts/setup-test-db.sh
    - apps/api/tests/global-setup.ts
  modified:
    - apps/api/tests/setup.ts
    - apps/api/vitest.config.ts
    - apps/api/package.json
    - .gitignore

key-decisions:
  - "Rewrite env vars in globalSetup instead of shell-level munging — survives pnpm/npm/Vitest worker boundaries reliably"
  - "Use the same TEST_DATABASE_URL for all three Prisma env vars (DATABASE_URL, DATABASE_URL_MIGRATE, SYSTEM_DATABASE_URL) — tests already run as sms superuser, so single URL is sufficient"
  - "No dotenv-cli dependency — 15-line loadEnvTest() in globalSetup keeps the dependency footprint at zero"
  - "Bootstrap drops and recreates `public` schema on each run — test DB is ephemeral, deterministic state matters more than speed"

patterns-established:
  - "Pattern: vitest globalSetup is the canonical place to mutate env vars that Prisma reads at module-load time"
  - "Pattern: defense-in-depth on connection target — bootstrap script + globalSetup + setupFiles all independently assert `*test*` in DB name"
  - "Pattern: pretest hook chains schema/RLS bootstrap so tests are runnable from a clean clone after a single .env.test copy"

requirements-completed: [QUICK-260421-dlg]

# Metrics
duration: ~45min
completed: 2026-04-21
---

# Phase 260421-dlg: Isolate Vitest from Dev DB Summary

**Dedicated `sms_platform_test` Postgres DB with full schema + RLS, vitest globalSetup that rewrites Prisma env vars before any client is constructed, and a triple-guard safety net that makes accidental dev-DB wipe physically impossible.**

## Performance

- **Duration:** ~45 min (single atomic implementation task + 4-check human verification)
- **Started:** 2026-04-21 (Task 1 implementation)
- **Completed:** 2026-04-21 (Task 2 verification approved)
- **Tasks:** 2 (1 implementation + 1 verification checkpoint)
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- Eliminated the dev-DB-wipe risk that triggered this plan: tests can no longer touch `sms_platform`
- `sms_platform_test` database exists in `sms-app-postgres-1` with full Prisma schema + all 3 RLS layers (`rls.policies.sql`, `rls_apply_all`, `rls_superuser_bypass_positive_signal`) + grants backfill
- Vitest globalSetup rewrites `DATABASE_URL`, `DATABASE_URL_MIGRATE`, and `SYSTEM_DATABASE_URL` to `TEST_DATABASE_URL` before any `tests/setup.ts` module-load-time Prisma client is constructed
- Triple safety guard: bootstrap script refuses non-`*test*` DB names; globalSetup throws if `TEST_DATABASE_URL == DATABASE_URL` or DB name lacks `test`; `tests/setup.ts` re-asserts the DB-name guard before opening any connection
- `pretest` hook auto-runs `db:test:setup` so the bootstrap is invisible to contributors after a one-time `.env.test` copy
- Zero application-code changes (`PrismaService` and `SystemPrismaService` untouched — they pick up the env rewrite automatically)
- Zero new dependencies (15-line `loadEnvTest()` replaces `dotenv-cli`)

## Task Commits

1. **Task 1: Bootstrap test DB + wire vitest config** — `35cf4fc` (feat)
2. **Task 2: Verify dev DB untouched + safety guard fires** — verification-only checkpoint, no commit

**Plan metadata commit:** handled by orchestrator (SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md).

## Files Created/Modified

### Created

- `apps/api/.env.test.example` — Committed template documenting `TEST_DATABASE_URL=postgresql://sms:sms_dev_password@localhost:5434/sms_platform_test`. Real `.env.test` is gitignored.
- `apps/api/scripts/setup-test-db.sh` — Idempotent bootstrap (executable, +x). Loads `.env.test`, validates `*test*` in DB name, creates DB if missing via SELECT-then-CREATE, drops+recreates `public` schema, runs `prisma db push --skip-generate --accept-data-loss`, applies all 3 RLS migration layers + grants backfill.
- `apps/api/tests/global-setup.ts` — Vitest globalSetup hook. Loads `.env.test` via 15-line POSIX-style parser, validates triple-guard (TEST_DATABASE_URL set, != DATABASE_URL, DB name contains `test`), then rewrites `process.env.DATABASE_URL`, `DATABASE_URL_MIGRATE`, `SYSTEM_DATABASE_URL` → `TEST_DATABASE_URL`. Logs `[vitest globalSetup] DATABASE_URL → sms_platform_test` for traceability.

### Modified

- `apps/api/tests/setup.ts` — Added defense-in-depth guard: re-asserts `*test*` in active DB name before constructing `testPrisma`. Switched `datasourceUrl` source from `DATABASE_URL_MIGRATE` to `DATABASE_URL` (now rewritten by globalSetup).
- `apps/api/vitest.config.ts` — Added `globalSetup: ['./tests/global-setup.ts']`. Preserved `fileParallelism: false`, `setupFiles`, `deps.inline` for better-auth.
- `apps/api/package.json` — Added `"db:test:setup": "bash scripts/setup-test-db.sh"`. Extended `pretest` from `prisma generate` to `prisma generate && pnpm run db:test:setup` so the bootstrap is automatic on every test run.
- `.gitignore` — Added `apps/api/.env.test` to the existing Environment block. `*.env.test.example` remains permitted.

## Triple Safety Design Recap

Three independent layers must ALL fail simultaneously for the dev DB to be touched. Any one of them aborts the run before a connection opens:

| Layer | Component | Guard | Failure mode |
|-------|-----------|-------|--------------|
| 1 | `scripts/setup-test-db.sh` | `case "$TEST_DB_NAME" in *test*) ;; *) exit 1 ;; esac` | Bootstrap refuses to run; `pretest` fails; `vitest` never starts |
| 2 | `tests/global-setup.ts` | Throws if `TEST_DATABASE_URL` unset, OR `TEST_DATABASE_URL == DATABASE_URL`, OR DB name lacks `test` (case-insensitive) | Vitest aborts before loading any test file or constructing any Prisma client |
| 3 | `tests/setup.ts` | Re-asserts `*test*` regex against active `DATABASE_URL` (post-rewrite) | `testPrisma` is never constructed; per-file setup throws before any TRUNCATE/DELETE can run |

Combined with the env rewrite (`DATABASE_URL` → `TEST_DATABASE_URL` in globalSetup, applied to all three Prisma-relevant env vars), every Prisma client instantiated during tests — `testPrisma`, `PrismaService`, `SystemPrismaService` — connects to `sms_platform_test`, never `sms_platform`.

## Verification Matrix

All 4 checks from `<how-to-verify>` PASSED.

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Dev DB sentinel survives full test run | PASS | Inserted `sentinel-test-260421` into `sms_platform`; ran `pnpm test` from `apps/api` (417 passed, 20 pre-existing failures, 111 todo); sentinel still present afterward; cleaned up |
| 2 | Test database exists | PASS | `docker exec sms-app-postgres-1 psql -U sms -l` lists both `sms_platform` and `sms_platform_test` |
| 3 | CI-style invocation works | PASS | Implicitly verified by Check 1 (full `pnpm test` ran end-to-end through the new pretest chain) |
| 4 | Safety guard fires when misconfigured | PASS | Forced `TEST_DATABASE_URL=postgresql://sms:.../sms_platform`; globalSetup threw `[vitest globalSetup] FATAL: TEST_DATABASE_URL database name 'sms_platform' does not contain 'test'. Refusing to run — guard against misconfiguration.`; exit code 1; no test files executed |

## Pre-existing Test Failures (Out of Scope)

20 tests in `apps/api/tests/status/*` fail with `this.prisma.camera.findFirst is not a function`. These are mock-setup bugs from commit `49adac6` (StatusService swap to `SystemPrismaService` that did not update test mocks). They fail regardless of which DB the suite targets, so they are unrelated to this plan and were excluded per CONTEXT.md scope.

**Recommendation:** track as a separate cleanup task (e.g., `quick-260421-???-fix-status-test-mocks-after-systemprismaservice-swap`).

## Threat Closure

| Threat ID | Status | Mitigation |
|-----------|--------|------------|
| T-260421-dlg-01 | MITIGATED | Two-layer guard (globalSetup + tests/setup.ts) + bootstrap-script guard = triple defense; verified by Check 4 |
| T-260421-dlg-02 | MITIGATED | `apps/api/.env.test` added to `.gitignore`; only `.env.test.example` template (no production secrets) is committed |
| T-260421-dlg-03 | MITIGATED | `setup-test-db.sh` applies all 3 RLS migration layers + grants backfill, mirroring the existing `db:push` flow; existing `tests/tenancy/rls-isolation.test.ts` remains green |
| T-260421-dlg-04 | ACCEPTED | Tests intentionally run as `sms` superuser per existing rationale in `tests/setup.ts`; unchanged by this plan |

Threat surface alias for indexing: `threat_flag: T-TEST-ISO-01` mitigated.

## Decisions Made

- **Env rewrite in globalSetup, not shell-level munging.** Survives pnpm/npm/Vitest worker boundaries reliably; shell `export` would not propagate consistently into Vitest's worker processes.
- **Single `TEST_DATABASE_URL` for all three Prisma env vars.** Tests already run as `sms` superuser per existing convention; no need for a separate role-scoped URL in test context.
- **No `dotenv-cli` dependency.** A 15-line `loadEnvTest()` POSIX-style parser inside `global-setup.ts` keeps the dependency footprint at zero and makes the env-loading behavior explicit/auditable.
- **Drop+recreate `public` schema on every bootstrap.** Test DB is ephemeral; deterministic state per run matters more than speed; eliminates schema drift between runs.
- **`--accept-data-loss` on `prisma db push`.** Intentional and safe — the test DB has no data we care about between runs; flag prevents interactive CI prompts.

## Deviations from Plan

None - plan executed exactly as written. Verification checkpoint approved on first pass.

The setup-script implementation went slightly beyond the plan's literal spec (added explicit `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` plus grants backfill plus 3 RLS layers instead of just `rls_apply_all/migration.sql`), but this was implementing the plan's *intent* faithfully: "full schema + all RLS policies applied" required matching the live `db:push` flow's full layered RLS application, not just one of the migration files. Documented here for transparency; no functional deviation from `<success_criteria>`.

## Issues Encountered

- During the orchestrator's merge-back of the worktree branch, stale local edits from earlier overloaded executor attempts required deleting the worktree branch and re-merging from commit hash `35cf4fc`. End state on `main` is correct (verified by `git show --stat 35cf4fc`). Operational note for the orchestrator workflow, not a code issue.

## User Setup Required

None — the bootstrap is fully automatic via the `pretest` hook after a one-time `.env.test` copy.

**For new contributors / fresh clones:**
```bash
cp apps/api/.env.test.example apps/api/.env.test
cd apps/api && pnpm test
```
The `pretest` hook handles `prisma generate` + `db:test:setup` automatically; first test run bootstraps `sms_platform_test`.

## Next Phase Readiness

- Test isolation is complete and verified. All future apps/api test work can proceed without dev-DB-wipe risk.
- 20 pre-existing test failures in `tests/status/*` (StatusService mock setup) are tracked separately and do not block this plan's success criteria.
- Recommend a follow-up `gsd-quick` task to fix the StatusService test mocks so the green-test count rises from 417 → 437.

## Self-Check: PASSED

- FOUND: `apps/api/.env.test.example`
- FOUND: `apps/api/scripts/setup-test-db.sh`
- FOUND: `apps/api/tests/global-setup.ts`
- FOUND: `apps/api/tests/setup.ts` (modified)
- FOUND: `apps/api/vitest.config.ts` (modified)
- FOUND: `apps/api/package.json` (modified)
- FOUND: `.gitignore` (modified)
- FOUND: commit `35cf4fc` in `git log --oneline --all`

---
*Phase: quick-260421-dlg*
*Completed: 2026-04-21*
