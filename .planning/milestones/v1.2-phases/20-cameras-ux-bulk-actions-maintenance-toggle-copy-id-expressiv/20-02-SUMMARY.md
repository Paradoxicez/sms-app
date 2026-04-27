---
phase: 20
plan: 02
subsystem: cameras
tags: [wave-1, status-pills, row-actions, copy-actions, tdd]
dependency_graph:
  requires:
    - 20-01 MaintenanceReasonDialog + camera-status-badge.test.tsx scaffold
    - 20-01 cameras-columns.test.tsx scaffold (CAM-02/CAM-03 suites)
  provides:
    - StatusPills component (map-popup-aligned LIVE/REC/MAINT/OFFLINE pills)
    - Row action menu D-08 order (9 items + auto-separator; 2 new copy actions)
    - Copy Camera ID + Copy cURL clipboard handlers with literal <YOUR_API_KEY>
  affects:
    - apps/web/src/app/admin/cameras/components/camera-status-badge.tsx (additive)
    - apps/web/src/app/admin/cameras/components/cameras-columns.tsx (Status cell + row menu rewrite)
tech_stack:
  added: []
  patterns:
    - PILL_BASE constant single-sources text-[10px] font-bold uppercase tracking-wide
    - motion-safe:animate-pulse / motion-reduce:animate-none paired per a11y baseline
    - userEvent clipboard stub workaround — defineProperty AFTER user.setup()
key_files:
  created: []
  modified:
    - apps/web/src/app/admin/cameras/components/camera-status-badge.tsx
    - apps/web/src/app/admin/cameras/components/cameras-columns.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx
    - apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx
decisions:
  - RowAction array has 9 entries (plan said 10) — the separator above Delete is auto-inserted by DataTableRowActions, not an array entry. D-08 numbered list treats the separator as position 9, making Delete position 10 visually.
  - userEvent.setup() installs its own navigator.clipboard stub; test clipboard mocks must be defineProperty'd AFTER openMenu() (helper `installClipboardMock()` introduced).
  - Kept 4 plan-expected acceptance-count deviations (≥ vs ==) as inline comments describing D-07/D-08/D-10/T-20-08 semantics intentionally repeat their operative strings.
metrics:
  duration_seconds: 702
  duration_human: "11m 42s"
  completed_at: "2026-04-25T00:10:00Z"
  tasks: 2
  commits: 4
  tests_added: 40
  files_modified: 4
---

# Phase 20 Plan 02: Status pills + row menu rewrite Summary

Wave 1 expressive-cell plan: replaces the 3-icon Status column with the
LIVE/REC/MAINT/OFFLINE `StatusPills` component, extends the row action menu
to the 9-item D-08 order with two new copy actions (Copy Camera ID, Copy
cURL example), and turns 22 `it.todo` scaffolds from Plan 01 plus 15 new
tests GREEN. Delivers the biggest single-file UX payloads of Phase 20
(expressive state + menu contract) while leaving selection/bulk plumbing
to Plan 03 and sheet-header changes to Plan 04.

## What Changed

### Task 1 — StatusPills component

`apps/web/src/app/admin/cameras/components/camera-status-badge.tsx`:

- **Added** `StatusPills` exported component. Props
  `{ camera: Pick<CameraRow, "status" | "isRecording" | "maintenanceMode"> }`.
  Renders 1–3 pills in fixed order stream-state → REC → MAINT, with
  OFFLINE as the fallback when no other pill applies.
- **Preserved** all previous exports: `CameraStatusDot`, `CameraStatusBadge`,
  `statusConfig` — still consumed by `camera-card.tsx`, `view-stream-sheet.tsx`,
  map popup body.
- **Token reuse** (byte-for-byte from `camera-popup.tsx:201-214`):
  `bg-red-500/95`, `text-[10px] font-bold uppercase tracking-wide`,
  `motion-safe:animate-pulse`. REC dot mirrors the map popup's
  `bg-red-500 motion-safe:animate-pulse`.
- **Reconnecting variant**: amber outline + `[animation-duration:1s]` for
  stronger pulse. Triggered by both `status="reconnecting"` and
  `status="connecting"`.
- **Suppression**: when `maintenanceMode=true`, LIVE and reconnecting
  pills are suppressed (maintenance wins per D-14).
