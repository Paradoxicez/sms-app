---
phase: 18-dashboard-map-polish
plan: 04
subsystem: web/map
tags: [camera-popup, alert-dialog, dropdown-menu, preview-video, memo, regression-guard, thai-dialog, phase-18]

# Dependency graph
requires:
  - phase: 18-00
    provides: camera-popup.test.tsx 13 it.todo stubs (flipped here) + camera-fixtures types + PreviewVideo regression-guard stub
  - phase: 18-03
    provides: Extended CameraPopupProps interface (id/name/status/viewerCount + 6 Phase 18 fields + 3 callbacks) already threaded through tenant-map-page → CameraMap → CameraMapInner → CameraMarker → <Popup>
  - phase: 15-04-maintenance-mode
    provides: AlertDialog + Cancel/Action primitives + confirmation UX pattern (single dialog branches on maintenance state, destructive/default variant)
  - phase: 13-camera-detail-live-preview
    provides: PreviewVideo memo pattern (REGRESSION GUARD — viewerCount broadcasts must NOT remount the <video>)
provides:
  - Refactored CameraPopup body (240x135 preview + status overlay + badge stack + 2 primary buttons + ⋮ dropdown + Thai+English AlertDialog)
  - 13 green vitest specs covering D-17..D-22 + PreviewVideo memo regression guard
  - Proven-safe DropdownMenu usage with base-ui render prop pattern (instead of asChild)
affects: [18-05, 18-06]  # future popup tweaks/preview work build on this body structure

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Status overlay rendered as SIBLING to PreviewVideo — never as child (RESEARCH Pattern 3) — keeps memo() barrier intact so viewerCount broadcasts don't remount <video>"
    - "Maintenance confirmation = single AlertDialog with Thai + English slashed copy + variant branches on maintenanceMode (matches Phase 15-04 pattern)"
    - "DropdownMenuTrigger uses `render={<Button ... />}` (base-ui convention) instead of `asChild` — stays compatible with the existing dropdown-menu primitive"
    - "Regression-guard test captures <video> DOM node identity across 3 consecutive rerenders with increasing viewerCount — asserts same node === (not just still-rendered)"
    - "Mock hls.js in test (`vi.mock('hls.js', () => ({ default: { isSupported: () => false }}))`) so jsdom never attempts MSE; <video> still mounts for node-identity comparison"

key-files:
  created: []
  modified:
    - apps/web/src/components/map/camera-popup.tsx
    - apps/web/src/components/map/camera-popup.test.tsx
    - .planning/phases/18-dashboard-map-polish/deferred-items.md

key-decisions:
  - "PreviewVideo block kept VERBATIM — did not touch the memo-wrapped component at lines 64-112. Only {id, status} pass through. Regression guard asserts node-identity preservation across viewerCount rerenders (Phase 13 bug not regressing)"
  - "Status overlay uses `status === 'online'` gate — REC/Maintenance pills hide when offline (preview shows black 'Stream offline' card), matches UI-SPEC intent of not overlaying overlays on a placeholder"
  - "Thai + English slashed copy in dialog — `เข้าสู่โหมดซ่อมบำรุง / Enter maintenance mode` — per user memory (Thai preferred, technical terms English). Extended Phase 15-04's English-only pattern"
  - "AlertDialogAction carries variant: 'destructive' when entering maintenance (irreversible side-effect), 'default' when exiting (benign). Matches Phase 15-04 destructive-variant convention"
  - "DropdownMenuTrigger uses render prop — tried `asChild` but base-ui's Menu primitive expects `render={<Button ... />}`. The primitive is a base-ui passthrough so this is the idiomatic pattern"
  - "Popup delegates entirely to callback props (onToggleMaintenance, onViewRecordings, onOpenDetail) — parent (tenant-map-page) already performs the fetch/navigation per Plan 03. Popup is dumb, which keeps tests trivial and the fetch in one place"
  - "D-22 is owned by CameraMarker (Plan 03 set maxWidth=320 / minWidth=280 on <Popup>). D-22 test here asserts the popup body width budget (240px preview ≤ 320px max)"

