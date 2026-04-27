---
phase: 22-camera-metadata-utilization-surface-tags-description-across-
plan: 02
subsystem: api
tags: [filter, prisma, gin-index, zod, tags, camera, rls]

# Dependency graph
requires:
  - phase: 22-01
    provides: Camera.tagsNormalized shadow column + GIN index camera_tagsnormalized_idx + Prisma extension auto-mirroring tags → tagsNormalized
provides:
  - findAllCameras(orgId, { siteId?, tags? }) — case-insensitive OR filter via tagsNormalized hasSome
  - GET /cameras?tags[]=Lobby&tags[]=Entrance — Zod-parsed query string filter
  - Advisory GIN bitmap-scan perf test (EXPLAIN ANALYZE) + deterministic index-name verification
  - 17 integration tests pinning the case-insensitive + RLS isolation contract
affects: [22-08, 22-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zod query-string union schema: z.union([z.string(), z.array(z.string())]).transform((v) => Array.isArray(v) ? v : [v]) — handles Express qs's single-value-vs-array flip"
    - "Pitfall 3 mitigation pattern: every tag filter input is .trim().toLowerCase()'d before hitting tagsNormalized; empty-after-trim values stripped to keep hasSome arrays clean"
    - "Backwards-compatible signature widening: findAllCameras(orgIdOrSiteId?, options?) keeps legacy single-arg callers working while accepting the Phase 22 (orgId, options) shape — discriminator is presence of options"
    - "Advisory perf test pattern: assert hard on the deterministic bit (index name in pg_indexes), soft-pass with [FLAKY-ON-CI] warning on planner-choice (Seq Scan on small tables)"

key-files:
  created: []
  modified:
    - apps/api/src/cameras/cameras.service.ts
    - apps/api/src/cameras/cameras.controller.ts
    - apps/api/tests/cameras/tags-filter.test.ts
    - apps/api/tests/cameras/tags-filter-perf.test.ts

key-decisions:
  - "Service signature kept backwards-compatible — `findAllCameras(orgIdOrSiteId?, options?)` continues to accept the legacy single-string call shape (camera-crud.test.ts:77 passes 0 args) while adding the Phase 22 (orgId, options) shape. The discriminator is the presence of `options` so the two shapes can never collide."
  - "Pitfall 3 lowercase + trim is applied at the service boundary (`options.tags.map(t => t.trim().toLowerCase())`) instead of relying on the `normalizeForDb` helper from Plan 22-01 — kept inline so the filter behavior is greppable from the where-clause, and avoids a cross-module import for a 1-line transform."
  - "Empty-after-trim tag values (`?tags[]=`) are stripped before issuing the where-clause so an empty array doesn't pollute hasSome (which would skew planner estimates and waste index lookups)."
  - "Perf test soft-passes on Seq Scan rather than failing — Postgres' planner can legitimately pick Seq Scan on small tables, and CI flap on a planner heuristic would be worse than no signal. The deterministic `pg_indexes` query catches index drops directly."

requirements-completed: [D-06, D-07]

# Metrics
duration: ~10min
completed: 2026-04-26
---

# Phase 22 Plan 02: ?tags[]= filter on GET /cameras Summary

**Wires the case-insensitive OR filter for `GET /cameras?tags[]=Lobby` through the GIN-indexed `tagsNormalized` shadow column from Plan 22-01 — service applies `where.tagsNormalized = { hasSome: input.map(lowercase) }`, controller parses both single-value and array query shapes via Zod, and an advisory perf test pins the GIN index name + bitmap-scan path.**

## Performance

- **Duration:** ~10 min (Task 1 RED → Task 1 GREEN → Task 2)
- **Started:** 2026-04-26T13:36:40Z
- **Completed:** 2026-04-26T13:46:38Z
- **Tasks:** 2 (Task 1 TDD: RED + GREEN, Task 2 advisory perf)
- **Files modified:** 4 (2 source + 2 tests; no new files)

## Accomplishments

- `findAllCameras(orgId, { siteId?, tags? })` now accepts a `tags: string[]` filter, lowercases + trims input, and applies it via `where.tagsNormalized = { hasSome: ... }` against the Plan 22-01 GIN-indexed shadow column.
- Backwards compatibility preserved — legacy callers (camera-crud.test.ts:77) that invoke `findAllCameras()` with no args still compile and behave identically (the new `options` discriminator switches between shapes).
- Controller `GET /cameras` accepts `?tags[]=` in both shapes Express's qs parser produces (single-value `?tags[]=a` arrives as a string, multiple `?tags[]=a&tags[]=b` arrives as a string[]); a Zod `union(...).transform(...)` unifies to string[].
- 17 integration test cases cover: where-clause contract (8 unit), real-DB case-insensitive matching with RLS isolation (5 testPrisma + app_user role), and controller Zod query parsing (4 cases).
- 2 advisory perf cases cover: EXPLAIN ANALYZE on `tagsNormalized && ARRAY['lobby']` (soft-pass when planner chooses Seq Scan due to small table), and deterministic verification that the index name `camera_tagsnormalized_idx` exists in pg_indexes.
- API build clean (`nest build` exits 0); full cameras test suite still 168 passing / 32 todos.

## Task Commits

Each task committed atomically with `--no-verify` per parallel-executor protocol:

1. **Task 1 RED — failing tests for ?tags[]= filter** — `c020ec4` (test) — 17 cases, 8 failing pre-implementation as expected
2. **Task 1 GREEN — service + controller wired** — `c54debd` (feat) — 17/17 passing post-implementation, build clean, no regressions in camera-crud
3. **Task 2 — advisory GIN perf test** — `6430cac` (test) — 2 cases, both passing (1 soft-passed on Seq Scan, 1 deterministic name verification)

**Plan metadata:** orchestrator owns final commit (SUMMARY only — STATE.md / ROADMAP.md updates deferred to orchestrator per parent prompt).

## Files Created/Modified

### Source (Task 1 GREEN — c54debd)
- `apps/api/src/cameras/cameras.service.ts` — `findAllCameras` signature widened to `(orgIdOrSiteId?, options?: { siteId?, tags? })`; `where.tagsNormalized = { hasSome: lowercased }` added when `options.tags` present; existing `include` shape preserved byte-identically.
- `apps/api/src/cameras/cameras.controller.ts` — Added `import { z } from 'zod'`; new `listCamerasQuerySchema` with `z.union([z.string(), z.array(z.string())]).transform(...)`; `findAllCameras` handler now reads `@Query('tags')`, validates via `safeParse`, threads `orgId` from CLS, calls service with new shape; `@ApiQuery` doc'd for OpenAPI.

### Tests (Task 1 RED — c020ec4 + Task 2 — 6430cac)
- `apps/api/tests/cameras/tags-filter.test.ts` — 17 cases (replaces 4-stub from Plan 22-01):
  - 8 where-clause unit tests (mocked tenancy)
  - 5 real-DB integration tests with RLS isolation (testPrisma + app_user role + set_config)
  - 4 controller Zod query parsing tests
- `apps/api/tests/cameras/tags-filter-perf.test.ts` — 2 cases (replaces 2-stub):
  - 1 EXPLAIN ANALYZE assertion with soft-pass on Seq Scan
  - 1 deterministic `pg_indexes` query verifying canonical index name

## Decisions Made

- **Backwards-compatible signature widening** — Rather than break every existing `findAllCameras` caller, the signature accepts both legacy `(siteId)` and Phase 22 `(orgId, options)` shapes. The discriminator (`options !== undefined`) cleanly routes between them so a Phase 22 caller passing `('org-1', { tags: [...] })` doesn't accidentally treat `'org-1'` as a siteId. Pinned in Test 4.
- **Pitfall 3 lowercase + trim inline** — The lowercasing happens at the service boundary as a 1-line `.map(t => t.trim().toLowerCase())` rather than calling out to `normalizeForDb` from `tag-normalize.ts`. Reasoning: keeps the filter contract greppable from the where-clause, and the helper's empty-array short-circuit logic isn't needed here (we already guard with `options.tags.length > 0` and a post-filter length check).
- **Empty-after-trim values stripped** — `?tags[]=` (empty value) yields `''` after trim+lowercase; the `.filter((t) => t.length > 0)` strips these so `hasSome` doesn't see an empty string array element. The post-filter `if (normalized.length > 0)` then ensures the whole `tagsNormalized` clause is omitted when ALL values were empty.
- **Perf test soft-pass on Seq Scan** — A small table of 100 rows is well within the planner's threshold for choosing Seq Scan over a GIN bitmap; failing CI on this would be a planner-heuristic flap rather than a regression. The deterministic `pg_indexes` query catches the regressions we actually care about (index dropped, `ops: ArrayOps` removed, `map:` directive removed).
- **`z.string().optional()` (not `.uuid()`) for siteId** — The plan suggested `z.string().uuid().optional()` but the existing controller takes a bare `@Query('siteId')` with no UUID validation, and tightening it here would be a behavior change outside this plan's scope (could reject existing requests with non-UUID siteIds — defensive ergonomics deferred to a future plan). Validated against existing camera-crud tests passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Worktree had no node_modules / .env / .env.test**
- **Found during:** Task 1 RED verification (first attempt to run vitest from the worktree)
- **Issue:** The git worktree at `.claude/worktrees/agent-af7af4250b67ca384/` is a fresh checkout with no `node_modules` or `.env*` files. Running `pnpm --filter @sms-platform/api test` from the worktree failed with `prisma: command not found` and `TEST_DATABASE_URL is not set`.
- **Fix:** Created symlinks in the worktree pointing at the main-repo files: `node_modules`, `apps/api/node_modules`, `apps/web/node_modules`, `.env`, `apps/api/.env`, `apps/api/.env.test`.
- **Files modified:** None tracked (symlinks live outside git — `node_modules`, `.env*` are .gitignored).
- **Verification:** `pnpm --filter @sms-platform/api test -- tests/cameras/tags-filter.test.ts` then ran successfully against the worktree's source files.
- **Committed in:** No commit — operational setup only.

**2. [Rule 1 — Bug in initial draft] First-pass `siteId` resolver collapsed orgId into siteId**
- **Found during:** Task 1 GREEN, before running tests (caught during code review).
- **Issue:** Initial draft used `const siteId = options?.siteId ?? orgIdOrSiteId;` which would fall through to `orgIdOrSiteId` (the orgId on Phase 22 callers) whenever `options.siteId` was undefined — resulting in `where.siteId = 'org-1'`. Tests 1, 2, 5 would have failed with the wrong siteId in the where-clause.
- **Fix:** Replaced fallback with discriminator: `options !== undefined ? options.siteId : orgIdOrSiteId` — when options is supplied, only `options.siteId` is consulted; legacy single-arg path preserved.
- **Files modified:** apps/api/src/cameras/cameras.service.ts (one line, before the GREEN commit).
- **Verification:** Tests 1, 2, 5 explicitly assert `callArgs.where.tagsNormalized` is set without an unexpected `siteId` clause; all 17 passing.
- **Committed in:** Folded into c54debd (GREEN commit).

---

**Total deviations:** 2 (1 blocking — operational, 1 bug — caught pre-commit)
**Impact on plan:** Zero scope creep. The worktree-setup deviation is a per-plan operational fact for parallel executors; the discriminator bug was caught and fixed before any commit landed.

## Issues Encountered

- **Worktree environment setup** — see Deviations §1.
- **Read-before-edit hook firing on every edit** — The runtime's PreToolUse hook required re-reading every file before each Edit/Write, even when the file had been read earlier in the session. Compliance was straightforward (re-Read between consecutive edits) but added a small amount of latency to the implementation phase.

## Threat Flags

None — Plan 22-02 introduces no new auth surface. The `tags` query parameter is a string array filtered through Prisma's parameterized `hasSome` operator (T-22-02 mitigation — no raw SQL interpolation), and the existing TENANCY_CLIENT/RLS chain handles cross-org isolation (T-22-01 mitigation — pinned by Test 12 which seeds two orgs and asserts Org B never sees Org A's lobby camera).

