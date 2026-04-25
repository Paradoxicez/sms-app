---
phase: quick-260425-vrl
plan: 01
subsystem: web/admin/cameras
tags: [ui, design-system, refactor, tdd]
requires: []
provides:
  - CameraStatusPill (status-only LIVE/OFFLINE pill primitive used by the camera card-view overlay)
  - PILL_LIVE_RED / PILL_LIVE_AMBER / PILL_OFFLINE module-scope className constants shared by StatusPills (table) and CameraStatusPill (card)
affects:
  - apps/web/src/app/admin/cameras/components/camera-card.tsx (overlay swap)
  - apps/web/src/app/admin/cameras/components/camera-status-badge.tsx (StatusPills internals refactored to read from shared constants — pixel-identical output)
tech-stack:
  added: []
  patterns:
    - module-scope className constants as a single source of truth for two consumers (table/card)
key-files:
  created: []
  modified:
    - apps/web/src/app/admin/cameras/components/camera-status-badge.tsx
    - apps/web/src/app/admin/cameras/components/camera-card.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx
decisions:
  - Lift LIVE/OFFLINE className strings to module scope (PILL_LIVE_RED, PILL_LIVE_AMBER, PILL_OFFLINE) so both StatusPills and CameraStatusPill render through the same constants — a single edit updates both views.
  - Keep CameraStatusBadge and CameraStatusDot exports intact for backward-compat with view-stream-sheet.tsx (info panel) and the camera-card info-area dot (intentionally distinct from the new overlay pill).
  - StatusPills "Reconnecting" branch keeps aria-label="Reconnecting" (nuanced screen-reader announcement); the card-view CameraStatusPill amber branch uses aria-label="Live" to match the visible "LIVE" text the user sees on the card overlay. Pixel/className parity is preserved through the shared PILL_LIVE_AMBER constant.
metrics:
  duration: ~6 min
  completed: 2026-04-25
---

# Quick Task 260425-vrl: Sync camera card-view status badge with table StatusPills — Summary

One-liner: Card-view overlay now renders the same red/amber/gray LIVE/OFFLINE pill as the Cameras-table Status column, sharing module-scope className constants so a future visual tweak updates both views in one edit.

## Files Modified

| File | Change |
|------|--------|
| `apps/web/src/app/admin/cameras/components/camera-status-badge.tsx` | Lifted PILL_LIVE_RED / PILL_LIVE_AMBER / PILL_OFFLINE to module scope. Refactored StatusPills LIVE / reconnecting / offline branches to read from those constants (pixel-identical output). Added new `CameraStatusPill` (status-only) export rendering through the same constants. CameraStatusBadge and CameraStatusDot exports preserved unchanged. |
| `apps/web/src/app/admin/cameras/components/camera-card.tsx` | Dropped `CameraStatusBadge` import; added `CameraStatusPill` import. Replaced overlay JSX `<CameraStatusBadge status={camera.status} />` with `<CameraStatusPill status={camera.status} />`. Info-area `CameraStatusDot` left untouched. |
| `apps/web/src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx` | Added 6 new tests under `describe('CameraStatusPill (card-view variant)')`: online → red LIVE, reconnecting → amber LIVE, connecting → amber LIVE, offline → gray OFFLINE, degraded → gray OFFLINE, plus a table-vs-card className equality assertion that locks the shared-primitive contract. Existing 22 StatusPills tests untouched. |

## Shared-Primitive Refactor

Three new module-scope `const`s in `camera-status-badge.tsx`:

```ts
const PILL_LIVE_RED = cn(PILL_BASE, 'bg-red-500/95 text-white motion-safe:animate-pulse motion-reduce:animate-none');
const PILL_LIVE_AMBER = cn(PILL_BASE, 'border border-amber-500 bg-transparent text-amber-700 dark:text-amber-400', 'motion-safe:animate-pulse motion-reduce:animate-none [animation-duration:1s]');
const PILL_OFFLINE = cn(PILL_BASE, 'border border-border bg-muted text-muted-foreground');
```

Both `StatusPills` (table) and `CameraStatusPill` (card) read from these constants. Test 6 (`table StatusPills LIVE and card CameraStatusPill LIVE share the same className`) renders both components, queries each LIVE element by `aria-label="Live"`, and asserts `cardLive.className === tableLive.className` — if a future PR diverges the classes, this test fails immediately.

## Test Counts

| Phase | Total | Passed | Failed |
|-------|-------|--------|--------|
| Before (RED) | 28 | 22 | 6 (CameraStatusPill not yet exported) |
| After (GREEN) | 28 | 28 | 0 |

`pnpm vitest run src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx` → 28/28 pass.
`npx tsc --noEmit` (apps/web) → no errors.

## Out-of-Scope / Intentionally Untouched

- `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx` — still imports and renders `CameraStatusBadge` for the info panel. Confirmed by `grep` (lines 26, 280). The badge there is in a text-heavy info area where the dot+label treatment fits better than a thumbnail-overlay pill.
- The small `<CameraStatusDot>` next to the camera name in the card info area — intentionally kept distinct from the new overlay pill (the task brief constrained the change to the overlay only).
- Snapshot thumbnails, `HoverPreviewPlayer` logic, the table view itself, `cameras-columns.tsx` cell renderer.

## Deviations from Plan

None — plan executed exactly as written. Two minor environment notes (not deviations from the implementation plan):

1. **Worktree node_modules bootstrapping (Rule 3 — blocking issue):** The git worktree was created without `node_modules`. Symlinked `node_modules` and `apps/web/node_modules` to the main-repo equivalents so vitest could resolve `@testing-library/jest-dom/vitest` and `react-dom`. Symlinks are gitignored (untracked) and not part of any commit.
2. **Lint script behavior:** `pnpm lint` at the repo root is a no-op (`echo 'lint not configured yet'`); no project-level ESLint config is wired up. Plan verify command ran successfully but produced no findings. Used `npx tsc --noEmit` for typecheck (clean).

## Verification Snapshot

```
$ grep -n "CameraStatusBadge" apps/web/src/app/admin/cameras/components/camera-card.tsx       → 0 hits  (correct: removed)
$ grep -n "CameraStatusPill"  apps/web/src/app/admin/cameras/components/camera-card.tsx       → 2 hits  (import + usage)
$ grep -n "PILL_LIVE_RED"     apps/web/src/app/admin/cameras/components/camera-status-badge.tsx → 3 hits (decl + StatusPills + CameraStatusPill)
$ grep -n "CameraStatusBadge" apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx → 2 hits  (preserved out-of-scope)
```

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `9f5ef9a` | feat(quick-260425-vrl): add CameraStatusPill primitive shared with StatusPills |
| 2 | `c5187a7` | feat(quick-260425-vrl): swap camera-card overlay to CameraStatusPill |

## Self-Check: PASSED

- `apps/web/src/app/admin/cameras/components/camera-status-badge.tsx` exists and exports `CameraStatusPill` — verified.
- `apps/web/src/app/admin/cameras/components/camera-card.tsx` exists and references `<CameraStatusPill` — verified.
- `apps/web/src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx` contains `describe('CameraStatusPill (card-view variant)'` block — verified.
- Commits `9f5ef9a` and `c5187a7` both reachable in `git log` — verified.