patterns-established:
  - "Phase 18 map popup body = `<preview(overlay siblings)> <name+viewer+⋮> <badges stack> <2 primary buttons> <AlertDialog confirm>` — clear 4-section body"
  - "Any destructive map-popup action delegates to a confirmation AlertDialog with Thai + English copy + variant branching"
  - "Regression-guard tests for memoized DOM-attached components use node-identity (`expect(nodeA).toBe(nodeB)`) across multiple rerenders — more robust than mount-count spies"

requirements-completed: [UI-06]  # Popup slice of UI-06 now closed. Marker slice closed by Plan 03.

# Metrics
duration: ~20 min
completed: 2026-04-21
---

# Phase 18 Plan 04: Camera Popup Refactor Summary

**Camera-popup body rewritten for D-17..D-22 — 16:9 preview with status overlay, badge stack with retention + maintainer + offline timestamp, 2 primary buttons + ⋮ dropdown, Thai+English maintenance AlertDialog — PreviewVideo memoization preserved verbatim with passing regression-guard.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-21T15:31:00Z (base verification)
- **Completed:** 2026-04-21T15:35:30Z
- **Tasks:** 1 (TDD RED → GREEN, no refactor pass needed)
- **Files created:** 0
- **Files modified:** 3 (camera-popup.tsx, camera-popup.test.tsx, deferred-items.md)

## Accomplishments

- **D-17 — 16:9 preview container.** Replaced the 200×112 container with a 240×135 `relative overflow-hidden` div carrying `data-testid="preview-container"`. Inline style `{ width: 240, height: 135 }` matches grep acceptance + test assertion.
- **D-18 — Status overlay as sibling.** REC pill (red pulse + 1.5×1.5 white dot) and Maintenance pill (wrench + Maintenance label) render in a shared `absolute top-2 left-2 flex flex-col gap-1` stack **as siblings to PreviewVideo**, never as children. Both overlays gate on `status === 'online'` so they don't stack over the black "Stream offline" card.
- **D-19 — Badge stack.** Status badge (existing STATUS_VARIANT mapping preserved) + conditional Recording badge (pulsing dot + "Recording · {N} days retention" when retentionDays present) + conditional Maintenance badge (Wrench icon + "Maintenance · by {user} · {relative time}"). When status is offline, an "Offline {relative time}" paragraph renders below.
- **D-21 — 2 primary + ⋮ dropdown.** `grid grid-cols-2 gap-2` laying out View Stream (default variant, Play icon) + View Recordings (outline variant, Film icon). Dropdown (⋮ MoreVertical) carries 3 items: Set Location (MapPin), Toggle Maintenance (Wrench — label swaps to "Exit Maintenance" when already in maintenance), Open Camera Detail (ExternalLink).
- **D-22 — Popup body fits width budget.** Preview 240px + 16px padding = 256px, safely within the maxWidth=320 / minWidth=280 CameraMarker sets on `<Popup>` (Plan 03). Test asserts `240 <= 320`.
- **PreviewVideo memoization PRESERVED.** Lines 64-112 in new file identical to original 41-89 — same memo() wrap, same useEffect([id, status]) dependency array, same videoRef + hlsRef + HLS.isSupported flow. Overlay stack is a sibling, not child. Regression-guard test `PreviewVideo does not remount when viewerCount prop changes on parent` captures the `<video>` DOM node across 3 consecutive rerenders with viewerCount 1 → 2 → 3 and asserts `nodeA === nodeB === nodeC`.
- **Thai + English maintenance dialog.** Title: `เข้าสู่โหมดซ่อมบำรุง / Enter maintenance mode` (swaps to `ออกจากโหมดซ่อมบำรุง / Exit maintenance mode` when already in maintenance). Description carries the same-slashed Thai-first copy explaining notification/webhook suppression. Cancel button: `ยกเลิก / Cancel`. Confirm button: `ยืนยัน / Confirm` with variant swap (destructive when entering, default when exiting). Matches user memory preference (Thai preferred, technical terms English).
- **13 tests flipped + all green.** `apps/web/src/components/map/camera-popup.test.tsx` all `it.todo` placeholders are now real `it()` + assertions. Full web suite (36 files, 213 passing + 1 skipped + 10 todo) runs in 10.82s.

