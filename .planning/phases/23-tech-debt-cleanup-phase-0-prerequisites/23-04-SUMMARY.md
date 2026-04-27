---
phase: 23-tech-debt-cleanup-phase-0-prerequisites
plan: 04
subsystem: ui
tags: [recordings, playback, prisma, react, tailwind, line-clamp, tags-cell, debt-04]

# Dependency graph
requires:
  - phase: 22-camera-metadata-utilization
    provides: Camera.tags + Camera.description schema fields, TagsCell component, line-clamp + Show more disclosure pattern
  - phase: 17-recording-playback
    provides: /app/recordings/[id] route, PlaybackPageHeader component, getRecording API
provides:
  - Recording playback page surfaces parent camera tags + description metadata
  - getRecording API response extends camera relation with tags + description
  - RecordingCameraInclude type contract aligned with backend payload
  - Header zone above the player with read-only badge row + line-clamped description with Show more disclosure
affects:
  - any future recording-detail surface (admin recording detail if added later)
  - recording playback UX evolution (tag filter / linkback would extend this surface)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuse Phase 22 TagsCell component across surfaces (cameras table → recording playback header)"
    - "120-char heuristic for Show more disclosure (mirrors map camera-popup.tsx pattern from Phase 22 Plan 10)"
    - "Conditional metadata wrapper hides empty bordered block when both tags + description are absent"

key-files:
  created: []
  modified:
    - apps/api/src/recordings/recordings.service.ts (+2 lines)
    - apps/api/tests/recordings/get-recording.test.ts (+73 lines)
    - apps/web/src/hooks/use-recordings.ts (+2 lines)
    - apps/web/src/app/app/recordings/[id]/components/playback-page-header.tsx (+34 lines)
    - apps/web/src/app/app/recordings/[id]/page.tsx (+2 lines)

key-decisions:
  - "Reused Phase 22 TagsCell with maxVisible=4 (vs default 3) — recording header has more horizontal real estate than the cameras table"
  - "120-char heuristic for Show more — mirrors Phase 22 Plan 10 camera-popup pattern; cameras with short descriptions skip the toggle entirely"
  - "Conditional metadata block (no empty bordered area when both tags=[] and description=null) — ensures the UI still degrades cleanly for cameras without metadata"
  - "border-b + pb-3 visually separates the metadata row from the date/calendar controls below"
  - "Did NOT touch getRecordingWithSegments — different code path (download flow); decoupled to avoid coupling this plan to a download-API contract change"
  - "Tags rendered as read-only badges (D-19) — clickable filter linkback deferred to future phase"
  - "No admin /admin/recordings/[id] detail page created — researcher confirmed it does not exist; out of scope per planner_context"

patterns-established:
  - "TDD RED → GREEN split for Prisma include extensions: failing test asserting result.camera.<field> + Prisma include.camera.select.<field>: true, then 2-line Prisma include change"
  - "Type-contract alignment via shared interface (RecordingCameraInclude) so a backend select extension is enforced in TypeScript across all consumers transitively"

requirements-completed: [DEBT-04]

# Metrics
duration: ~30min
completed: 2026-04-27
---

# Phase 23 Plan 04: DEBT-04 Recording Playback Camera Metadata Summary

**Surface parent camera tags + description on /app/recordings/[id] header by reusing Phase 22 TagsCell + line-clamp Show-more disclosure pattern — closes the Phase 22 ↔ Phase 17 audit gap with a 2-line Prisma include extension and a 38-line frontend touch.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-27T10:17:38Z (state-recorded plan start)
- **Completed:** 2026-04-27T10:47:01Z
- **Tasks:** 3 (executed across 4 atomic commits — TDD split on Task 1)
- **Files modified:** 5

## Accomplishments

- Backend payload now includes `camera.tags` + `camera.description` on `GET /api/recordings/:id` — verified by 2 new vitest cases asserting both populated and empty/null states.
- Type contract on `RecordingCameraInclude` now mirrors the new payload (required `string[]` for tags, nullable string for description) — `RecordingWithCamera` transitively inherits.
- Playback page header renders read-only badge row + line-clamped description with Show more disclosure between the back button and the camera-name + date controls.
- Conditional wrapper hides the entire metadata block for cameras without either tags or description — no empty UI artefact.

## Task Commits