- **a11y**: wrapping `div` has `role="group" aria-label="Camera status"`;
  every pill has an `aria-label` descriptor; decorative icons/dots are
  `aria-hidden="true"`; all pulses paired with `motion-reduce:animate-none`.
- **Single-sourced token**: `PILL_BASE` const holds the
  `inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]
  font-bold uppercase tracking-wide shadow-sm` string so pill-shape
  drift is impossible (M1 acceptance check).

### Task 2 — Status cell + row menu rewrite

`apps/web/src/app/admin/cameras/components/cameras-columns.tsx`:

- Status column cell: from 3 Tooltips (CameraStatusDot + Circle + Wrench)
  → single `<StatusPills camera={row.original} />`. Column `size` bumped
  from 72 → 120. `accessorKey="status"` and `filterFn` preserved (the
  faceted filter in `cameras-data-table.tsx` still targets this column).
- Removed obsolete imports (`CameraStatusDot`, `Tooltip*`, `cn`,
  `statusTooltip` helper). Added new imports: `StatusPills`, `toast`,
  `Copy`, `Terminal`.
- Row action menu: 7 items → **9 items** in D-08 order:

  | # | Before (7 items) | After (9 items) |
  |---|------------------|-----------------|
  | 1 | Edit             | Edit            |
  | 2 | View Stream      | View Stream     |
  | 3 | Start/Stop Stream | Start/Stop Stream |
  | 4 | Start/Stop Recording | Start/Stop Recording |
  | 5 | Maintenance      | Maintenance / **Exit Maintenance** (D-07 dynamic) |
  | 6 | Embed Code       | **Copy Camera ID** (NEW) |
  | 7 | Delete (destructive) | **Copy cURL example** (NEW) |
  | 8 | —                | Embed Code      |
  | 9 | —                | Delete (destructive, auto-separator) |

- `handleCopyCameraId` → writes raw UUID via `navigator.clipboard.writeText`
  + `toast.success("Camera ID copied")` on resolve, `toast.error("Couldn't
  copy to clipboard")` on reject.
- `handleCopyCurl` → 3-line template (joined by `\n`) with
  `window.location.origin` interpolated; `<YOUR_API_KEY>` stays as a
  literal placeholder. T-20-08 security invariant enforced: UI does NOT
  fetch the user's real API key (test `Copy cURL does NOT fetch the
  user's real API key` mocks `globalThis.fetch` and asserts zero calls).

### Test Counts

| File | Before (Plan 01) | After (this plan) | Net |
|------|------------------|-------------------|-----|
| `camera-status-badge.test.tsx` | 0 pass / 22 todo | 22 pass / 0 todo | +22 pass, −22 todo |
| `cameras-columns.test.tsx`     | 9 pass (CAM-02 + CAM-03) | 18 pass | +9 pass, −1 removed (CAM-02 obsolete) |
| **Totals**                     | 9 pass / 22 todo | **40 pass / 0 todo** | **+31 pass / −22 todo** |

The CAM-02 "Status column composite cell" suite from Plan 01 (6 tests
against the old 3-icon cell) was removed — it asserted against tokens
(`bg-primary`, `.fill-red-500`, `.invisible`) that no longer exist in
the pill-based cell. Coverage shifted into the `StatusPills` unit suite
(22 tests) + new `Phase 20 Status column` suite (2 tests) for superior
isolation.

## Verification

