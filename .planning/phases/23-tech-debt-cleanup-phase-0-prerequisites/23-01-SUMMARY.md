---
phase: 23
plan: 01
subsystem: prisma-migrations
tags: [debt-05, prisma, rls, migration-squash, ci-gate]
requirements: [DEBT-05]
dependency-graph:
  requires: []
  provides:
    - "0_init/migration.sql — single squashed migration baseline (schema + RLS + grants)"
    - "db:reset script — dev DB recreate via migration history"
    - "db:check-drift script — CI drift gate (Plan 23-05 consumes)"
    - "CLAUDE.md Prisma workflow rule reflects db:reset"
  affects:
    - "Plan 23-05 (CI workflow) — uses db:check-drift"
    - "Plan 23-06 (Wave 2) — destructive cleanup of 8 hand-rolled dirs + 2 standalone RLS files + setup-test-db.sh edit (BLOCKING checkpoint runs migrate-deploy first)"
    - "Phase 26 (sms-migrate init service) — assumes Prisma migration history is the source of truth"
tech-stack:
  added: []
  patterns:
    - "Idempotent RLS DO $$ ... IF NOT EXISTS $$ blocks (preserved verbatim from source files)"
    - "Prisma migrate diff --from-empty --to-schema-datamodel for schema baseline generation (Prisma 6.19 CLI)"
    - "Drift detection via --from-migrations + --exit-code (exit 0 clean, 2 drift, 1 error)"
key-files:
  created:
    - "apps/api/src/prisma/migrations/20260427000000_init/migration.sql"
  modified:
    - "apps/api/package.json"
    - "CLAUDE.md"
decisions:
  - "Folded all RLS sources (rls.policies.sql + rls-phase5.sql + 4 migrations/rls_* dirs) into a single 0_init migration with header-comment lock — new RLS = NEW migration directory"
  - "Removed db:push and db:push:skip-rls scripts entirely (no escape hatch); db:reset is the single dev DB recreate command"
  - "db:reset chains prisma generate at the end to preserve the post-step expectation from CLAUDE.md observability rule"
  - "CLAUDE.md edit was minimal swap (line 261 only) — observability paragraph at line 266 untouched"
  - "Hand-rolled dirs + standalone RLS files preserved on disk — destructive cleanup deferred to Plan 23-06 after blocking migrate-deploy verification gate"
metrics:
  duration: "≈10 minutes"
  completed: "2026-04-27"
  tasks_completed: 3
  files_created: 1
  files_modified: 2
---

# Phase 23 Plan 01: DEBT-05 Squash + db:reset/db:check-drift + CLAUDE.md Swap Summary

Squashed all 8 hand-rolled SQL files (4 data backfills + 4 RLS migrations) plus 2 standalone RLS files into a single 1345-line `0_init/migration.sql` baseline, replaced `db:push`/`db:push:skip-rls` scripts with `db:reset` + `db:check-drift`, and swapped `db:push` → `db:reset` in CLAUDE.md's Prisma schema-change workflow rule.

## What Shipped

**Single squashed migration baseline:**
- `apps/api/src/prisma/migrations/20260427000000_init/migration.sql` (1345 lines)
- Generated via `prisma migrate diff --from-empty --to-schema-datamodel src/prisma/schema.prisma --script`
- Header comment block locks the RLS section ("New RLS = NEW migration directory")
- Schema baseline (700 lines, 30+ tables, 4 enums, all FKs and indexes) at top
- Data backfills (camera_stream_url_unique → camera_push_fields → recording_segment_has_keyframe → drop_org_settings_dead_fields) appended (idempotent on fresh DB)
- RLS section (rls.policies.sql → rls-phase5.sql → rls_phase02 → rls_apply_all → rls_superuser_bypass_positive_signal) appended in canonical order
- Final `GRANT SELECT/INSERT/UPDATE/DELETE` + `GRANT USAGE, SELECT ON SEQUENCES` for newly-created tables (matches setup-test-db.sh:97 behavior)

**package.json scripts (apps/api/package.json):**
- REMOVED: `db:push` (psql + prisma db push chain, ~360 chars)
- REMOVED: `db:push:skip-rls`
- ADDED: `db:reset`: `prisma migrate reset --force --skip-seed && prisma generate`
- ADDED: `db:check-drift`: `prisma migrate diff --from-migrations src/prisma/migrations --to-schema-datamodel src/prisma/schema.prisma --exit-code`
- All other scripts (build, prebuild, start*, test, pretest, db:test:setup, postinstall, db:generate) preserved unchanged

**CLAUDE.md (line 261 only):**
- Swapped `db:push` → `db:reset` in step 1 of "Prisma schema change workflow"
- Added guidance: `prisma migrate dev --name <change>` to produce new migration directory; do NOT edit existing migrations or fall back to `db:push`
- Lines 254-260, 262-266 all preserved (steps 2-4 + observability paragraph)
- Total file line count unchanged: 301 lines (well within ±2 line budget)

## Files in apps/api/src/prisma/migrations/ (9 entries — Plan 23-06 will reduce to 1)

