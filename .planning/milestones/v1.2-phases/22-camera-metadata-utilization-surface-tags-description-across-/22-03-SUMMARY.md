---
phase: 22-camera-metadata-utilization-surface-tags-description-across-
plan: 03
subsystem: webhooks
tags: [webhook, notify-dispatch, tags, camera-events, vitest, tdd, d-22]

# Dependency graph
requires:
  - phase: 22-01
    provides: Camera.tags column populated via Prisma extension; notify-dispatch.test.ts stub scaffolding
provides:
  - camera.online webhook payload includes tags: string[] (D-22)
  - camera.offline webhook payload includes tags: string[] (D-22)
  - Empty-tags camera produces tags: [] (stable schema for subscribers)
  - 5 implemented Phase 22 webhook payload assertions replacing 4 it.todo stubs
affects: [22-12]  # validation matrix tracks D-22 closure

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive webhook payload extension — emitEvent accepts Record<string, any>, subscribers ignore unknown fields per webhook contract"
    - "TDD RED→GREEN loop: replace it.todo stubs with concrete assertions, watch them fail, add minimal production code to flip green"
    - "Display-tag preservation in event payloads (D-04) — emit camera.tags (canonical) not tagsNormalized (lowercased mirror)"

key-files:
  created: []
  modified:
    - apps/api/src/status/processors/notify-dispatch.processor.ts
    - apps/api/tests/status/notify-dispatch.test.ts

key-decisions:
  - "Use camera.tags directly with `?? []` fallback rather than re-querying or selecting fields — findUnique without `select` already returns the full row, no extra DB cost, and the nullish-coalesce protects against future refactors that might add a `select` clause"
  - "Inline 5-line code comment cites D-22 + D-04 + 22-03 plan ID — future maintainers reading the emitEvent payload see the contract and exclusion rationale without leaving the file"
  - "Test-file replacement (not extension) of the Plan 22-01 stub — the stub had `it.todo` placeholders only, so the 5 real assertions are a clean replacement; no Phase 15 history to preserve in this file (the maintenance/state-machine sibling tests live in their own files and were unaffected)"
  - "Description and cameraName guarded with explicit `'description' in payload === false` and `'cameraName' in payload === false` assertions, plus extra `'name' in payload === false` to defend against accidental rename — D-22 exclusions are negative invariants and tests must encode them"

requirements-completed: [D-22, D-23]

# Metrics
duration: 4min
completed: 2026-04-26
---

# Phase 22 Plan 03: Webhook payload tags (D-22) Summary

**`tags: camera.tags ?? []` added to `camera.online` and `camera.offline` webhook payloads via a single 7-line change in `notify-dispatch.processor.ts` plus 5 concrete vitest assertions replacing the Plan 22-01 `it.todo` stub — full TDD RED→GREEN with 5/5 webhook tests green and 33/33 status-suite no-regression.**

## Performance

- **Duration:** ~4 min (RED commit → GREEN commit)
- **Started:** 2026-04-26T13:35:28Z
- **Completed:** 2026-04-26T13:39:48Z
- **Tasks:** 1 (TDD: RED + GREEN, no REFACTOR needed — change was already minimal/idiomatic)
- **Files modified:** 2 (1 source + 1 test, no new files, no schema impact)

## Accomplishments

- `notify-dispatch.processor.ts` `emitEvent` payload now includes `tags: camera.tags ?? []` for both `camera.online` and `camera.offline` event types
- Inline comment block on the new field cites D-22 (additive only) + D-04 (display-casing preserved) + 22-03 plan ID for future-maintainer context
- 5 Phase 22 vitest cases written and green:
  1. `camera.online payload includes tags array (display casing preserved)` — verifies `['Outdoor', 'Perimeter']` round-trips with original casing
  2. `camera.offline payload includes tags array (display casing preserved)` — same shape on offline transition
  3. `empty tags emits tags: [] (not undefined / not omitted)` — stable schema for subscriber JSON parsers
  4. `description is NOT in payload (D-22 explicit exclusion)` — `'description' in payload === false`
  5. `cameraName is NOT in payload (D-22 explicit exclusion)` — also asserts `'name' in payload === false` to defend against accidental rename
- Status suite unaffected: `tests/status/` runs 33 tests / 0 failed (debounce, maintenance suppression, state machine all green; Phase 22 cases do not interact with their fixtures)