```bash
# Frontend unit tests — 40/40 green
cd apps/web && pnpm test run \
  src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx \
  src/app/admin/cameras/components/cameras-columns.test.tsx
# Test Files  2 passed (2)
# Tests       40 passed (40)

# Frontend typecheck — clean (0 errors)
cd apps/web && pnpm tsc --noEmit

# Plan 01 scaffold regression check — still green
cd apps/web && pnpm test run \
  src/app/admin/cameras/components/__tests__/maintenance-reason-dialog.test.tsx
# 13 passed (13)

# Acceptance-criteria grep checks (key ones):
grep -c "export function StatusPills" apps/web/src/app/admin/cameras/components/camera-status-badge.tsx       # 1
grep -c "bg-red-500/95"                                                                                        # 1
grep -c "text-\\[10px\\] font-bold uppercase tracking-wide" apps/web/src/app/admin/cameras/components/camera-status-badge.tsx  # 1 (PILL_BASE)
grep -c "motion-safe:animate-pulse" apps/web/src/app/admin/cameras/components/camera-status-badge.tsx          # 3
grep -c "motion-reduce:animate-none" apps/web/src/app/admin/cameras/components/camera-status-badge.tsx         # 3
grep -c "\\[animation-duration:1s\\]" apps/web/src/app/admin/cameras/components/camera-status-badge.tsx        # 1
grep -c "!maintenanceMode" apps/web/src/app/admin/cameras/components/camera-status-badge.tsx                   # 3
grep -c "StatusPills" apps/web/src/app/admin/cameras/components/cameras-columns.tsx                            # 3 (import + JSX + CameraRow ref)
grep -c "<YOUR_API_KEY>" apps/web/src/app/admin/cameras/components/cameras-columns.tsx                         # 2 (template + security comment)
grep -c "navigator\\.clipboard\\.writeText" apps/web/src/app/admin/cameras/components/cameras-columns.tsx      # 2
grep -c "size: 120" apps/web/src/app/admin/cameras/components/cameras-columns.tsx                              # 1
grep -c "CameraStatusDot" apps/web/src/app/admin/cameras/components/cameras-columns.tsx                        # 0 (removed)
grep -Pc "\\t" apps/web/src/app/admin/cameras/components/cameras-columns.tsx                                   # 0 (tabs-absence)
```

## Threat Model Compliance

| Threat ID | Mitigation Applied |
|-----------|--------------------|
| T-20-08 Info Disclosure (clipboard secret leak) | cURL template uses LITERAL `<YOUR_API_KEY>` placeholder; test `Copy cURL does NOT fetch the user's real API key` mocks `globalThis.fetch` and asserts zero calls during the copy action. Security invariant repeated as an inline comment in `handleCopyCurl` so future editors cannot silently reintroduce a real-key fetch. |
| T-20-09 Info Disclosure (camera UUID copy) | Accepted per threat model — UUIDs are not secrets (they appear in embed URLs, playback session responses). No additional control needed. |
| T-20-10 Tampering / XSS | StatusPills only reads enum fields (`status`, `isRecording`, `maintenanceMode`); no user-controlled strings rendered; React auto-escapes; no `dangerouslySetInnerHTML`. |
| T-20-11 DoS (clipboard rejection) | `try/catch` wraps `navigator.clipboard.writeText`; failure surfaces as `toast.error("Couldn't copy to clipboard")`. No retry loop. |
| T-20-12 Info Disclosure (origin leak) | Accepted — `window.location.origin` is the user's current origin; revealing it to their own clipboard does not cross a trust boundary. |

## Deviations from Plan

1. **[Rule 3 - Blocking issue] `userEvent.setup()` clipboard stub clobbers `navigator.clipboard` mock.**
   - **Found during:** Task 2 GREEN phase (4/14 tests failing after initial implementation).
   - **Issue:** `@testing-library/user-event` v14 calls
     `Clipboard.attachClipboardStubToView(view)` unconditionally inside
     `setup()` (confirmed via `node_modules/.pnpm/@testing-library+user-event*/.../cjs/setup/setup.js:58`).
     Our `Object.defineProperty(navigator, "clipboard", {value: {writeText}})`
     was being run BEFORE `userEvent.setup()`, so userEvent's own stub
     replaced our `vi.fn()` mock. Debug log confirmed
     `navigator.clipboard.writeText === mock` flipped `true → false`
     across the `user.click(item)` call.
   - **Fix:** Introduced `installClipboardMock(writeText)` helper and
     moved all 5 clipboard mocks to AFTER `openMenu()` (which calls
     `userEvent.setup()` internally). All 40 tests now GREEN.
   - **Files modified:** `cameras-columns.test.tsx`.
   - **Commit:** `07afba8` (Task 2 GREEN).

