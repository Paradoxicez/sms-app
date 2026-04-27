---
phase: 23
plan: 06
subsystem: prisma-migrations
tags: [debt-05, prisma, migration-cleanup, rls, setup-test-db, blocking-checkpoint]
requirements: [DEBT-05]
dependency-graph:
  requires:
    - phase: 23-01
      provides: "0_init/migration.sql squashed baseline + db:reset / db:check-drift scripts (the source of truth this plan deletes the predecessors of)"
  provides:
    - "setup-test-db.sh now uses `prisma migrate deploy` (no more psql -f against deleted RLS files; Pitfall 4 closed)"
    - "apps/api/src/prisma/migrations/ contains exactly one entry: 20260427000000_init/ — Phase 26's sms-migrate init service can rely on this invariant"
    - "Operator-verified evidence (BLOCKING gate): prisma migrate deploy + db:check-drift exit 0 against an empty Postgres → squashed 0_init applies cleanly"
  affects:
    - "Plan 23-05 (CI workflow) — db:check-drift gate now operates over a single-entry migration history"
    - "Phase 26 (sms-migrate init service) — single-entry history simplifies bootstrap"
    - "Phase 30 (clean-VM smoke) — fewer moving parts when bringing up a fresh DB"
tech-stack:
  added: []
  patterns:
    - "BLOCKING checkpoint pattern (gate=blocking) — destructive deletion gated behind operator-driven verification of fresh-DB cold deploy"
    - "Audit trail preserved in 0_init/migration.sql header comments (T-23-06-4 repudiation accept-via-git-log)"
key-files:
  created:
    - ".planning/phases/23-tech-debt-cleanup-phase-0-prerequisites/23-06-SUMMARY.md"
  modified:
    - "apps/api/scripts/setup-test-db.sh (Task 1, commit c631179)"
  deleted:
    - "apps/api/src/prisma/migrations/camera_push_fields/ (Task 3)"
    - "apps/api/src/prisma/migrations/camera_stream_url_unique/ (Task 3)"
    - "apps/api/src/prisma/migrations/drop_org_settings_dead_fields/ (Task 3)"
    - "apps/api/src/prisma/migrations/recording_segment_has_keyframe/ (Task 3)"
    - "apps/api/src/prisma/migrations/rls_apply_all/ (Task 3)"
    - "apps/api/src/prisma/migrations/rls_phase02/ (Task 3)"
    - "apps/api/src/prisma/migrations/rls_policies/ (Task 3)"
    - "apps/api/src/prisma/migrations/rls_superuser_bypass_positive_signal/ (Task 3)"
    - "apps/api/src/prisma/rls.policies.sql (Task 3)"
    - "apps/api/src/prisma/rls-phase5.sql (Task 3)"
    - "apps/api/tests/migrations/camera-dedup.test.ts (Task 3 — auto-fix Rule 3, see Deviations)"
decisions:
  - "BLOCKING gate verified by orchestrator (5-step recipe exit 0 across the board) — destructive deletion was authorized only after migrate-deploy proved the squash valid against a fresh Postgres"
  - "Deleted apps/api/tests/migrations/camera-dedup.test.ts alongside the migration dir it depended on — its readFileSync against camera_stream_url_unique/migration.sql at module load would crash the whole vitest run after deletion; the dedup migration was a one-time legacy cleanup with no replay path on fresh DBs"
  - "Audit trail of folded source filenames preserved as documentation comments inside 0_init/migration.sql (lines 6-15, 818, 929, 986, 1055, 1209) — git history retains the original SQL files (T-23-06-4 accept disposition)"
  - "Hotfix commit ae20337 landed on main while Plan 23-06 was paused at the blocking gate — the worktree branch is unaffected (no file overlap; merge will combine cleanly)"
metrics:
  duration: "~25 minutes (Task 1 + paused at blocking gate + orchestrator verification + Task 3)"
  completed: "2026-04-27"
  tasks_completed: 3
  files_created: 0
  files_modified: 1
  files_deleted: 11
---

# Phase 23 Plan 06: DEBT-05 Cleanup — setup-test-db Migrate-Deploy Swap + Destructive Migration Cleanup Summary

**Migration history is now single-entry: only `20260427000000_init/` survives. setup-test-db.sh uses `prisma migrate deploy` exclusively. Destructive deletion was gated behind an operator-verified cold-deploy check (5-step recipe → all exit 0) before any rm executed.**

## Performance

- **Duration:** ~25 min (start 2026-04-27 ~17:40 → finish ~18:05; includes the blocking-gate pause window)
- **Started:** 2026-04-27 (Task 1 commit `c631179` recorded at 17:42:20 +0700)
- **Completed:** 2026-04-27 (Task 3 commit `8b4a97e` recorded shortly after orchestrator handed back the verified resume signal)
- **Tasks:** 3 (Task 1 auto, Task 2 BLOCKING checkpoint, Task 3 auto)
- **Files modified:** 1 (setup-test-db.sh)
- **Files deleted:** 11 (8 migration dirs + 2 standalone RLS files + 1 dead test file — see Deviations Rule 3)