## Task Commits

1. **TDD RED — write failing tests** — `b0ad117` (test): replace 4 `it.todo` stubs with 5 concrete assertions; 3/5 fail on missing `tags` field, 2/5 (the negative-exclusion cases) pass immediately because the current implementation already excludes description/cameraName
2. **TDD GREEN — minimal implementation** — `e9aa4f6` (feat): add 7-line block to `emitEvent` payload (1 line of code + 6 lines of inline comment); 5/5 tests green, full status suite green

REFACTOR step skipped — the change is a single property addition with explanatory comments, already at minimal-readable form.

## Files Created/Modified

### Production code (Task 1 GREEN)
- `apps/api/src/status/processors/notify-dispatch.processor.ts` — added `tags: camera.tags ?? []` to the `emitEvent` payload object inside `process()`. Camera record is loaded via `findUnique({ where: { id: cameraId } })` (no `select`), so `tags` is included by default — no schema or query change required.

### Tests (Task 1 RED)
- `apps/api/tests/status/notify-dispatch.test.ts` — replaced 4 `it.todo` stubs with 5 concrete assertions inside `describe('Phase 22: webhook tags (D-22)')`. Pattern mirrors the sibling `maintenance-suppression.test.ts` (mock prisma + webhooksService + notificationsService, instantiate processor directly, drive via `jobStub` helper).

## Decisions Made

- **`camera.tags ?? []` over `camera.tags || []`** — `||` would also nullify legitimate empty arrays after a future migration; `??` only triggers on null/undefined. The schema currently has `tags String[] @default([])`, so the fallback is defensive but cheap.
- **No `select` clause modification** — the existing `findUnique` returns the full Camera row including `tags`. Adding a `select` to optimize would (a) couple this processor to a partial-row shape, (b) require explicit `tags: true` per the plan's Pattern 4, and (c) force every future field addition to remember to update the select. Keeping the full-row load is the safer default at zero measurable cost (single primary-key lookup in a hot path).
- **Test file replaced, not extended** — the Plan 22-01 stub was `it.todo`-only with no Phase 15 baseline assertions in this file (the maintenance/state-machine cases live in `maintenance-suppression.test.ts` and `state-machine.test.ts` respectively). A clean replacement is simpler than `describe(..)` block addition and matches the plan's "stub from 22-01 — extend" intent.
- **Negative-invariant guards on description and cameraName** — both D-22 exclusions are encoded as `'X' in payload === false` assertions. The cameraName case additionally checks `'name' in payload === false` to defend against an accidental rename refactor that types `name: cameraName` instead of `cameraName: ...`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Worktree had no node_modules**
- **Found during:** Task 1 RED verification (`npx vitest run` failed with `Failed to load url @prisma/client`)
- **Issue:** The worktree at `.claude/worktrees/agent-af8dba216dc550f58/` had no root `node_modules/` and only a `.vite/` cache in `apps/api/node_modules/`. Vitest's globalSetup couldn't import `@prisma/client` because the relative `../../../node_modules/.pnpm/...` chain in the parent's `apps/api/node_modules/@prisma/client` symlink was broken from the worktree path.
- **Fix:** Symlinked the worktree's two missing node_modules locations to the parent repo's installed copies:
  - `worktree/node_modules → /Users/suraboonsung/.../sms-app/node_modules`
  - `worktree/apps/api/node_modules → /Users/suraboonsung/.../sms-app/apps/api/node_modules`
- **Files modified:** None (filesystem-only, no commits — the symlinks appear as untracked entries that will not be committed and will be cleaned up on worktree teardown).
- **Verification:** `npx vitest run tests/status/notify-dispatch.test.ts` now runs successfully end-to-end; globalSetup connects to test DB; 5/5 tests pass post-GREEN.
- **Committed in:** No commit — operational env fix, not a code change.

