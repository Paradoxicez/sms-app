---
phase: 19-camera-input-validation-and-multi-protocol-support-rtmp-rtmp
plan: 04
subsystem: database
tags: [prisma, postgres, unique-constraint, migration, dedup, p2002, rls, nestjs]

# Dependency graph
requires:
  - phase: 19-00
    provides: duplicateFixture / buildDuplicateCameras test fixtures + it.todo scaffolds (camera-crud, migrations/camera-dedup, bulk-import)
  - phase: 19-01
    provides: BulkImport DTO 4-protocol allowlist — bulk payloads reaching 19-04 are already URL-shape validated
  - phase: 19-03
    provides: Probe enqueue via BullMQ jobId probe:{cameraId} — preserved across new createCamera try/catch
provides:
  - Camera.@@unique([orgId, streamUrl]) constraint (D-10c)
  - camera_stream_url_unique pre-constraint keep-oldest dedup SQL (idempotent)
  - DuplicateStreamUrlError class (HTTP 409, code=DUPLICATE_STREAM_URL)
  - createCamera P2002 translation (streamUrl target only — forward-compatible)
  - bulkImport 3-layer dedup (within-file + against-DB + P2002 race safety)
  - bulkImport response shape { imported, skipped, errors }
  - db:push script runs dedup → push → RLS in correct order (with migrate-user override + --accept-data-loss)
  - setup-test-db.sh applies dedup migration so test DB mirrors dev
affects:
  - 19-05 (POST /api/cameras URL shape + duplicate error handling)
  - 19-06 (frontend error.code branching on 409)
  - 19-07 (bulk import UI consumes skipped count for post-import toast cascade)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "P2002 translation: wrap Prisma create in try/catch, check error.code === 'P2002' && meta.target.includes('streamUrl'), throw domain-specific ConflictException subclass — forward-compatible with future unique constraints"
    - "Pre-constraint dedup SQL: DELETE-USING keep-oldest pattern runs BEFORE prisma db push so @@unique creation doesn't fail on existing dupes; idempotent (second run deletes 0 rows)"
    - "Migration pipeline ordering: dedup SQL → prisma db push → RLS policies. Each stage authored by DATABASE_URL_MIGRATE (migrate superuser) so ALTER TABLE succeeds against tables owned by that role."
    - "Dedup defense-in-depth: layer-a (client within-file), layer-b (server pre-check + server within-file mirror), layer-c (DB @@unique). Pre-check race is caught by constraint → P2002 → DuplicateStreamUrlError."

key-files:
  created:
    - apps/api/src/cameras/errors/duplicate-stream-url.error.ts
    - apps/api/src/prisma/migrations/camera_stream_url_unique/migration.sql
  modified:
    - apps/api/src/prisma/schema.prisma
    - apps/api/src/cameras/cameras.service.ts
    - apps/api/package.json
    - apps/api/scripts/setup-test-db.sh
    - apps/api/tests/cameras/camera-crud.test.ts
    - apps/api/tests/cameras/bulk-import.test.ts
    - apps/api/tests/migrations/camera-dedup.test.ts

key-decisions:
  - "D-10c: @@unique([orgId, streamUrl]) composite (tenant-scoped) — orgA and orgB can both have rtsp://shared/url."
  - "D-11: Translate P2002 on streamUrl target only (meta.target.includes('streamUrl')); re-throw other P2002 targets so future unique constraints surface their own errors."
  - "D-10b: Single-round-trip pre-check (findMany where streamUrl IN [...]) before $transaction; count skipped rows and return in response."
  - "D-09: Exact string match for dedup (no normalization, lowercasing, or query-param stripping). Client + server + DB agree on the same match shape."
  - "A3 (RESEARCH): keep-oldest dedup strategy — c.createdAt > c2.createdAt deletes newer rows, preserves earliest row per (orgId, streamUrl)."
  - "Dev db:push must pass DATABASE_URL=$DATABASE_URL_MIGRATE AND --accept-data-loss — Prisma defaults to DATABASE_URL=app_user which lacks ALTER TABLE privilege on migrate-owned tables; db push requires --accept-data-loss on schema changes that drop shadow columns."

patterns-established:
  - "DuplicateStreamUrlError inherits ConflictException → NestJS filters map to HTTP 409 automatically → UI branches on response.code === 'DUPLICATE_STREAM_URL'"
  - "bulkImport race safety: P2002 around $transaction re-throws as DuplicateStreamUrlError so single-create and bulk-create error shapes are identical"
  - "enforceMaxCamerasLimitBulk runs AFTER dedup — a bulk request where most rows are duplicates shouldn't be rejected by the package limit based on raw payload size"