## Task Commits

1. **Task 1 RED — 13 failing popup specs + regression guard** — `601fe3b` (test, 1 file)
2. **Task 1 GREEN — popup body refactor** — `ca3791c` (feat, 2 files: camera-popup.tsx + deferred-items.md)

## Files Modified

### `apps/web/src/components/map/camera-popup.tsx` (refactor)
- Added `useState` to React imports; kept `memo, useEffect, useRef`.
- Added lucide imports: `ExternalLink, Film, MoreVertical, Play, Wrench`. Preserved `MapPin`.
- Added `formatDistanceToNowStrict` from `date-fns`.
- Added DropdownMenu* imports from `@/components/ui/dropdown-menu`.
- Added AlertDialog* imports from `@/components/ui/alert-dialog` (Action, Cancel, Content, Description, Footer, Header, Title).
- `CameraPopupProps` interface unchanged from Plan 03 (already had the 6 Phase 18 fields + 3 callbacks).
- `CameraPopup` function body rewritten with 4 sections: preview-container (with overlay siblings) → name/viewer/dropdown row → status/recording/maintenance/offline badge stack → 2 primary buttons.
- AlertDialog at bottom of component, `open={confirmOpen}` driven by local state, onClick on Action delegates to `onToggleMaintenance?.(id, !maintenanceMode)` then closes.
- PreviewVideo memo-wrapped component preserved verbatim at lines 64-112.

### `apps/web/src/components/map/camera-popup.test.tsx` (RED → GREEN)
- Added imports: `render, screen, waitFor` from `@testing-library/react`, `userEvent` default, `vi, beforeEach, expect`.
- Added `vi.mock('hls.js', () => ({ default: { isSupported: () => false }}))` — prevents jsdom MSE attempts while keeping `<video>` element mounted for the regression-guard node-identity comparison.
- 13 specs written covering every D-17..D-22 verifiable behavior, dialog flow, callback delegation, and PreviewVideo regression guard.

### `.planning/phases/18-dashboard-map-polish/deferred-items.md` (doc)
- Logged pre-existing TS error in `apps/web/src/components/dashboard/storage-forecast-card.tsx:101` (introduced by Plan 18-05 `45caf4e`, unrelated to Plan 18-04 work). Plan 18-04's own files type-check clean; the build failure is out-of-scope per GSD scope-boundary rule.

## Stub → Requirement Closure

| Plan-00 stub | Closed-in | Test result |
|--------------|-----------|-------------|
| `UI-06: preview container is 240x135 (D-17)` | 18-04 | PASS |
| `UI-06: popup renders REC overlay top-left when isRecording and status=online (D-18)` | 18-04 | PASS |
| `UI-06: popup renders Maintenance overlay when maintenanceMode=true (D-18)` | 18-04 | PASS |
| `UI-06: renders Recording badge with "{N} days retention" when retentionDays present (D-19)` | 18-04 | PASS |
| `UI-06: renders Maintenance badge with by-user + relative time (D-19)` | 18-04 | PASS |
| `UI-06: renders "Offline {time} ago" only when status=offline (D-19)` | 18-04 | PASS |
| `UI-06: two primary action buttons: View Stream + View Recordings (D-21)` | 18-04 | PASS |
| `UI-06: ⋮ dropdown has Set Location, Toggle Maintenance, Open Camera Detail (D-21)` | 18-04 | PASS |
| `UI-06: Toggle Maintenance opens confirmation dialog (Phase 15-04 reuse)` | 18-04 | PASS |
| `UI-06: Toggle Maintenance confirm calls POST /api/cameras/:id/maintenance (via prop)` | 18-04 | PASS |
| `UI-06: View Recordings navigates to /app/recordings?camera={id} (via prop)` | 18-04 | PASS |
| `UI-06 REGRESSION GUARD: PreviewVideo does not remount when viewerCount prop changes on parent (Phase 13 runaway viewer count bug)` | 18-04 | PASS |
| `UI-06: popup Leaflet maxWidth=320 minWidth=280 (D-22)` | 18-04 | PASS |