Each task was committed atomically (TDD on Task 1 split RED → GREEN):

1. **Task 1 (RED): Add failing tests for camera.tags + camera.description** — `cf6659d` (test)
2. **Task 1 (GREEN): Include camera.tags + camera.description in getRecording** — `64ce747` (feat)
3. **Task 2: Extend RecordingCameraInclude with tags + description** — `52a45e4` (feat)
4. **Task 3: Render TagsCell + line-clamped description in playback header** — `7361138` (feat)

_Note: Task 1 was a TDD task — RED commit added the failing tests (vitest reported 2 failures asserting tags/description in the include block); GREEN commit added the 2-line Prisma include extension that flipped them green._

## Files Created/Modified

- `apps/api/src/recordings/recordings.service.ts` — Added `tags: true` + `description: true` to `getRecording().include.camera.select` (line 516-517). `getRecordingWithSegments` deliberately untouched (different code path).
- `apps/api/tests/recordings/get-recording.test.ts` — Added 2 Phase 23 DEBT-04 tests (populated + empty state); updated existing happy-path mock to include the new fields. Total: 6 passing.
- `apps/web/src/hooks/use-recordings.ts` — Extended `RecordingCameraInclude` interface (line 21-22) with `tags: string[]` and `description: string | null`. Required (not optional) — empty array is the absent state.
- `apps/web/src/app/app/recordings/[id]/components/playback-page-header.tsx` — Imported `TagsCell` from `@/app/admin/cameras/components/tags-cell`; added 2 optional props (`tags?`, `description?`); added `descriptionExpanded` useState + `descriptionIsLong` length-heuristic flag; rendered metadata block (TagsCell + line-clamp-2 description with Show more) between back button and camera-name row.
- `apps/web/src/app/app/recordings/[id]/page.tsx` — Pass `recording.camera?.tags` + `recording.camera?.description` through to PlaybackPageHeader (line 205-206).

## Decisions Made

All key decisions captured in the frontmatter `key-decisions` array. Highlights:

- **Reuse over rebuild:** TagsCell from Phase 22 ships with the +N overflow tooltip + D-15 enforcement (no per-tag color); reusing it preserves visual + behavioral consistency across surfaces.
- **120-char heuristic:** Mirrors the Phase 22 camera-popup pattern. Avoids measuring DOM dimensions for a useState toggle.
- **Decoupled scope:** `getRecordingWithSegments` (download path) intentionally left alone — adding tags/description there would couple this plan to a download-contract change.
- **Conditional render:** Empty cameras (no tags, no description) skip the entire bordered block — no empty UI residue.

## Deviations from Plan

None - plan executed exactly as written.

The plan was concrete enough that all 3 tasks landed without needing Rules 1-3 auto-fixes:
- API include extension: 2-line Prisma change as planned.
- Type extension: 2-line interface change; `RecordingWithCamera` inherited transitively without breaking any consumer (web build green).
- Header render: TagsCell reuse + line-clamp-2 + Show more disclosure as planned.

The one **operational** prerequisite (not a deviation, infrastructure-level): the worktree had no `node_modules` and no `.env` / `.env.test`. Fixed by `pnpm install --frozen-lockfile` and copying `.env` + `.env.test` from the main worktree. This is per-worktree bootstrapping, not plan content.

## Issues Encountered

- **Worktree bootstrap:** Fresh agent worktree had no `node_modules` and missing `.env` / `.env.test`. Resolved by `pnpm install --frozen-lockfile` (uses lockfile for deterministic install) and copying env files from the main checkout. Took ~25s install + 1s file copy. Did not affect plan correctness.

## Verification Results

### Task 1 verify (`pnpm --filter @sms-platform/api test -- get-recording --run`)

```
✓ tests/recordings/get-recording.test.ts (6 tests)
  ✓ returns camera include: payload contains camera.id, camera.name, camera.site.name, camera.site.project.name
  ✓ includes camera.tags + camera.description in response (Phase 23 DEBT-04)
  ✓ handles empty tags array and null description (Phase 23 DEBT-04)
  ✓ cross-org 404: getRecording with id from another org throws NotFoundException
  ✓ preserves existing _count.segments include
  ✓ throws NotFoundException when recording id does not exist in any org

Test Files  1 passed (1)
     Tests  6 passed (6)
```

### Task 2 verify (`pnpm --filter @sms-platform/web build`)