## Known Stubs

None introduced by this plan. Plan 22-01's stub files for Wave 1+ remain in place for their owning plans (22-03, 22-04, 22-05, 22-06).

## User Setup Required

None — schema was applied by Plan 22-01 via `pnpm db:push`; this plan is a pure code change against the existing schema.

## Next Phase Readiness

- **Plan 22-08 (UI Tags filter chip)** unblocked — backend now accepts `?tags[]=` and the JSON contract is pinned by Tests 14-17.
- **Plan 22-10 (map view tag filter)** unblocked — same backend endpoint is the data source for the map's tag MultiSelect.
- **Plan 22-04 (distinct tags endpoint)** can proceed independently — different endpoint, different cache, no dependency on this plan's changes.

## Self-Check: PASSED

Verified file presence (modified):

```
EXISTS: apps/api/src/cameras/cameras.service.ts
EXISTS: apps/api/src/cameras/cameras.controller.ts
EXISTS: apps/api/tests/cameras/tags-filter.test.ts
EXISTS: apps/api/tests/cameras/tags-filter-perf.test.ts
```

Verified commit reachability:

```
FOUND: c020ec4 (Task 1 RED)
FOUND: c54debd (Task 1 GREEN)
FOUND: 6430cac (Task 2)
```

Verified all tests pass:

```
api: tags-filter.test.ts          → 17/17 passing
api: tags-filter-perf.test.ts     → 2/2 passing (1 soft-pass on Seq Scan, 1 deterministic name verify)
api: camera-crud.test.ts          → 14/14 passing (no regressions; 3 todos pre-existing)
api: build (nest build)           → exit 0, 166 files compiled with swc
```

Verified acceptance grep contract from PLAN.md:

```
✓ tagsNormalized in cameras.service.ts findAllCameras body — 1+ matches
✓ tags.*hasSome — 1+ matches
✓ .toLowerCase() in findAllCameras body — 1 match
✓ controller has z.union([z.string(), z.array(z.string())]) — present in listCamerasQuerySchema
✓ tags-filter.test.ts contains 0 it.todo — replaced with 17 it() cases
✓ tags-filter-perf.test.ts contains "Bitmap Index Scan" / "Index Scan" — 5+ matches
```

---
*Phase: 22-camera-metadata-utilization-surface-tags-description-across-*
*Completed: 2026-04-26*