**2. [Rule 3 — Blocking] `pnpm --filter @sms-platform/api test` script not invokable from worktree**
- **Found during:** Task 1 RED verification (initial command per plan: `pnpm --filter @sms-platform/api test -- tests/status/notify-dispatch.test.ts -x`)
- **Issue:** pnpm exited with `Command "vitest" not found` because the worktree had no node_modules (per deviation 1). After symlinking, `pnpm --filter` still routes through workspace resolution which is fragile in worktree contexts.
- **Fix:** Used direct `npx vitest run tests/status/notify-dispatch.test.ts --reporter=verbose` from `apps/api/`. The `-x` flag from the plan was dropped per Plan 22-01's documented finding (vitest 2.x rejects `-x` as `Unknown option`).
- **Verification:** `npx vitest run tests/status/` exits 0 with `Test Files 4 passed (4) · Tests 33 passed (33)`.
- **Committed in:** No commit — verification command adjustment.

**3. [Rule 3 — Blocking] Worktree missing `.env.test`**
- **Found during:** First `vitest run` invocation after node_modules symlink (globalSetup threw `TEST_DATABASE_URL is not set`)
- **Fix:** Copied `apps/api/.env.test` from the parent repo into the worktree's `apps/api/.env.test`. The file is git-ignored so this does not affect the working tree's commit list.
- **Files modified:** None tracked (`.env.test` is in `.gitignore`).
- **Committed in:** No commit — local-only setup.

---

**Total deviations:** 3 auto-fixed, all environmental (worktree was missing `node_modules`, `.env.test`, and pnpm-resolvable package paths). Zero scope creep — none of the production code or tests were affected by these deviations.

## Issues Encountered

- **Vitest CJS deprecation warning** — `[33mThe CJS build of Vite's Node API is deprecated[39m`. Documented warning, no functional impact. Project-wide upgrade to Vite ESM API is out of scope for Plan 22-03.
- **No Phase 22 plan-file `-x` typo encountered here** — Plan 22-01's deferred-items log flagged the `-x` flag as a typo across all Phase 22 plan files; this plan also carries the same `-x` in its `<verify>` block. Treated as a documentation typo per Plan 22-01 precedent.

## Threat Flags

None. Plan 22-03 introduces no new endpoint, no new auth surface, and no new schema. The single threat in this plan's threat_model (T-22-04 webhook information disclosure) is mitigated as designed: subscribers must already be authorized to receive `camera.online` / `camera.offline` events for the org (existing `WebhookSubscription.events` filter at `webhooks.service.ts:108-112`); tags are user-defined non-PII metadata; description and cameraName remain excluded.

## Known Stubs

None. This plan resolves the `apps/api/tests/status/notify-dispatch.test.ts` stub created by Plan 22-01 — all 4 prior `it.todo` placeholders are replaced with 5 concrete passing assertions.

## User Setup Required

None — no schema mutation, no Prisma client regeneration, no API restart. Production deployment of this commit pair (`b0ad117`, `e9aa4f6`) is a hot code change to the BullMQ worker; existing webhook subscribers continue to receive prior fields plus the new `tags` array on the next status transition.

## Next Phase Readiness

- **D-22 closed** — `camera.online` / `camera.offline` payloads now include tags array; downstream Plan 22-12 (validation matrix) can mark row 22-W1-WEBHOOK as fulfilled.
- **D-23 closed** — webhook contract for tag-based subscriber filtering is in place; subscriber documentation (Plan 22-11 if applicable) can reference the new field.
- **No downstream blockers** — Plan 22-04 (distinct-tags endpoint) and Plan 22-05 (audit log diff) operate on different code paths; this plan does not gate them.

## Self-Check: PASSED

Verified file presence:

```
FOUND: apps/api/src/status/processors/notify-dispatch.processor.ts
FOUND: apps/api/tests/status/notify-dispatch.test.ts
```

Verified commit reachability:

```
FOUND: b0ad117 (test — RED)
FOUND: e9aa4f6 (feat — GREEN)
```

Verified test results post-GREEN:

```
notify-dispatch.test.ts: Tests 5 passed (5) · 0 failed
tests/status/ (whole suite): Tests 33 passed (33) · 0 failed
```

Verified acceptance-criteria greps:

```
tags: camera.tags     → 1 match at notify-dispatch.processor.ts:63 ✓
description: camera.description → 0 matches ✓
cameraName in emitEvent payload → 0 matches (existing matches are type def, destructure, comment, notification call — none in payload object) ✓
camera load uses select?     → No (findUnique without select), so tags: true addition not applicable ✓
```

---
*Phase: 22-camera-metadata-utilization-surface-tags-description-across-*
*Completed: 2026-04-26*
