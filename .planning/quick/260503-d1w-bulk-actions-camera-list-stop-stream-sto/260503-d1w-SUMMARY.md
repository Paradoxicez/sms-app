---
phase: quick-260503-d1w
plan: 01
subsystem: web
tags: [bulk-actions, camera-list, stop-stream, stop-recording, ui]
requires: []
provides: [bulk-stop-stream-verb, bulk-stop-recording-verb]
affects: [bulk-actions-lib, use-camera-bulk-actions-hook, BulkToolbar, CameraBulkActions, TenantCamerasPage]
tech_stack_added: []
tech_stack_patterns: [outline-variant-button-mirror, pre-filter-helpers-inverse-pattern]
key_files_created: []
key_files_modified:
  - apps/web/src/lib/bulk-actions.ts
  - apps/web/src/lib/bulk-actions.test.ts
  - apps/web/src/hooks/use-camera-bulk-actions.ts
  - apps/web/src/app/admin/cameras/components/bulk-toolbar.tsx
  - apps/web/src/app/admin/cameras/components/camera-bulk-actions.tsx
  - apps/web/src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx
  - apps/web/src/components/pages/tenant-cameras-page.tsx
decisions:
  - Stop buttons use variant="outline" (NOT "destructive") — Stop is reversible, no data loss
  - Same Radio + Circle icons reused for Stop Stream / Stop Recording — visual symmetry with Start variants
  - Pre-filter helpers (filterStopStreamTargets / filterStopRecordingTargets) keep cameras WHERE the action is meaningful (inverse of filterStart* helpers)
  - Buttons always-visible (no conditional hiding) — runBulk's `if (targets.length === 0) return` already neutralises empty target sets
  - tenant-cameras-page.tsx (Rule 3 — direct BulkToolbar consumer) updated in same commit to keep TS exhaustiveness happy
metrics:
  duration: ~10m
  completed: 2026-05-03
---

# Quick Task 260503-d1w: Bulk Stop Stream + Stop Recording — Camera List Toolbar — Summary

Symmetric gap closure: added `stop-stream` + `stop-recording` bulk verbs to mirror the existing `start-stream` + `start-recording` pair shipped in Phase 20 Plan 03. Pure frontend extension — backend endpoints (`POST /api/cameras/:id/stream/stop`, `POST /api/recordings/stop`) already exist.

## Files Changed (7 total)

| # | File | Rationale |
|---|------|-----------|
| 1 | `apps/web/src/lib/bulk-actions.ts` | Extended `BulkVerb` union, `ACTION` dispatch table, `VERB_COPY` strings; added `filterStopStreamTargets` + `filterStopRecordingTargets` (inverse of the start-* filters). |
| 2 | `apps/web/src/lib/bulk-actions.test.ts` | +11 vitest cases covering dispatch shape (HTTP path + body), `VERB_COPY` (singular/plural/errorTitle), filter helpers (kept ids), and mutation snapshot now spans the two new helpers. |
| 3 | `apps/web/src/hooks/use-camera-bulk-actions.ts` | Added `handleBulkStopStream` + `handleBulkStopRecording` useCallbacks; exported them from the hook return alongside the Start variants. |
| 4 | `apps/web/src/app/admin/cameras/components/bulk-toolbar.tsx` | Extended `BulkToolbarProps` with `onStopStream` + `onStopRecording`; rendered two outline-variant buttons immediately after Start Stream / Start Recording (Radio + Circle icons reused; English labels). Updated docblock to mention the new always-visible buttons. |
| 5 | `apps/web/src/app/admin/cameras/components/camera-bulk-actions.tsx` | Wired the two new hook handlers through to `<BulkToolbar>` props. |
| 6 | `apps/web/src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx` | Rule 3 — `allHandlers()` helper extended with `onStopStream` + `onStopRecording` mocks so the existing 31 toolbar tests keep typechecking. |
| 7 | `apps/web/src/components/pages/tenant-cameras-page.tsx` | Rule 3 — second `<BulkToolbar>` consumer (tenant-side cameras page); imported the two filter helpers, added `handleBulkStopStream` + `handleBulkStopRecording` plain functions, threaded the new props through. |

## Verification Commands