## Accomplishments

- `setup-test-db.sh` now bootstraps the test DB via `prisma migrate deploy` against the squashed 0_init — no more references to the doomed RLS files and no `prisma db push`
- BLOCKING gate (Plan 23-06 Task 2) was verified by the orchestrator on a throwaway DB: `prisma migrate deploy` exit 0, `db:check-drift` exit 0 ("No difference detected"), Camera table + 36 RLS policies present across 29 tables, then `dropdb` cleanup
- 8 hand-rolled migration directories + 2 standalone RLS files removed; `apps/api/src/prisma/migrations/` now holds exactly `20260427000000_init/` (the invariant Phase 26 depends on)
- Audit trail of every folded source preserved in `0_init/migration.sql` header comments + git history (recoverable via `git log` per T-23-06-4)

## Task Commits

1. **Task 1: Update setup-test-db.sh to use prisma migrate deploy** — `c631179` (chore)
   - Removed lines 50-97 (the legacy dedup DO-block + `prisma db push` + 3 `psql -f` calls referencing `rls.policies.sql`, `rls_apply_all/migration.sql`, `rls_superuser_bypass_positive_signal/migration.sql`)
   - Replaced with a single `pnpm --dir "$API_DIR" exec prisma migrate deploy` invocation + the defensive idempotent GRANT backfill
   - Lines 1-48 (env load + hard guard + public-schema `DROP CASCADE`) untouched
   - bash -n syntax check + acceptance grep all green
2. **Task 2: [BLOCKING] Operator verifies 0_init applies cleanly + drift returns 0** — verified by orchestrator (no commit; gate-only task)
   - Resume signal `migrate-deploy-verified` recorded 2026-04-27 by the orchestrator
   - 5-step recipe outcomes (orchestrator-reported):
     - Step 1 `createdb sms_phase23_drift_check` → DB created
     - Step 2 `prisma migrate deploy` → "All migrations have been successfully applied", exit 0
     - Step 3 `db:check-drift` → "No difference detected", exit 0
     - Step 4 (effective) — schema introspection confirmed Camera table exists with `tenant_isolation_camera` + `superuser_bypass_camera` policies; total 36 RLS policies across 29 tables
     - Step 5 `dropdb sms_phase23_drift_check` → throwaway DB removed
   - Notes: during the gate verification the orchestrator discovered + patched 2 latent defects from Plan 23-01 in main (see Hotfix Note below). Those landed on main in commit `ae20337` while this plan was paused; they do not touch any file edited by this plan, so the merge of `worktree-agent-a895720403ca5ea3e` into main combines cleanly.
3. **Task 3: Delete hand-rolled migration directories + standalone RLS files** — `8b4a97e` (chore)
   - 8 migration dirs deleted (`camera_push_fields`, `camera_stream_url_unique`, `drop_org_settings_dead_fields`, `recording_segment_has_keyframe`, `rls_apply_all`, `rls_phase02`, `rls_policies`, `rls_superuser_bypass_positive_signal`)
   - 2 standalone RLS files deleted (`apps/api/src/prisma/rls.policies.sql`, `apps/api/src/prisma/rls-phase5.sql`)
   - 1 dead test file deleted (`apps/api/tests/migrations/camera-dedup.test.ts`) — auto-fix Rule 3 below
   - Plan's automated verify block executed end-to-end and printed `AUTOMATED VERIFY PASS`

**Plan metadata commit:** `<filled by final commit step>` (docs: complete plan)

## Files in `apps/api/src/prisma/migrations/` after Task 3 (1 entry — invariant Phase 26 depends on)

```
apps/api/src/prisma/migrations/
└── 20260427000000_init/
    └── migration.sql   (squashed schema + folded RLS + grants — produced by Plan 23-01)
```

(Once main is merged, `migration_lock.toml` from hotfix `ae20337` joins this listing — that file lives on main, not the worktree branch.)

## Hotfix Note: Plan 23-01 Defects Patched on Main During Gate Verification

While the orchestrator ran the BLOCKING gate's 5-step recipe locally, three latent defects from Plan 23-01 surfaced. They were patched directly on main (commit `ae20337`) so the gate could complete; this plan's worktree branch was untouched. Net effect: the merge will combine main's hotfix + this branch's setup-test-db edit + this branch's destructive deletion cleanly (no overlapping files):

