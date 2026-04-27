---
phase: 22-camera-metadata-utilization-surface-tags-description-across-
plan: 01
subsystem: database
tags: [prisma, postgres, gin-index, vitest, zod, tags, camera, tag-normalization]

# Dependency graph
requires:
  - phase: pre-22
    provides: Camera model with `tags String[]` column and Prisma tenancy extension chain
provides:
  - Camera.tagsNormalized String[] shadow column with GIN index camera_tagsnormalized_idx
  - Backfill of existing rows so all cameras have tagsNormalized populated
  - Pure tag-normalization helpers (normalizeForDisplay, normalizeForDb) with TAG_MAX_LENGTH=50, TAG_MAX_PER_CAMERA=20
  - Prisma Client Extension that auto-mirrors Camera.tags → tagsNormalized on create / update / upsert
  - DTO Zod bounds (50 chars per tag, 20 tags per camera) applied uniformly to create / update / bulk-import (D-10)
  - 14 Wave 0 test files (1 fully implemented + 12 stubs + bookkeeping for the extend-in-place pair) ready for Wave 1+
affects: [22-02, 22-03, 22-04, 22-05, 22-06, 22-07, 22-08, 22-09, 22-10, 22-11, 22-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prisma Client Extension via $extends({ query: { ... } }) — chained AFTER tenancy extension so RLS applies first, tag normalization mutates data before SQL emit"
    - "Shadow normalized column + GIN array index for case-insensitive @> and && filters"
    - "Pure-function normalization helpers (no DB / no DI) so DTOs and extension share the same source of truth"
    - "Vitest stub pattern with describe/it.todo() referencing the VALIDATION.md row that will fill them in"

key-files:
  created:
    - apps/api/src/cameras/tag-normalize.ts
    - apps/api/src/cameras/camera-tag.extension.ts
    - apps/api/tests/cameras/tag-normalize.test.ts
    - apps/api/tests/cameras/tag-normalization.test.ts
    - apps/api/tests/cameras/tags-filter.test.ts
    - apps/api/tests/cameras/tags-filter-perf.test.ts
    - apps/api/tests/cameras/bulk-tags.test.ts
    - apps/api/tests/cameras/audit-diff.test.ts
    - apps/api/tests/cameras/distinct-tags.test.ts
    - apps/api/tests/audit/sanitizer-diff.test.ts
    - apps/api/tests/status/notify-dispatch.test.ts
    - apps/web/src/app/admin/cameras/components/__tests__/tag-input-combobox.test.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/tags-cell.test.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/cameras-columns-tooltip.test.tsx
    - apps/web/src/components/pages/__tests__/tenant-map-page-tag-filter.test.tsx
  modified:
    - apps/api/src/prisma/schema.prisma
    - apps/api/src/cameras/cameras.module.ts
    - apps/api/src/cameras/dto/create-camera.dto.ts
    - apps/api/src/cameras/dto/update-camera.dto.ts
    - apps/api/src/cameras/dto/bulk-import.dto.ts

key-decisions:
  - "GIN index name pinned via @@index map: 'camera_tagsnormalized_idx' so the canonical name is stable across Prisma versions and matches the assertion query in must_haves and downstream Wave 1 perf test"
  - "Prisma Client Extension hooks ONLY create/update/upsert — bulk paths use per-row update so the extension auto-applies; createMany/updateMany are intentionally not hooked (per Pitfall 5 + D-12)"
  - "DTO bounds (TAG_MAX_LENGTH=50, TAG_MAX_PER_CAMERA=20) applied identically to create + update + bulk-import (D-10) — bulk-import-dialog.tsx keeps its comma/semicolon parsing client-side, server-side enforcement is uniform"
  - "tagsNormalized is a write-time mirror (lowercased + deduped); tags remains the canonical display value with first-seen casing preserved (D-04)"

patterns-established:
  - "Prisma Client Extension chained AFTER tenancy extension — tenancy first applies RLS, tag normalization then mutates args.data before query emit"
  - "Wave 0 test stub convention: describe('Phase 22: <topic>') + it.todo('TODO Wave <N> — implement per 22-VALIDATION.md row')"
  - "Shadow normalized column pattern: keep canonical user-facing array (tags), maintain a lowercased mirror (tagsNormalized) with GIN index for performant case-insensitive set queries"

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06, D-10]

# Metrics
duration: 20min
completed: 2026-04-26
---