requirements-completed: []

# Metrics
duration: ~45min (across 2 executor spawns)
completed: 2026-04-22
---

# Phase 19 Plan 04: Camera Unique Constraint + Dedup Pipeline Summary

**Prisma `@@unique([orgId, streamUrl])` + pre-constraint keep-oldest dedup SQL + P2002 → DuplicateStreamUrlError translation + bulkImport 3-layer dedup with extended `{imported, skipped, errors}` response**

## Performance

- **Duration:** ~45 min (first executor spawn: Tasks 1-4 through blocking gate; second executor spawn after operator approval: Task 5 + SUMMARY)
- **Started:** 2026-04-22 (first spawn)
- **Completed:** 2026-04-22T15:58:00Z (second spawn, after operator approval of blocking gate)
- **Tasks:** 5 of 5
- **Files modified:** 8 (2 created, 6 modified — including 3 test files with 12 tests converted from `it.todo`)

## Accomplishments

- Camera model now enforces composite `(orgId, streamUrl)` uniqueness at the DB layer — `Camera_orgId_streamUrl_key` index verified via `pg_indexes` in both dev and test DBs.
- Pre-constraint dedup SQL uses the keep-oldest strategy per A3 (RESEARCH) — idempotent and tenant-isolated (orgA/orgB with same URL both survive).
- `createCamera` and `bulkImport` both translate Prisma P2002 on the `streamUrl` target to a shared `DuplicateStreamUrlError` (HTTP 409, `code: 'DUPLICATE_STREAM_URL'`) so the UI can branch on a single error shape.
- `bulkImport` now does defense-in-depth 3-layer dedup: within-file (server-side mirror of D-10a), against-DB (single-round-trip findMany pre-check), and P2002 race safety net around the `$transaction`.
- `bulkImport` response extended from `{imported, errors}` to `{imported, skipped, errors}` — 19-07 will consume `skipped` to drive the post-import toast cascade.
- Dev `db:push` script now chains dedup SQL → `prisma db push` → RLS policies in the correct order, with `DATABASE_URL_MIGRATE` + `--accept-data-loss` so migrate-owned tables can be altered.
- `scripts/setup-test-db.sh` applies the new dedup migration before `prisma db push`, so every test run leaves the test DB with the `@@unique` constraint — no manual intervention required.

## Task Commits

Each task committed atomically:

1. **Task 1: Create DuplicateStreamUrlError class** — `42d097b` (feat)
2. **Task 2: Add @@unique to schema + createCamera P2002 translation** — `f63b093` (feat)
3. **Task 2b: Update setup-test-db.sh** — `817032d` (feat)
4. **Task 3: Dedup SQL migration + 5 camera-dedup tests** — `ad46c42` (feat)
5. **Task 4 prep: Wire db:push to chain dedup SQL first** — `f09da37` (feat)
6. **Task 4 verification fix (mid-gate, orchestrator):** `b9087750` (fix) — db:push script needed `DATABASE_URL=$DATABASE_URL_MIGRATE` + `--accept-data-loss` before operator could run it successfully. See "Deviations" below.
7. **Task 5: bulkImport 3-layer dedup + skipped response field** — `b89c379` (feat)

_Task 4 was the blocking human-verify gate. Operator confirmed:_
- `pnpm --filter @sms-platform/api db:push` ran clean (after commit `b908775`)
- `SELECT indexname FROM pg_indexes WHERE tablename = 'Camera' AND indexname LIKE '%streamUrl%'` returned `Camera_orgId_streamUrl_key` in both dev + test DBs
- `pnpm run db:test:setup` → `[setup-test-db] Done.`

## Files Created/Modified

**Created:**
- `apps/api/src/cameras/errors/duplicate-stream-url.error.ts` — `DuplicateStreamUrlError extends ConflictException`, includes `code: 'DUPLICATE_STREAM_URL'` + user-facing message + offending `streamUrl`.
- `apps/api/src/prisma/migrations/camera_stream_url_unique/migration.sql` — `DELETE FROM "Camera" c USING "Camera" c2 WHERE c."orgId" = c2."orgId" AND c."streamUrl" = c2."streamUrl" AND c."createdAt" > c2."createdAt";`. Idempotent, tenant-isolated.