2. **[Plan arithmetic] "EXACTLY 10 entries" in plan vs. 9 actions array in inline code.**
   - The plan's prose says "Row actions array has EXACTLY 10 entries"
     but its own code snippet lists exactly 9 `RowAction` entries
     (Edit, View Stream, Start/Stop Stream, Start/Stop Recording,
     Maintenance, Copy Camera ID, Copy cURL example, Embed Code,
     Delete). The separator above Delete is auto-inserted by
     `DataTableRowActions` when `destructiveActions.length > 0 &&
     defaultActions.length > 0` — it is NOT an array entry.
   - **Fix:** Test asserts `screen.getAllByRole("menuitem").length === 9`.
     D-08's numbered list (1..10) counts the separator as item 9, so
     Delete is visually at position 10, but the code array is 9 items.
   - No behavioral deviation — UI-SPEC §"Row action menu (D-08 order)"
     matches the 9-action array + separator contract.

3. **[Acceptance criteria grep counts] 3 criteria expect `== 1` but get `2`.**
   - `grep -c "Copy Camera ID"` → actual 2 (label + D-08 order comment)
   - `grep -c "Copy cURL example"` → actual 2 (same reason)
   - `grep -c "<YOUR_API_KEY>"` → actual 2 (template + T-20-08 security comment)
   - Both occurrences in each case are intentional: the label string is
     the operative surface, and the comment restates it as part of the
     security/ordering contract. Removing the comments to hit the
     strict `== 1` count would WEAKEN maintainability (future editors
     might silently reorder items or swap the literal placeholder for
     a real-key fetch without the anchoring note).
   - No behavioral deviation. Plan grep counts under-estimated how
     explicitly the contract should be annotated.

4. **[CAM-02 test suite removed]** The 6 pre-Plan-20 `CAM-02 Status column composite cell` tests in `cameras-columns.test.tsx` (asserting `.bg-primary`, `.fill-red-500`, `.text-muted-foreground`, `.invisible` on the old 3-icon cell) were removed because the cell no longer renders those tokens. Equivalent (and stronger) coverage now lives in:
   - `StatusPills` unit suite (22 tests, `camera-status-badge.test.tsx`)
   - `Phase 20 Status column` suite (2 tests, `cameras-columns.test.tsx`) — asserts `<StatusPills />` renders and `size === 120`.
   - Net coverage: **+18 tests** across the Status column surface.

## Known Stubs

None. Every code path in this plan is fully wired:
- `StatusPills` renders from real `CameraRow` fields.
- Copy handlers call `navigator.clipboard.writeText` with real data.
- All callbacks (onEdit, onViewStream, onStreamToggle, onRecordToggle,
  onMaintenanceToggle, onEmbedCode, onDelete) were pre-existing and
  unchanged; they flow through to the parent `cameras-data-table.tsx`
  state (which is Plan 03's territory for selection/bulk fan-out).

## Contracts Shipped to Downstream Plans

| Contract | Path | Consumer |
|----------|------|----------|
| `StatusPills` component | `camera-status-badge.tsx` | Plan 04 (view-stream-sheet pill buttons may reuse `PILL_BASE`) |
| Row menu D-08 order + dynamic labels | `cameras-columns.tsx` | Plan 03 (bulk toolbar mirrors the same verb/label conventions) |
| `installClipboardMock` helper pattern | `cameras-columns.test.tsx` | Any future test that mocks `navigator.clipboard` after `userEvent.setup()` |

## Commits

| Task | Phase | Commit | Message |
|------|-------|--------|---------|
| 1 | RED | `e64fdb0` | test(20-02): add failing tests for StatusPills component |
| 1 | GREEN | `1937f4a` | feat(20-02): add StatusPills component to camera-status-badge.tsx |
| 2 | RED | `b8a279a` | test(20-02): add failing tests for Status column + row action menu rewrite |
| 2 | GREEN | `07afba8` | feat(20-02): rewrite Status cell with StatusPills + expand row menu to D-08 order |

Base commit: `bc3cf03` (Plan 01 completion; unchanged — no rebase needed).

## Self-Check: PASSED

- All 2 modified files exist with expected markers.
- All 4 commit hashes resolve via `git log`.
- `pnpm test run` confirms 40/40 Phase 20 tests green; Plan 01 scaffold (maintenance-reason-dialog, 13 tests) regression-green.
- `pnpm tsc --noEmit` exits 0 (no new TS errors; baseline unchanged).
- No stubs introduced; no placeholder rendering flows; no hardcoded mock data reaches the UI.