# Phase 22 Plan 01: Tag-normalization foundation Summary

**Camera.tagsNormalized shadow column with GIN index camera_tagsnormalized_idx, Prisma Client Extension auto-mirroring tags lowercased on every write path, DTO Zod bounds (50 chars × 20 tags) uniform across create/update/bulk-import, and 14 Wave 0 test files ready for Wave 1+ population.**

## Performance

- **Duration:** ~20 min (Task 1 → Task 3 final commit)
- **Started:** 2026-04-26T13:09:01Z (Task 1 first commit)
- **Completed:** 2026-04-26T13:28:10Z (Task 3 commit)
- **Tasks:** 3 (Task 1 fully autonomous, Task 2 human-action checkpoint, Task 3 fully autonomous)
- **Files modified:** 17 (5 modified + 12 created — count excludes the SUMMARY itself)

## Accomplishments
- Camera schema augmented with `tagsNormalized String[]` + GIN array index `camera_tagsnormalized_idx` (explicit `map:` directive locks SQL name across Prisma versions)
- Postgres backfilled: `UPDATE 7` rows — every existing camera now has populated tagsNormalized
- Prisma Client Extension `cameraTagNormalization` wired AFTER tenancy in cameras.module.ts so `tags → tagsNormalized` mirroring is automatic on every create/update/upsert (including per-row bulk import)
- Pure helpers `normalizeForDisplay` (trim + case-insensitive dedup, first-seen casing) and `normalizeForDb` (lowercase + dedup, Unicode-safe) with 7/7 unit tests green
- DTO bounds enforced server-side at create/update/bulk-import (D-10): empty rejected, > 50 chars rejected, > 20 tags rejected — same constants imported from `tag-normalize.ts`
- 14 Wave 0 test files exist (per 22-VALIDATION.md): 1 fully implemented (`tag-normalize.test.ts`), 12 created as stubs, plus 4 EXTEND-in-place files (deferred to their owning Wave 5 plans per 22-VALIDATION.md)
- API process restarted on the regenerated Prisma client (verified PID 1962, archives metrics block reports idle/0/0/no-failure — confirms no stale-client schema-mismatch failures)

## Task Commits

Each task committed atomically:

1. **Task 1: Schema + Prisma extension + tag-normalize helpers + DTO bounds** — `72fec73` (feat) — schema mutation, extension wiring, helpers, DTOs, 7/7 unit tests
2. **Task 2: [BLOCKING] Schema push + Prisma client regen + API rebuild + restart + backfill verification** — no code commit (operational checkpoint); db:push exit 0, backfill `UPDATE 7`, build exit 0, GIN index verified, user confirmed restart with "schema applied"
3. **Task 3: Create remaining 12 Wave 0 test stubs** — `7ab545f` (test) — 12 stub files, 214 insertions

**Plan metadata:** orchestrator owns final commit (SUMMARY only — STATE.md / ROADMAP.md updates deferred to orchestrator per parent prompt)

## Files Created/Modified

### Schema + extension + DTOs (Task 1)
- `apps/api/src/prisma/schema.prisma` — added `tagsNormalized String[] @default([])` + `@@index([tagsNormalized(ops: ArrayOps)], type: Gin, map: "camera_tagsnormalized_idx")`
- `apps/api/src/cameras/tag-normalize.ts` — `TAG_MAX_LENGTH=50`, `TAG_MAX_PER_CAMERA=20`, `TagValidationError`, `normalizeForDisplay`, `normalizeForDb`
- `apps/api/src/cameras/camera-tag.extension.ts` — `createTagNormalizationExtension(prisma)` hooks `camera.create / update / upsert`
- `apps/api/src/cameras/cameras.module.ts` — chains tag extension after tenancy extension in TENANCY_CLIENT provider
- `apps/api/src/cameras/dto/create-camera.dto.ts` — `tags` Zod schema bounded by `TAG_MAX_LENGTH` × `TAG_MAX_PER_CAMERA`
- `apps/api/src/cameras/dto/update-camera.dto.ts` — same bounds (D-10 alignment)
- `apps/api/src/cameras/dto/bulk-import.dto.ts` — same bounds (D-10 server-side enforcement uniform with single-camera path)
- `apps/api/tests/cameras/tag-normalize.test.ts` — 7 unit cases (trim, dedup, length, count, Unicode lower)

