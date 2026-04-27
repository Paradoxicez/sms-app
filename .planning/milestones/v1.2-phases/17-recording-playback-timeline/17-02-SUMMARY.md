---
phase: 17-recording-playback-timeline
plan: 02
subsystem: api
tags: [nestjs, prisma, multi-tenant, security, react-hooks, vitest]

# Dependency graph
requires:
  - phase: 17-recording-playback-timeline
    provides: Wave 0 it.todo scaffolds for get-recording.test.ts (4 todos) and use-recording-hook.test.ts (7 todos) from plan 17-00
  - phase: 12-recordings
    provides: RecordingsService base, MinioService, recording-camera-site-project Prisma schema
provides:
  - "RecordingsService.getRecording(id, orgId) — org-scoped via findFirst({where:{id, orgId}}), returns camera+site+project include, throws NotFoundException on cross-org access (T-17-V4 mitigated)"
  - "useRecording(id) hook — three-state error API ('not-found' | 'forbidden' | 'network' | null) with undefined-id no-fetch behavior"
  - "RecordingWithCamera and RecordingCameraInclude TypeScript types for plan 17-04 to consume"
  - "T-17-V4 verified by automated test (cross-org id → 404, never the recording, never 403)"
affects: [17-03, 17-04, 17-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tenant-safe single-record reads use findFirst({where:{id, orgId}}) (NOT findUnique({where:{id}}))"
    - "Web data-fetching hooks expose discriminated union error states for clean UI consumption"
    - "vi.mock('@/lib/api') + renderHook for direct hook contract tests"

key-files:
  created: []
  modified:
    - apps/api/src/recordings/recordings.service.ts
    - apps/api/tests/recordings/get-recording.test.ts
    - apps/api/tests/recordings/download.test.ts
    - apps/web/src/hooks/use-recordings.ts
    - apps/web/src/__tests__/use-recording-hook.test.ts

key-decisions:
  - "findFirst with composite {id, orgId} where clause (not findUnique) — closes T-17-V4 cross-org enumeration; returns 404 for cross-org access (no information leakage about existence in another org)"
  - "Hook error API is discriminated union 'not-found' | 'forbidden' | 'network' (not raw Error) — page UI can render without leaking 'cross-org' phrasing per T-17-V7"
  - "Hook detects HTTP status by substring match on err.message ('404', '403') — matches apiFetch's 'API error: NNN ...' format"

patterns-established:
  - "Pattern: org-scoped getById uses findFirst({where:{id, orgId}}) + selective include"
  - "Pattern: useResource(id|undefined) hook with cancelled-flag cleanup and 3-state error union"

requirements-completed: [REC-01]

# Metrics
duration: ~6min
completed: 2026-04-19
---

# Phase 17 Plan 02: Recording API Hardening + useRecording Hook Summary

**RecordingsService.getRecording switched to findFirst({id, orgId}) closing T-17-V4 cross-org enumeration, expanded include to camera/site/project, and a new useRecording(id) hook with three-state error API now powers the playback page header.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-19T18:16:00Z (approximate)
- **Completed:** 2026-04-19T18:22:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- T-17-V4 mitigated: cross-org GET /api/recordings/:id now returns 404 (verified by automated test that asserts findFirst was called with `{id, orgId}` and that null result throws NotFoundException — not 403, not the recording)
- API getRecording payload now includes camera.id, camera.name, camera.site.{id,name}, camera.site.project.{id,name} alongside the existing _count.segments — unblocks the playback page header for plan 17-04
- New `useRecording(id)` hook exposes a clean discriminated union: `error: 'not-found' | 'forbidden' | 'network' | null`, with undefined-id short-circuit (no apiFetch call) and proper cleanup on unmount/id change
- All 4 it.todo stubs in `get-recording.test.ts` and all 7 it.todo stubs in `use-recording-hook.test.ts` from plan 17-00 are now GREEN
- No regression: 55/55 API recording tests pass; 139 web tests pass with web `tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Tighten getRecording with cross-org 404 + camera include + tests** — `500357f` (feat)
2. **Task 2: Add useRecording hook with three-state error API + GREEN tests** — `d41f698` (feat)

_Note: TDD turnaround on each task was test-first (RED already in place from plan 17-00) → impl → GREEN → commit; no separate RED commit needed because the RED scaffolds were merged in 17-00._

## Files Created/Modified
- `apps/api/src/recordings/recordings.service.ts` — `getRecording`: `findUnique` → `findFirst`; `where:{id}` → `where:{id, orgId}`; added camera/site/project include
- `apps/api/tests/recordings/get-recording.test.ts` — 4 it.todo stubs replaced with GREEN tests (camera include, cross-org 404, _count preservation, not-found)
- `apps/api/tests/recordings/download.test.ts` — Updated 3 pre-existing tests to mock `findFirst` and assert the new `{id, orgId}` contract (they previously asserted the deprecated unsafe `findUnique({where:{id}})` shape)
- `apps/web/src/hooks/use-recordings.ts` — Added `RecordingCameraInclude`, `RecordingWithCamera`, `RecordingLoadError` types and the `useRecording(id)` hook (other hooks untouched)
- `apps/web/src/__tests__/use-recording-hook.test.ts` — 7 it.todo stubs replaced with GREEN unit tests (initial state, success, 404, 403, network, undefined-id no-fetch, re-fetch on id change)

## Decisions Made
- Used `findFirst` with composite `{id, orgId}` instead of two-step `findUnique` + `if (rec.orgId !== orgId) throw` — single query, no possibility of leaking existence via timing, idiomatic Prisma multi-tenant pattern (matches existing `getRecordingWithSegments`)
- Hook detects HTTP status via `err.message.includes('404')` because apiFetch throws `Error("API error: 404 ...")` — substring match is sufficient and avoids coupling to the exact status-line wording
- Returned NotFoundException (404) for cross-org access — not ForbiddenException (403) — per T-17-V4 mitigation plan: revealing "this id exists but you're forbidden" leaks information

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated 3 pre-existing tests in `download.test.ts` that broke when getRecording switched from findUnique to findFirst**
- **Found during:** Task 1 verification (`pnpm vitest run tests/recordings/`)
- **Issue:** `tests/recordings/download.test.ts` had 3 tests that mocked only `tenancyClient.recording.findUnique` and asserted the old `where: { id }` shape — these are exactly the unsafe pattern T-17-V4 was filed against. After changing the service to `findFirst({where:{id, orgId}})`, the mocks returned undefined and assertions failed.
- **Fix:** Added `findFirst: vi.fn()` to the mock client, switched the 3 tests to `findFirst.mockResolvedValue(...)` with the camera include shape, and updated assertions to `expect(...findFirst).toHaveBeenCalledWith({where:{id, orgId},...})`. The test names and intent were preserved (the IDOR test was even renamed to also reference T-17-V4).
- **Files modified:** `apps/api/tests/recordings/download.test.ts`
- **Verification:** `pnpm vitest run tests/recordings/` — 55/55 tests pass, all 10 test files green
- **Committed in:** `500357f` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — pre-existing test alignment with new service contract)
**Impact on plan:** Necessary for correctness. The deviation was fully within scope (same security boundary the plan was hardening) and did not change the planned behavior — it brought a sibling test file in line with the new contract that the plan introduced.

## Issues Encountered
None — both tasks executed cleanly.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Plan 17-03 (HlsPlayer move) is unblocked — no API/hook dependency from this plan
- Plan 17-04 (playback page) can now consume `useRecording(id)` and render the header with `recording.camera.site.project.name › recording.camera.site.name › recording.camera.name`. The 3-state error union maps directly to the page's "not available / forbidden / network error" UI states per T-17-V7
- T-17-V4 is closed and verifiable; the playback page only needs to render the hook output without re-checking org membership

## Self-Check: PASSED

- FOUND: apps/api/src/recordings/recordings.service.ts (modified — contains `findFirst({` and `where: { id, orgId }`)
- FOUND: apps/api/tests/recordings/get-recording.test.ts (4 it() blocks, no it.todo)
- FOUND: apps/api/tests/recordings/download.test.ts (3 tests updated to new contract)
- FOUND: apps/web/src/hooks/use-recordings.ts (contains `export function useRecording`, `RecordingWithCamera`, `RecordingLoadError`)
- FOUND: apps/web/src/__tests__/use-recording-hook.test.ts (7 it() blocks, no it.todo)
- FOUND commit: 500357f (Task 1 — feat(17-02): tighten getRecording with cross-org 404 + camera include)
- FOUND commit: d41f698 (Task 2 — feat(17-02): add useRecording hook with three-state error API)
- API tests: 55/55 pass across 10 recording test files
- Web tests: 139 pass (17 todos in unrelated suites), 0 failures
- Web tsc --noEmit: clean (no errors)

---
*Phase: 17-recording-playback-timeline*
*Completed: 2026-04-19*