**Modified:**
- `apps/api/src/prisma/schema.prisma` — added `@@unique([orgId, streamUrl])` on Camera model. Existing `@@index` directives preserved.
- `apps/api/src/cameras/cameras.service.ts` — createCamera wraps Prisma create in try/catch, translates P2002 on streamUrl target. bulkImport now: (a) queries existing streamUrls in org, (b) within-file dedup via `Set<string>`, (c) `enforceMaxCamerasLimitBulk` runs against `toInsert.length`, (d) wraps `$transaction` in try/catch for P2002 race safety, (e) returns `{imported, skipped, errors}`.
- `apps/api/package.json` — `db:push` now runs `DATABASE_URL=$DATABASE_URL_MIGRATE prisma db push --accept-data-loss` between the dedup SQL and the RLS applications.
- `apps/api/scripts/setup-test-db.sh` — applies `camera_stream_url_unique/migration.sql` before `prisma db push` (guarded by `information_schema.tables` IF EXISTS so the no-table case is a clean no-op).
- `apps/api/tests/cameras/camera-crud.test.ts` — 3 it.todo stubs converted to real tests (P2002 translation, P2002-other-target passthrough, error body shape + HTTP 409).
- `apps/api/tests/cameras/bulk-import.test.ts` — 5 new tests in `bulkImport server-side dedup — Phase 19 (D-10b)` describe block covering against-db dedup, within-file dedup, cross-org tenant isolation, response shape, and P2002 race safety via mocked `$transaction`.
- `apps/api/tests/migrations/camera-dedup.test.ts` — 5 it.todo stubs converted to real integration tests (keep-oldest dedup, idempotency, tenant isolation, unique-row preservation, post-migration P2002 fires).

## Test Count Delta

- camera-crud.test.ts: +3 tests (P2002 handling)
- bulk-import.test.ts: +5 tests (dedup behaviors + race safety)
- migrations/camera-dedup.test.ts: +5 tests (SQL behavior)
- **Total: 13 tests converted from `it.todo` to green** (13 covers 3+5+5; the original plan estimate was "12+" but one extra race-safety test was added to harden the bulk path)

Verified with: `pnpm --filter @sms-platform/api test -- --run tests/cameras/bulk-import tests/cameras/camera-crud tests/migrations/camera-dedup` → `Tests 40 passed | 3 todo (43)` (the 3 remaining todos are from unrelated plans).

## Decisions Made

- **Short-circuit when `toInsert.length === 0`** — if every row in the payload is a duplicate, return `{imported: 0, skipped: N, errors: []}` without opening a tenancy $transaction. Not in the plan but prevents an unnecessary session creation.
- **Move `enforceMaxCamerasLimitBulk` AFTER dedup** — the plan didn't specify this, but it's correct: a bulk request where most rows are duplicates shouldn't be rejected under the package limit because of the raw payload size. The limit applies to rows we're actually going to insert.
- **P2002 race safety message is generic** — `'bulk-import race: a concurrent request inserted one of these stream URLs'` rather than a specific URL, because the error comes from the DB and we'd have to re-query to identify which URL raced. UI falls back to a generic retry prompt — acceptable per D-11 (no cross-tenant enumeration via this error).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] db:push script needed `DATABASE_URL=$DATABASE_URL_MIGRATE` override + `--accept-data-loss`**
- **Found during:** Task 4 operator verification (blocking human-verify gate)
- **Issue:** Original script (per plan) was `prisma db push && psql $DATABASE_URL_MIGRATE -f ...`. When the operator ran it, `prisma db push` failed with `ERROR: must be owner of table "Camera"` — because Prisma defaults to the connection string in `DATABASE_URL` (which resolves to the `app_user` role), and `app_user` does not have `ALTER TABLE` privilege on tables owned by the migrate superuser. Separately, `db push` refused to run without `--accept-data-loss` because the schema diff dropped shadow columns from a prior migration state.
- **Fix:** Orchestrator committed `b908775` patching the `db:push` script to `psql $DATABASE_URL_MIGRATE -f .../camera_stream_url_unique/migration.sql && DATABASE_URL=$DATABASE_URL_MIGRATE prisma db push --accept-data-loss && psql $DATABASE_URL_MIGRATE -f .../rls_apply_all/migration.sql`. This ensures all three stages run as the migrate superuser and that destructive diffs are explicitly accepted.
- **Files modified:** apps/api/package.json
- **Verification:** Operator reran `pnpm --filter @sms-platform/api db:push` successfully; `Camera_orgId_streamUrl_key` index present in pg_indexes.
- **Committed in:** `b908775` (fix(19-04): db:push needs --accept-data-loss and migrate user override)