### Wave 0 stubs (Task 3)
- `apps/api/tests/cameras/tag-normalization.test.ts` — extension write-path coverage (Wave 1)
- `apps/api/tests/cameras/tags-filter.test.ts` — `?tags[]=` case-insensitive OR (Wave 1)
- `apps/api/tests/cameras/tags-filter-perf.test.ts` — EXPLAIN ANALYZE GIN bitmap scan (Wave 1, advisory)
- `apps/api/tests/cameras/bulk-tags.test.ts` — POST /cameras/bulk/tags Add/Remove + per-camera audit (Wave 1)
- `apps/api/tests/cameras/audit-diff.test.ts` — Camera UPDATE diff details.diff (Wave 1)
- `apps/api/tests/cameras/distinct-tags.test.ts` — GET /cameras/tags/distinct + RLS isolation + cache (Wave 1)
- `apps/api/tests/audit/sanitizer-diff.test.ts` — sanitizeDetails preserves diff key (Wave 1)
- `apps/api/tests/status/notify-dispatch.test.ts` — webhook payload includes tags (Wave 1) — created fresh; pre-existence check confirmed file absent in apps/api/tests/status/
- `apps/web/.../tag-input-combobox.test.tsx` — chip behavior (Wave 5 → Plan 22-07)
- `apps/web/.../tags-cell.test.tsx` — ≤3 + overflow tooltip (Wave 5 → Plan 22-08)
- `apps/web/.../cameras-columns-tooltip.test.tsx` — name description tooltip (Wave 5 → Plan 22-08)
- `apps/web/src/components/pages/__tests__/tenant-map-page-tag-filter.test.tsx` — map toolbar tag MultiSelect (Wave 5 → Plan 22-10)