```
20260427000000_init/        ← NEW — squashed baseline (Task 1)
camera_push_fields/         ← preserved (Plan 23-06 Task 3 deletes)
camera_stream_url_unique/   ← preserved (Plan 23-06 Task 3 deletes)
drop_org_settings_dead_fields/  ← preserved
recording_segment_has_keyframe/ ← preserved
rls_apply_all/              ← preserved
rls_phase02/                ← preserved
rls_policies/               ← preserved
rls_superuser_bypass_positive_signal/  ← preserved
```

Standalone RLS files preserved:
```
apps/api/src/prisma/rls.policies.sql  ← Plan 23-06 Task 3 deletes
apps/api/src/prisma/rls-phase5.sql    ← Plan 23-06 Task 3 deletes
```

## CLAUDE.md Lines Changed

| Lines | Change |
|-------|--------|
| 261   | Swap (1 line replaced; ~120 chars old → ~440 chars new) |
| All other lines | Untouched |

Net diff: `+1 / -1` (one line replaced, no insertions/deletions to other lines).

## Why This Matters (Threat Mitigation)

Without this plan, `prisma migrate deploy` against a fresh production DB would silently omit RLS policies — multi-tenant data leak across orgs. T-23-01 (information disclosure at dev → prod boundary) is mitigated by the explicit cat-and-append of all 6 RLS source files in canonical order. Plan 23-06 Task 2 (BLOCKING checkpoint) verifies via `psql -c "SELECT count(*) FROM pg_policies"` against a throwaway DB before destructive deletion.

## Deviations from Plan

None — plan executed exactly as written. All 3 tasks completed in declared order, all acceptance criteria pass, no auto-fix or scope-boundary deviations.

Notes:
- Worktree had no `node_modules` on entry; ran `pnpm install --frozen-lockfile` (zero changes — lockfile up to date) before invoking `prisma migrate diff`. This is environment setup, not a deviation from plan.
- The `--to-schema-datamodel` path is relative to apps/api when invoked via `pnpm --filter @sms-platform/api exec` (pnpm filter changes cwd). Used `src/prisma/schema.prisma`, not `apps/api/src/prisma/schema.prisma`. Plan text showed both forms; final form follows the cwd convention.

## Authentication Gates

None encountered.

## Per-Task Commit Hashes

| Task | Commit | Description |
|------|--------|-------------|
| 23-01-01 | e57b9a3 | feat(23-01): add 0_init Prisma migration with schema baseline + folded RLS |
| 23-01-02 | d61fbc7 | chore(23-01): replace db:push with db:reset and add db:check-drift |
| 23-01-03 | f476df3 | docs(23-01): swap db:push to db:reset in CLAUDE.md Prisma workflow |

## Verification Status

| Check | Result |
|-------|--------|
| 0_init/migration.sql exists | OK (1345 lines) |
| Contains `CREATE TABLE "Camera"` | OK |
| Contains `CREATE POLICY` | OK |
| Contains `app_user` (role + grants) | OK |
| Does NOT contain `hls_use_fmp4` (DEBT-03 cold-boot guard) | OK |
| Ends with GRANT USAGE statement | OK |
| 4 RLS section headers present (rls.policies.sql, rls-phase5.sql, rls_phase02, rls_apply_all) | OK |
| 8 hand-rolled dirs preserved | OK (9 total entries with 0_init) |
| 2 standalone RLS files preserved | OK |
| package.json: db:push absent | OK |
| package.json: db:push:skip-rls absent | OK |
| package.json: db:reset present | OK |
| package.json: db:check-drift present | OK |
| pnpm install (no lockfile drift) | OK |
| CLAUDE.md: db:reset present | OK |
| CLAUDE.md: prisma migrate dev mention | OK |
| CLAUDE.md: no `pnpm --filter @sms-platform/api db:push` recommendation | OK |
| CLAUDE.md: 4-step structure preserved | OK |
| CLAUDE.md: line count delta ≤ ±2 | OK (301 = 301) |

## Hand-off to Plan 23-06 (Wave 2 — destructive cleanup)

Plan 23-06 will:
1. Run BLOCKING migrate-deploy verification against throwaway DB (`createdb sms_phase23_drift_check && DATABASE_URL=… prisma migrate deploy && db:check-drift && dropdb`)
2. After human approval (`migrate-deploy-verified` resume signal), edit `apps/api/scripts/setup-test-db.sh` to use `prisma migrate deploy` (remove psql -f references to rls.policies.sql, rls_apply_all, etc.)
3. Delete the 8 hand-rolled migration directories + 2 standalone RLS files in one commit
4. Final cold-deploy sanity check on a second throwaway DB

This plan (23-01) is the constructive half. The destructive half is gated and runs only after deploy parity is proven.

## Self-Check: PASSED

- File `apps/api/src/prisma/migrations/20260427000000_init/migration.sql`: FOUND (1345 lines)
- File `apps/api/package.json`: FOUND (modified)
- File `CLAUDE.md`: FOUND (modified)
- Commit `e57b9a3`: FOUND (Task 1)
- Commit `d61fbc7`: FOUND (Task 2)
- Commit `f476df3`: FOUND (Task 3)
- All 8 hand-rolled migration dirs preserved on disk: FOUND
- Both standalone RLS files preserved on disk: FOUND