1. **Missing `migration_lock.toml`** — Prisma needs this file in `apps/api/src/prisma/migrations/` to identify the connector type (postgresql). Plan 23-01 squashed the migration content but did not emit the lock file. Hotfix added `apps/api/src/prisma/migrations/migration_lock.toml` (3 lines, `provider = "postgresql"`).
2. **Missing `shadowDatabaseUrl` in `schema.prisma`** — `db:check-drift` needs an accessible shadow DB; without `shadowDatabaseUrl = env("SHADOW_DATABASE_URL")` in the datasource block, Prisma errors out trying to manage one. Hotfix added the line + documented `SHADOW_DATABASE_URL` in `apps/api/.env.test.example`.
3. **`db:check-drift` script env loading** — the existing script in `apps/api/package.json` did not source `.env` or pass `--shadow-database-url` explicitly. Hotfix updated the script to load env + pass the flag, plus a parallel `.env.test.example` doc note.

These defects belong to Plan 23-01's surface area (DEBT-05), not Plan 23-06. Documenting here for cross-plan auditing — Plan 23-01's SUMMARY should be amended in a follow-up to reflect the corrected state. **No action needed for this plan.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deleted dead test file `apps/api/tests/migrations/camera-dedup.test.ts`**
- **Found during:** Task 3 (the prerequisite grep listed in the plan)
- **Issue:** The test file calls `readFileSync(__dirname, '../../src/prisma/migrations/camera_stream_url_unique/migration.sql', 'utf8')` at module-load time (line 14-17). Once Task 3 deletes that migration directory, every vitest invocation crashes at import time with ENOENT — breaking the test suite Task 3's own smoke-test step relies on (and breaking CI). The plan called for the prerequisite grep to surface live references and fix them before `rm`; this is exactly such a reference.
- **Fix:** Deleted the test file in the same commit as the migration directory it depends on. Rationale: the dedup migration was a one-time legacy cleanup (it pre-dedups `Camera.streamUrl` rows before the unique index is added — see header note `pre-dedup before unique index — no-op on fresh DB` in `0_init/migration.sql:13`). With the dedup SQL no longer applied to fresh DBs and the unique constraint already in `0_init`, the test has no source-of-truth to validate. Inlining the SQL into the test file would just be a copy of dead code.
- **Files modified:** Deleted `apps/api/tests/migrations/camera-dedup.test.ts`
- **Verification:** Post-delete grep `grep -rn 'rls\.policies\.sql\|rls-phase5\.sql\|migrations/rls_apply_all\|...\|migrations/recording_segment_has_keyframe' apps/api/` returns matches only inside `0_init/migration.sql` header comments (documentation strings, not actionable). The plan's own automated verify block (`test ! -e ... && [ "$(ls migrations | wc -l)" = "1" ]`) printed `AUTOMATED VERIFY PASS`.
- **Committed in:** `8b4a97e` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** This deviation kept the test suite alive across the destructive deletion. No scope creep — the deleted test was scoped to the deleted migration; both go away together.

## Issues Encountered

- **Empty `apps/api/tests/migrations/` directory after deletion** — Git does not track empty directories, so the directory disappears from the working tree once `git commit` removes its only file. No manual cleanup needed; verified by `git ls-files apps/api/tests/migrations/` returning empty after the commit.
- **Plan 23-01 latent defects (handled by orchestrator, not this plan)** — captured in the Hotfix Note above. Surfaced because the BLOCKING gate is the first place Prisma's CLI exercises the squashed migration end-to-end against a fresh DB. The gate worked as designed: it caught 23-01 issues before any destructive deletion ran.

## Self-Check: PASSED

- FOUND: `apps/api/scripts/setup-test-db.sh` (Task 1 target — modified, present)
- FOUND: `apps/api/src/prisma/migrations/20260427000000_init/` (the surviving entry)
- GONE: `apps/api/src/prisma/rls.policies.sql` (Task 3 deletion confirmed)
- GONE: `apps/api/src/prisma/rls-phase5.sql` (Task 3 deletion confirmed)
- GONE: `apps/api/tests/migrations/camera-dedup.test.ts` (Rule 3 auto-fix deletion confirmed)
- FOUND: `.planning/phases/23-tech-debt-cleanup-phase-0-prerequisites/23-06-SUMMARY.md`
- FOUND commit: `c631179` (Task 1 — setup-test-db migrate-deploy swap)
- FOUND commit: `8b4a97e` (Task 3 — destructive cleanup of 8 dirs + 2 RLS files + 1 dead test)
- `apps/api/src/prisma/migrations/` entry count: **1** (matches plan invariant)

## Next Phase Readiness

- Plan 23-05 (CI workflow) can now reference `db:check-drift` knowing the migration history is single-entry and the test bootstrap (`setup-test-db.sh`) is migrate-deploy clean
- Phase 26 (sms-migrate init service) inherits a one-entry migration history — easier to bootstrap a fresh prod DB
- Plan 23-01's SUMMARY should be amended in a follow-up to reflect the hotfix patches in `ae20337` (out of this plan's scope; flagged here for the orchestrator)

---
*Phase: 23-tech-debt-cleanup-phase-0-prerequisites*
*Plan: 06*
*Completed: 2026-04-27*