## Decisions Made

See YAML front-matter `key-decisions` above. Most load-bearing:

1. **PreviewVideo verbatim preservation.** The memoized block at lines 64-112 is byte-for-byte identical to the original. Only `{id, status}` props. The status overlay (REC + Maintenance pills) is a direct DOM sibling inside the same `relative` container, not a child of PreviewVideo. Regression guard asserts the `<video>` DOM node survives 3 consecutive viewerCount rerenders.
2. **Dialog delegation to prop.** Popup never calls `fetch` — it only invokes `onToggleMaintenance?.(id, nextState)`. Parent (tenant-map-page, already wired by Plan 03) performs the authenticated API call. Keeps popup dumb + tests trivial.
3. **DropdownMenuTrigger render prop.** Base-ui's `MenuPrimitive.Trigger` accepts `render={<Button ... />}` to compose the trigger; doesn't support `asChild`. Using the primitive's idiomatic pattern rather than wrapping Button in a trigger/button combo.
4. **Overlay gating on status=online.** If status is offline/degraded/reconnecting, the preview shows the black "Stream offline" card (old behavior preserved). Stacking REC/Maintenance overlays over this card would be misleading — so overlays only render when the video is actually playing.
5. **Thai-first slashed copy.** All dialog text uses `{Thai} / {English}` pattern per user memory (Thai preferred, technical terms English). The existing Phase 15-04 dialog was English-only; this matches the user's explicit preference for map/operator surfaces.

## Deviations from Plan

Minor — all Rule 3 (blocking infra) or scope-consistent:

