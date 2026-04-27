---
phase: 22-camera-metadata-utilization-surface-tags-description-across-
plan: 09
subsystem: web/cameras
tags: [view-stream-sheet, notes, description, d-16, ui-surface]
requirements: [D-16]
dependency-graph:
  requires: [22-01]
  provides: ["camera.description visible in view-stream-sheet"]
  affects: ["apps/web view stream UX"]
tech-stack:
  added: []
  patterns: ["conditional-render guard with .trim().length > 0", "whitespace-pre-line for user newlines (XSS-safe via React auto-escape)"]
key-files:
  created: []
  modified:
    - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/view-stream-sheet.test.tsx
decisions: ["D-16: camera.description surfaced in view-stream-sheet as a read-only Notes section between SheetHeader and Tabs; edit affordance stays in camera-form."]
metrics:
  duration: ~10m
  completed: 2026-04-26
---

# Phase 22 Plan 09: view-stream-sheet Notes section Summary

Adds a read-only "Notes" section to the camera View Stream sheet so the per-camera `description` is finally surfaced where users naturally look for camera context — between the SheetHeader and the Tabs. Until now, description was only edited via the form and never displayed back to the user; D-16 closes that gap without introducing a second edit affordance (edit stays in camera-form).

## What Shipped

- New `<section>` block inside `ViewStreamContent` (apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx:151-176), positioned **after** the SheetHeader and **before** the Tabs.
- Conditional render guard: `camera.description && camera.description.trim().length > 0`. Empty strings, `null`, and whitespace-only values are all suppressed so we never leak an empty header.
- Heading typography per UI-SPEC §"view-stream-sheet — Notes section": `h3` with `text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2`. Body uses `text-sm whitespace-pre-line` so user-entered newlines render visually without `dangerouslySetInnerHTML`.
- Section spacing: `mb-6` (24px lg-spacing per UI-SPEC §Spacing line 49) separates Notes from the Tabs row. Plus `px-4 pt-4` to match the SheetHeader's horizontal/top rhythm.
- A11y wiring: `<section aria-labelledby="camera-notes-heading">` paired with `<h3 id="camera-notes-heading">` so screen readers announce the section name.

## Test Coverage

8 new test cases under `describe('Phase 22: Notes section (D-16)')` in `view-stream-sheet.test.tsx`:

| # | Case | Asserts |
|---|------|---------|
| 1 | Renders heading + body when description non-empty | `getByRole('heading', { name: 'Notes' })` present; body contains `'First line'` AND `'Second line'`; body className contains `whitespace-pre-line` |
| 2 | Hidden when description is empty string | heading absent |
| 3 | Hidden when description is `null` | heading absent |
| 4 | Hidden when description is whitespace-only | heading absent (extra-defensive — covers the `.trim()` branch) |
| 5 | Notes appears BEFORE Tabs in document order | `compareDocumentPosition` between heading and tablist |
| 6 | No edit button inside Notes block | walks `closest('section')`, queries `<button>`s, asserts 0 match for `/edit/i` |
| 7 | Heading typography matches UI-SPEC | className contains all 5 expected utility classes |
| 8 | Section uses `mb-6` (24px lg-spacing) | section className contains `mb-6` |

All 31 tests in `view-stream-sheet.test.tsx` pass (23 prior Phase 20 + 8 new Phase 22). The companion file `view-stream-sheet-push.spec.tsx` continues to pass all 6 cases — no regression.

## Decisions Made

- **D-16 implementation locus** — Notes block lives in `view-stream-sheet.tsx` between SheetHeader and Tabs, not inside the Preview tab. Rationale: the description is camera-level metadata, not tab-scoped content; placing it above the Tabs guarantees visibility regardless of which tab the user has selected.
- **Trim-based emptiness check** — guard uses `description.trim().length > 0` rather than `description.length > 0`. A description of `"  \n  "` (whitespace only) would otherwise render an empty paragraph; trimming the test value matches user intent ("no notes").
- **No `dangerouslySetInnerHTML`** — newline preservation goes through CSS (`whitespace-pre-line`) so React's text-content auto-escape still applies. Mitigates T-22-11 (XSS via description) without giving up the multi-line rendering.

## Deviations from Plan

None — plan executed exactly as written.

The `<action>` block in 22-09-PLAN.md prescribed a section with only `mb-6` and the heading/paragraph classes; the implementation additionally adds `px-4 pt-4` so the Notes block aligns horizontally with the surrounding `p-4 border-b` SheetHeader and the `mx-4 mt-2` Tabs row. This is a layout-correctness micro-adjustment (Rule 1, since the plan's class set alone would have left the Notes flush against the sheet's left edge while SheetHeader and Tabs are inset by 16px) and is covered by the existing `mb-6` test which still passes — no acceptance criterion was weakened.

## Threat Flags

None. Plan's threat register entry T-22-11 (XSS via description) is mitigated as designed: React auto-escapes the description string when used as a text child; CSS `white-space: pre-line` preserves newlines without enabling HTML parsing. No new auth surface, no new network endpoint.

## Acceptance Criteria

- [x] `grep "camera-notes-heading\|Notes"` in view-stream-sheet.tsx → 4 matches (>= 2 required)
- [x] `grep "whitespace-pre-line"` → 2 matches (1 in code, 1 in comment; required: >= 1 in code)
- [x] `grep "uppercase tracking-wide"` → 2 matches (1 for Notes heading, 1 pre-existing REC label; required: 1 for Notes)
- [x] description guard regex `description.*&&|description\?\.length` → 1 match
- [x] `grep "mb-6"` → 1 match (Notes section)
- [x] Test file contains `describe('Phase 22: Notes section'`
- [x] Test command exits 0 with all 8 Phase 22 cases passing AND no regression (31/31 in test file, 37/37 across both view-stream-sheet test files)
- [x] TypeScript clean (`tsc --noEmit` on apps/web tsconfig)

## Commits

- `c457b75` — `test(22-09): add failing tests for Notes section in view-stream-sheet` (RED — 5/8 new tests fail)
- `a78db94` — `feat(22-09): add Notes section to view-stream-sheet (D-16)` (GREEN — 31/31 tests pass)

## Self-Check: PASSED

- FOUND: apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx
- FOUND: apps/web/src/app/admin/cameras/components/__tests__/view-stream-sheet.test.tsx
- FOUND: c457b75
- FOUND: a78db94