## Decisions Made
- **Index naming pinned via `map:`** — `camera_tagsnormalized_idx` is asserted in must_haves and the Wave 1 perf test; explicit map directive eliminates Prisma auto-derivation drift across versions.
- **Hook only single-row write APIs** — `createMany` / `updateMany` deliberately skipped because per-row `update`/`create` already triggers the hook for every Phase 22 caller (bulk import, bulk tags). Pitfall 5 explicitly warns against hooking the bulk APIs.
- **Bulk-import client/server split (D-10)** — `bulk-import-dialog.tsx` keeps its comma/semicolon parser; the server uses the same TAG_MAX_LENGTH/TAG_MAX_PER_CAMERA constants so over-limit input fails validation regardless of source.
- **`tags` stays canonical display value** — `tagsNormalized` is a write-time mirror only; user-facing reads always render `tags` so first-seen casing is preserved (D-04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Plan-prescribed `-x` flag is incompatible with vitest 2.x**
- **Found during:** Task 3 verification (`pnpm --filter @sms-platform/api test -- tests/cameras/tag-normalization.test.ts -x`)
- **Issue:** Vitest 2.1.9 (api) and 3.2.4 (web) both reject `-x` as `Unknown option` and exit 1. The flag is documented throughout 22-VALIDATION.md and the Phase 22 plan files as a "no-watch" intent, but neither vitest CLI accepts it. The api `test` script is already `vitest run --reporter=verbose` (non-watch by default); the web `test` script defaults to `vitest` but exits cleanly when stdin is non-TTY.
- **Fix:** Ran the verify commands without `-x`. Both stub files reported exit 0 with all todos as `4 todo / 6 todo` and 0 failures — satisfying the acceptance criterion ("stub passes — todo doesn't fail").
- **Files modified:** None (the `-x` typo lives only in plan docs; no code change).
- **Verification:** `pnpm --filter @sms-platform/api test -- tests/cameras/tag-normalization.test.ts` → `Test Files 1 skipped (1) · Tests 4 todo (4)` exit 0; `pnpm --filter @sms-platform/web test -- tag-input-combobox` → `Tests 6 todo (6)` exit 0.
- **Committed in:** No commit needed — verification-only deviation. Future Wave 1+ plans should treat `-x` as a typo and run vanilla `vitest run` invocations.

---

**Total deviations:** 1 auto-fixed (1 blocking — verification command typo)
**Impact on plan:** Zero scope creep. The `-x` flag is a documentation typo that affects every Phase 22 plan's `<verify>` block; flagging it here so subsequent waves don't re-discover the same blocker.

## Issues Encountered

- **Worktree continuation across two prior executors** — Task 1 was committed in a previous worktree (commit `72fec73`); the worktree branch check confirmed the commit is reachable from this worktree's HEAD before continuing, so no re-execution of Task 1 was required. Task 3 stubs were created cleanly in this worktree on top of `72fec73`.
- **Vitest `-x` flag typo** — see Deviations §1 above.

## Threat Flags

None — Plan 22-01 introduces no new network/auth surface. The single threat in the plan's threat_model (T-22-00 Camera.tagsNormalized tampering) is mitigated as designed: the Prisma Client Extension is the sole write path; direct SQL bypasses are out of scope (admin-only console access).

## Known Stubs

By design, this plan creates 12 stub files for Wave 1+ to populate. Each stub references its target VALIDATION.md row and the owning plan number. These are NOT production stubs (no UI rendering empty placeholder text); they are test scaffolding required by the Nyquist sampling contract before downstream waves can begin.

| File | Resolved by |
|------|-------------|
| `apps/api/tests/cameras/tag-normalization.test.ts` | Wave 1 / 22-01 follow-up |
| `apps/api/tests/cameras/tags-filter.test.ts` | Plan 22-02 |
| `apps/api/tests/cameras/tags-filter-perf.test.ts` | Plan 22-02 |
| `apps/api/tests/cameras/bulk-tags.test.ts` | Plan 22-03 |
| `apps/api/tests/cameras/audit-diff.test.ts` | Plan 22-05 |
| `apps/api/tests/cameras/distinct-tags.test.ts` | Plan 22-04 |
| `apps/api/tests/audit/sanitizer-diff.test.ts` | Plan 22-05 |
| `apps/api/tests/status/notify-dispatch.test.ts` | Plan 22-06 |
| `apps/web/.../tag-input-combobox.test.tsx` | Plan 22-07 |
| `apps/web/.../tags-cell.test.tsx` | Plan 22-08 |
| `apps/web/.../cameras-columns-tooltip.test.tsx` | Plan 22-08 |
| `apps/web/.../tenant-map-page-tag-filter.test.tsx` | Plan 22-10 |

## User Setup Required

None — schema mutation was applied via `pnpm db:push` (not a versioned migration); user confirmed API process restart in Task 2.

## Next Phase Readiness

- **Wave 1 unblocked** — Plans 22-02, 22-03, 22-04, 22-05, 22-06 can now write integration tests against the populated `tagsNormalized` column with the canonical GIN index in place.
- **Wave 2 unblocked** — Plans 22-07, 22-08, 22-09, 22-10, 22-11 have web stub scaffolding for their component tests.
- **Plan-doc cleanup recommended (non-blocking)** — Subsequent Phase 22 plans inherit the `-x` typo in their `<verify>` blocks. Wave 1+ executors should drop `-x` when running the commands; flagging here so plan-checker can patch the plan files in batch if desired.

## Self-Check: PASSED

Verified file presence (Task 3 stubs):

```
EXISTS: apps/api/tests/cameras/tag-normalization.test.ts
EXISTS: apps/api/tests/cameras/tags-filter.test.ts
EXISTS: apps/api/tests/cameras/tags-filter-perf.test.ts
EXISTS: apps/api/tests/cameras/bulk-tags.test.ts
EXISTS: apps/api/tests/cameras/audit-diff.test.ts
EXISTS: apps/api/tests/cameras/distinct-tags.test.ts
EXISTS: apps/api/tests/audit/sanitizer-diff.test.ts
EXISTS: apps/api/tests/status/notify-dispatch.test.ts
EXISTS: apps/web/src/app/admin/cameras/components/__tests__/tag-input-combobox.test.tsx
EXISTS: apps/web/src/app/admin/cameras/components/__tests__/tags-cell.test.tsx
EXISTS: apps/web/src/app/admin/cameras/components/__tests__/cameras-columns-tooltip.test.tsx
EXISTS: apps/web/src/components/pages/__tests__/tenant-map-page-tag-filter.test.tsx
```

Verified commit reachability:

```
FOUND: 72fec73 (Task 1)
FOUND: 7ab545f (Task 3)
```

Verified stub tests pass without failures:

```
api: Tests 4 todo (4) · 0 failed · exit 0
web: Tests 6 todo (6) · 0 failed · exit 0
```

---
*Phase: 22-camera-metadata-utilization-surface-tags-description-across-*
*Completed: 2026-04-26*