| Command | Status | Notes |
|---------|--------|-------|
| `npx vitest run src/lib/bulk-actions.test.ts` | PASS (44/44) | 33 pre-existing + 11 new cases |
| `npx vitest run src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx` | PASS (31/31) | No assertion changes; only `allHandlers()` mock extension to satisfy TS prop exhaustiveness |
| `npx tsc --noEmit` (apps/web) | PASS (exit 0) | Required updating `bulk-toolbar.test.tsx` + `tenant-cameras-page.tsx` (Rule 3) so the new required props don't break unrelated call-sites |

## Commits

| Hash | Type | Message |
|------|------|---------|
| `c7d7a20` | test | RED — failing tests for stop-stream + stop-recording verbs |
| `ff41689` | feat | GREEN — bulk-actions library extended with the two new verbs + filter helpers |
| `262ad0c` | feat | Task 2 — wired the verbs through hook + toolbar + tenant page |

## Deviations from Plan

### Auto-fixed (Rule 3 — Blocking)

**1. [Rule 3 - Blocking] Extended bulk-toolbar.test.tsx + tenant-cameras-page.tsx**
- **Found during:** Task 2 typecheck verification
- **Issue:** `BulkToolbarProps` is `Required<{onStopStream, onStopRecording, ...}>`; both `bulk-toolbar.test.tsx` (`allHandlers()` helper) and `tenant-cameras-page.tsx` (second `<BulkToolbar>` consumer) failed TS2739 when the props became mandatory.
- **Fix:** Added `onStopStream: vi.fn()` + `onStopRecording: vi.fn()` to `allHandlers()`; added matching `handleBulkStopStream` / `handleBulkStopRecording` functions + filter imports to `tenant-cameras-page.tsx` and threaded the new props through. Net effect: stop verbs work in both `/admin/cameras` AND `/cameras` (tenant) — broader UX coverage than the plan scope.
- **Files modified:** `apps/web/src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx`, `apps/web/src/components/pages/tenant-cameras-page.tsx`
- **Commit:** `262ad0c`

## UX Notes

- **Symmetry preserved:** Stop Stream / Stop Recording sit immediately after Start Stream / Start Recording in the toolbar (start→stop pair grouping per task spec).
- **Always-visible policy honoured:** Both buttons render regardless of selection contents; the hook's `runBulk` early-returns when the pre-filter yields zero targets, preventing false toasts.
- **English-only copy:** "Stop Stream" / "Stop Recording" labels, "N streams stopped" / "N recordings stopped" toasts, "Failed to stop streams" / "Failed to stop recordings" error titles. Zero Thai strings added (per `feedback_language_english_default`).
- **Outline variant (NOT destructive):** Stop is reversible — no data loss. Reserving `variant="destructive"` for true delete operations keeps the visual hierarchy honest (per `feedback_ui_pro_minimal`).
- **Tenant page parity:** Quick task spec only mandated `/admin/cameras` updates, but `tenant-cameras-page.tsx` shares the same `<BulkToolbar>` import. Closing the type mismatch there gave tenants Stop bulk actions as a side-benefit at zero extra design cost.

## Confirmation: Existing Flows Unaffected

- All 33 pre-existing `bulk-actions.test.ts` cases still pass.
- All 31 pre-existing `bulk-toolbar.test.tsx` cases still pass — only the `allHandlers()` mock helper was extended.
- `start-stream` / `start-recording` ACTION + VERB_COPY entries are unchanged byte-for-byte.
- The Phase 20 Plan 03 docblock at the top of `bulk-actions.ts` is preserved verbatim; a short append-only quick-task note was added directly above the `BulkVerb` union as specified.

## Self-Check: PASSED

- File `apps/web/src/lib/bulk-actions.ts` — FOUND (modified)
- File `apps/web/src/lib/bulk-actions.test.ts` — FOUND (modified)
- File `apps/web/src/hooks/use-camera-bulk-actions.ts` — FOUND (modified)
- File `apps/web/src/app/admin/cameras/components/bulk-toolbar.tsx` — FOUND (modified)
- File `apps/web/src/app/admin/cameras/components/camera-bulk-actions.tsx` — FOUND (modified)
- File `apps/web/src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx` — FOUND (modified)
- File `apps/web/src/components/pages/tenant-cameras-page.tsx` — FOUND (modified)
- Commit `c7d7a20` — FOUND (test RED)
- Commit `ff41689` — FOUND (feat GREEN — library)
- Commit `262ad0c` — FOUND (feat — wiring + Rule 3 fixes)