Exit 0 — full Next.js production build succeeded across all 39 routes (admin + tenant + embed + sign-in). `RecordingCameraInclude` type extension propagated through `RecordingWithCamera` to `useRecording` consumers without breaking any caller.

### Task 3 verify — chained build + 3 grep sentinel regression gate

```bash
pnpm --filter @sms-platform/web build \
  && grep -q 'TagsCell' apps/web/src/app/app/recordings/[id]/components/playback-page-header.tsx \
  && grep -q 'line-clamp-2' apps/web/src/app/app/recordings/[id]/components/playback-page-header.tsx \
  && grep -q 'descriptionExpanded' apps/web/src/app/app/recordings/[id]/components/playback-page-header.tsx
```

- Build: exit 0
- `TagsCell`: PRESENT
- `line-clamp-2`: PRESENT
- `descriptionExpanded`: PRESENT

Exit 0 (chain held).

### Manual smoke

Documented but not executed in the agent session per plan note — runtime smoke (`pnpm dev:web` + visit `/app/recordings/<id>`) is owned by the operator. The chained build + 3 grep render-sentinel gate is the regression gate that locks the JSX render shape; the operator's manual smoke confirms the visual layout. Per `23-VALIDATION.md` "Manual-Only Verifications" row 4, this is a manual smoke step in v1.3 (no `apps/web` vitest runner — Wave 0 did not add one).

### Out-of-scope confirmation

`apps/web/src/app/admin/recordings/[id]/` does NOT exist (verified by `git status` showing no new directories created). The admin recordings page at `apps/web/src/app/admin/recordings/page.tsx` is a list view only. No admin detail page was created — researcher A2 honored.

### Threat model — RLS preserved

- `getRecording()` continues to use `tenantPrisma` (the comment at lines 504-507 about T-17-V4 IDOR mitigation is preserved untouched).
- The Prisma include extension does not bypass row-level filtering — RLS still applies to the parent `Recording` row via `where: { id, orgId }` + RLS policy; the include is a relation traversal under the same tenant scope.
- T-23-12 mitigation per plan threat register: applied. T-23-13 (camera metadata visible to org members) and T-23-14 (TagsCell tampering) both `accept` — no new code surface introduced.

## User Setup Required

None — no external service configuration required. All changes are pure code (no env vars, no schema migration, no service config).

## Known Stubs

None — all modified files have wired data flowing end-to-end (Prisma → API → hook → page → header → TagsCell). Zero hardcoded empty values, zero placeholder strings.

## Next Phase Readiness

- DEBT-04 closed: Phase 22 ↔ Phase 17 audit gap surfaced through the recording playback page.
- Plan 23-04 has no dependents in the v1.3 plan dependency graph — Phase 23 has remaining waves (23-05 CI gate, 23-06 migration squash) that are independent of this UI/API work.
- Task list for Phase 23 plan 04 fully delivered against `requirements: [DEBT-04]`.

## Self-Check: PASSED

**Files claimed:**
- `apps/api/src/recordings/recordings.service.ts` — FOUND (modified, lines 516-517 contain `tags: true` + `description: true`)
- `apps/api/tests/recordings/get-recording.test.ts` — FOUND (6 tests pass)
- `apps/web/src/hooks/use-recordings.ts` — FOUND (lines 21-22 contain new fields)
- `apps/web/src/app/app/recordings/[id]/components/playback-page-header.tsx` — FOUND (TagsCell, line-clamp-2, descriptionExpanded all PRESENT)
- `apps/web/src/app/app/recordings/[id]/page.tsx` — FOUND (tags + description props passed through)

**Commits claimed:**
- `cf6659d` — FOUND (test: add failing tests for camera.tags + camera.description on getRecording)
- `64ce747` — FOUND (feat: include camera.tags + camera.description in getRecording response)
- `52a45e4` — FOUND (feat: extend RecordingCameraInclude with tags + description)
- `7361138` — FOUND (feat: render TagsCell + line-clamped description in playback header)

**Verifications claimed:**
- API test suite 6/6 pass — VERIFIED
- Web build exit 0 — VERIFIED
- Task 3 chained gate (build + 3 grep) exit 0 — VERIFIED

---
*Phase: 23-tech-debt-cleanup-phase-0-prerequisites*
*Completed: 2026-04-27*