**2. [Enhancement, not a deviation rule] Added P2002 race-safety test via mocked `$transaction`**
- **Found during:** Task 5
- **Context:** The plan's Task 5 required translating P2002 at the bulk-import layer but didn't explicitly list a race-safety test in the acceptance criteria (it listed 4 tests — we added a 5th). Added because the code path is non-trivial and the threat register (T-19-02) calls for explicit mitigation coverage.
- **Implementation:** Mock `tenancy.$transaction` to throw a `Prisma.PrismaClientKnownRequestError({code: 'P2002', meta: { target: ['orgId', 'streamUrl'] }})` and assert `DuplicateStreamUrlError` bubbles up.
- **Files modified:** apps/api/tests/cameras/bulk-import.test.ts
- **Verification:** Test passes — `response: { code: 'DUPLICATE_STREAM_URL' }` as expected.

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking, caught at gate) + 1 test enhancement (T-19-02 coverage hardening).
**Impact on plan:** Both benign. The script fix is a blocking-gate discovery that couldn't surface until an operator tried to run `db:push` against a real dev DB — the plan's original script was incomplete for the environment's actual privilege model. The extra test strengthens an already-planned mitigation path. No scope creep; no schema or API surface changes beyond the plan.

## Issues Encountered

- **`db:push` privilege model at verification gate** — surfaced in Task 4. Resolved by the orchestrator via commit `b908775` before resuming Task 5. Documented above.

## User Setup Required

None — the `db:push` and `db:test:setup` scripts encapsulate all the migration work. Operators running against a pre-seeded DB with duplicates will see them silently collapsed via the keep-oldest dedup SQL (idempotent; running it a second time deletes zero rows).

## Next Phase Readiness

- **19-05** (POST /api/cameras URL shape): createCamera already returns `DuplicateStreamUrlError` with HTTP 409 — no additional controller changes needed for that plan's validation layer.
- **19-06** (frontend error branching): the UI should switch on `response.code === 'DUPLICATE_STREAM_URL'` for 409 responses. Error shape is stable across single-camera and bulk-import paths.
- **19-07** (bulk import UI post-import toast cascade): consumes `skipped` field from the bulkImport response. The field is always present (0 when no duplicates), so UI can unconditionally read it.

### Threat Register Updates

- **T-19-02 (TOCTOU on pre-check + insert)** — mitigated. Layer-b pre-check (findMany) + layer-c @@unique + P2002 translation in both createCamera and bulkImport. Race window still exists between pre-check and $transaction but the DB constraint catches it and translates to DuplicateStreamUrlError. **Covered by test:** `bulkImport server-side dedup — P2002 race safety`.
- **T-19-05 (Tenant isolation via duplicate leak)** — mitigated. Composite `@@unique([orgId, streamUrl])` ensures orgA and orgB can both own the same URL. **Covered by tests:** `camera-dedup: tenant isolation: orgA and orgB with same streamUrl both survive` + `bulkImport server-side dedup: tenant isolation: same streamUrl in different orgs is NOT a duplicate`.
- **T-19-02-a (Dedup SQL removes wrong row)** — mitigated via keep-oldest A3 strategy + operator blocking-gate verification. Idempotent on re-run.
- **T-19-Enum-01 (Cross-tenant URL enumeration via error)** — accepted. DuplicateStreamUrlError response scopes to "your organization"; RLS at query layer prevents cross-org discovery via this error.
- **T-19-SQLi-01 (SQL injection via migration SQL)** — accepted. Static SQL file, no user-input interpolation.

## Self-Check: PASSED

- `apps/api/src/cameras/errors/duplicate-stream-url.error.ts` — FOUND
- `apps/api/src/prisma/migrations/camera_stream_url_unique/migration.sql` — FOUND
- Commit `42d097b` — FOUND
- Commit `f63b093` — FOUND
- Commit `817032d` — FOUND
- Commit `ad46c42` — FOUND
- Commit `f09da37` — FOUND
- Commit `b908775` — FOUND (orchestrator script fix)
- Commit `b89c379` — FOUND (Task 5)
- `bulkImport` return signature `{imported, skipped, errors}` — VERIFIED via test `response shape includes imported + skipped + errors`
- `rg "DuplicateStreamUrlError" apps/api/src/cameras/cameras.service.ts | wc -l` → 6 matches (1 import + 2 throws at lines 175 and 469 + 3 explanatory comments) — exceeds plan's "at least 3" criterion.
- `rg "existingUrls|seenInFile|skippedCount" apps/api/src/cameras/cameras.service.ts` — all 3 present — VERIFIED
- `pnpm --filter @sms-platform/api test -- --run tests/cameras tests/migrations/camera-dedup` → **40 passed | 3 todo (unrelated)**

---
*Phase: 19-camera-input-validation-and-multi-protocol-support-rtmp-rtmp*
*Plan: 04*
*Completed: 2026-04-22*