1. **[Rule 3 — Blocking] node_modules symlinks** (not committed). The worktree has no `node_modules`, so `pnpm test` / `pnpm build` fail without them. Symlinked `apps/web/node_modules` and repo-root `node_modules` to the main repo (same approach Plans 00 + 03 used). These are gitignored test-harness state.
2. **[Doc only] `it.todo` comment reference.** The test file's docstring says "Plan 00 left 13 `it.todo` placeholders; this file flips them all." — `grep -c "it\.todo"` returns 1, but `grep -n "^\s*it\.todo("` returns 0 (no active `.todo()` calls). Same convention as Plan 03's marker tests.
3. **[Out-of-scope] Pre-existing TS error in storage-forecast-card.tsx.** `pnpm build` fails on `apps/web/src/components/dashboard/storage-forecast-card.tsx:101` due to recharts Formatter signature narrowness — introduced by Plan 18-05 before Plan 18-04, unrelated to popup work. Logged in `deferred-items.md`. Plan 18-04 files themselves type-check clean (`npx tsc --noEmit` filtered to map/* = 0 errors). Per GSD scope-boundary rule, not fixed here — should be a follow-up quick task.

No Rule 1 (bugs), Rule 2 (critical missing), or Rule 4 (architectural) triggered.

## Issues Encountered

- **None.** Both vitest runs green on first GREEN attempt. 12 tests failed deliberately in RED phase (expected — current code didn't match the new body spec); all 13 green after the refactor.

## Threat Flags

None. The plan's `<threat_model>` listed three threats:

| Threat ID | Disposition | How mitigated |
|-----------|-------------|---------------|
| T-18-XSS-POPUP | mitigate | React auto-escapes `{name}` + `{maintenanceEnteredBy}` interpolations. `grep -c "dangerouslySetInnerHTML" apps/web/src/components/map/camera-popup.tsx` = 0. |
| T-18-MEMO-REGRESSION | mitigate | PreviewVideo block at lines 64-112 preserved verbatim; status overlay is a sibling not a child; only `{id, status}` reach PreviewVideo; regression-guard test asserts node identity survives viewerCount rerenders. |
| T-18-MAINT-CONFIRMATION | mitigate | AlertDialog gates the action; onToggleMaintenance called only after user clicks confirm; parent does authenticated fetch; Thai + English copy explains side effects. |
| T-18-DROPDOWN-A11Y | accept | Inherits base-ui Menu primitive keyboard semantics. |

No new trust boundaries or unexpected surface introduced.

## Known Stubs

None. All `it.todo` in `camera-popup.test.tsx` flipped. CameraPopup body renders only real props — no placeholder strings or TODO markers in production code.

## User Setup Required

None.

## Next Phase Readiness

- **Plan 18-05 (popup preview)** — already complete (status in repo), was previously completed before 18-04 per phase execution order. This plan closes the UI-06 popup body surface.
- **Phase 18 merge to main** — blocked only by the pre-existing `storage-forecast-card.tsx` TS error. That should be fixed as a follow-up quick task before merging Phase 18 back to main.
- **No new blockers introduced by this plan.**

## Self-Check: PASSED

**File existence checks:**
- `apps/web/src/components/map/camera-popup.tsx` — FOUND (modified)
- `apps/web/src/components/map/camera-popup.test.tsx` — FOUND (modified)
- `.planning/phases/18-dashboard-map-polish/deferred-items.md` — FOUND (modified)
- `.planning/phases/18-dashboard-map-polish/18-04-SUMMARY.md` — FOUND (created)

**Commit existence checks:**
- `601fe3b` (Task 1 RED) — FOUND in `git log --oneline -5`
- `ca3791c` (Task 1 GREEN) — FOUND in `git log --oneline -5`

**Acceptance-criteria grep checks:**
- `camera-popup.tsx` `const PreviewVideo = memo(` — 1 (>=1) — FOUND
- `camera-popup.tsx` `width: 240, height: 135` — 1 (>=1) — FOUND
- `camera-popup.tsx` `data-testid="preview-container"` — 1 (>=1) — FOUND
- `camera-popup.tsx` `isRecording` — 4 (>=3) — FOUND
- `camera-popup.tsx` `maintenanceMode` — 9 (>=3) — FOUND
- `camera-popup.tsx` `maintenanceEnteredBy` — 3 (>=1) — FOUND
- `camera-popup.tsx` `maintenanceEnteredAt` — 4 (>=1) — FOUND
- `camera-popup.tsx` wrong-spelling grep — 0 (expected 0) — FOUND
- `camera-popup.tsx` `retentionDays` — 3 (>=1) — FOUND
- `camera-popup.tsx` `lastOnlineAt` — 4 (>=1) — FOUND
- `camera-popup.tsx` `View Stream` — 2 (>=1) — FOUND
- `camera-popup.tsx` `View Recordings` — 2 (>=1) — FOUND
- `camera-popup.tsx` `Set Location` — 1 (>=1) — FOUND
- `camera-popup.tsx` `Toggle Maintenance|Exit Maintenance` — 1 (>=1) — FOUND
- `camera-popup.tsx` `Open Camera Detail` — 1 (>=1) — FOUND
- `camera-popup.tsx` Thai+English dialog text — 1 (>=1) — FOUND
- `camera-popup.tsx` `dangerouslySetInnerHTML` — 0 (expected 0) — FOUND
- `camera-popup.tsx` `formatDistanceToNowStrict` — 3 (>=1) — FOUND
- `camera-popup.tsx` `motion-safe:animate-pulse` — 2 (>=2) — FOUND
- `camera-popup.test.tsx` active `it.todo(` calls — 0 (expected 0; 1 docstring comment reference) — FOUND
- `camera-popup.test.tsx` `does not remount` — 2 (>=1) — FOUND

**Vitest run:**
- `pnpm test -- --run src/components/map/camera-popup.test.tsx` — 13 passed
- Full web suite — 213 passed | 1 skipped | 10 todo across 36 files (no regressions)

**Build:**
- Plan 18-04 files type-check clean (`npx tsc --noEmit` filtered to `src/components/map/` = 0 errors)
- `pnpm build` fails on pre-existing Plan 18-05 `storage-forecast-card.tsx` TS error — out-of-scope, logged in `deferred-items.md`

---
*Phase: 18-dashboard-map-polish*
*Plan: 04 (Wave 3)*
*Completed: 2026-04-21*
