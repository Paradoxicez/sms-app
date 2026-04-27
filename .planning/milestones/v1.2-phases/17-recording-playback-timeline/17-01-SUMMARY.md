---
phase: 17-recording-playback-timeline
plan: 01
subsystem: web-ui
tags: [data-table, recordings, navigation, accessibility, tdd, row-click]

# Dependency graph
requires:
  - phase: 17-recording-playback-timeline
    plan: 00
    provides: FOUND-01f it.todo scaffolds in apps/web/src/__tests__/data-table.test.tsx
  - phase: 14-foundation-fixes
    provides: Base DataTable component (FOUND-01a..01e)
  - phase: 11-recordings
    provides: RecordingsDataTable + recordings-columns
provides:
  - "DataTable.onRowClick prop — reusable row-click navigation hook (cursor-pointer + tabIndex=0 + Enter/Space key)"
  - "Recordings table row-click → /app/recordings/[id] navigation (REC-01 entry point, D-02)"
  - "stopPropagation contract on Checkbox + DataTableRowActions cells (lockable via grep tests)"
affects:
  - 17-02-playback-api-and-hook (consumes /app/recordings/[id] route — needs the nav target)
  - 17-04-playback-page-ui (final destination of row-click)
  - Future tables (Team, Organizations, Cluster Nodes, Platform Audit) can reuse onRowClick

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional onRowClick prop with three coordinated wirings: className, onClick, onKeyDown — all gated by handler presence so existing tables are byte-identical when prop is omitted"
    - "Cell-level stopPropagation wrapper div for interactive cells (Checkbox, DataTableRowActions) that must NOT bubble to row handler"
    - "Source-level grep test as a contract pin — locks recordings-columns wrapper structure without mounting the full RecordingsDataTable (avoids heavy mock surface)"

key-files:
  created: []
  modified:
    - apps/web/src/components/ui/data-table/data-table.tsx
    - apps/web/src/app/app/recordings/components/recordings-columns.tsx
    - apps/web/src/app/app/recordings/components/recordings-data-table.tsx
    - apps/web/src/__tests__/data-table.test.tsx

key-decisions:
  - "Treat onRowClick as additive opt-in: when undefined, row stays exactly as it was — no className, no onClick, no tabIndex (regression-safe for 13+ existing tables)"
  - "Wrap interactive cells in <div onClick=stopPropagation> rather than attaching stopPropagation to each Checkbox/Button — keeps interactive components untouched and pattern reusable"
  - "Switch grep tests from import.meta.url URL resolution to process.cwd() + path.resolve — vitest jsdom environment cannot resolve file: URLs from import.meta"

patterns-established:
  - "Reusable interactive-row pattern for shadcn DataTable: handler-presence-gates entire interaction surface (className/onClick/onKeyDown together)"
  - "Cell-stopPropagation wrapper as the contract for interactive children inside clickable rows"
  - "Source-grep contract tests for column factories — cheap structural pin without integration-test overhead"

requirements-completed: [REC-01]

# Metrics
duration: 4min
completed: 2026-04-19
tasks: 2
commits: 3
---

# Phase 17 Plan 01: Recordings Row-Click Navigation Summary

**DataTable now accepts an optional `onRowClick(row)` handler that wires cursor-pointer, tabIndex=0, and Enter/Space key handling in a single switch; recordings table uses it to `router.push('/app/recordings/' + row.id)` while Checkbox + actions cells stop propagation so they keep their own behavior — implements D-02, the entry point for REC-01.**

## What Shipped

### 1. `DataTable` reusable row-click prop (Task 1, TDD)
- `DataTableProps` gains optional `onRowClick?: (row: TData) => void`
- When provided, every body row gets:
  - `className="cursor-pointer"` (visual affordance)
  - `onClick={() => onRowClick(row.original)}` (mouse)
  - `tabIndex={0}` + `onKeyDown` for Enter and Space (keyboard a11y)
- When omitted, all three default to `undefined` — existing tables (Audit Log, Users, API Keys, Webhooks, Stream Profiles, Cameras, etc.) are byte-identical.

### 2. Recordings table wiring (Task 2)
- `recordings-columns.tsx`: Checkbox cell and `DataTableRowActions` cell wrapped in `<div onClick={(e) => e.stopPropagation()}>`. Header cells untouched.
- `recordings-data-table.tsx`:
  ```tsx
  const handleRowClick = React.useCallback(
    (row: RecordingRow) => { router.push(`/app/recordings/${row.id}`) },
    [router]
  )
  // ...
  <DataTable ... onRowClick={handleRowClick} ... />
  ```
- `router.replace` for filter/pagination URL state preserved (lines 114, 410) — no regression of RESEARCH §Anti-Patterns guidance.

### 3. Test coverage
- 5 FOUND-01f tests now GREEN (previously `it.todo`):
  - body-cell click invokes handler with `row.original`
  - cursor-pointer class present iff handler provided
  - tabIndex=0 + Enter key fires handler
  - stopPropagation in child cell prevents row handler
  - undefined handler leaves row non-interactive
- 2 source-level grep tests pin recordings-columns stopPropagation wrappers (one for Checkbox cell, one for `DataTableRowActions` cell)
- Total: **12/12 tests pass** in `apps/web/src/__tests__/data-table.test.tsx`

## Verification

| Check | Result |
|-------|--------|
| `pnpm exec vitest run src/__tests__/data-table.test.tsx` | 12 passed (10 + 2 new) |
| `pnpm exec tsc --noEmit -p tsconfig.json` | exit 0, no errors |
| Grep `<div onClick={(e) => e.stopPropagation()}>` in recordings-columns.tsx | 2 matches (lines 54, 155) |
| Grep `router.push(\`/app/recordings/${row.id}\`)` in recordings-data-table.tsx | 1 match (line 307) |
| Grep `onRowClick={handleRowClick}` in recordings-data-table.tsx | 1 match (line 502) |
| Grep `router.replace` in recordings-data-table.tsx | 2 matches preserved (lines 114, 410) |

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Clicking any non-interactive cell navigates to `/app/recordings/[id]` | PASS (FOUND-01f body-cell test + handleRowClick wiring) |
| Clicking the checkbox cell still toggles selection (does NOT navigate) | PASS (stopPropagation wrapper + FOUND-01f stopPropagation test) |
| Clicking the actions menu trigger still opens dropdown (does NOT navigate) | PASS (stopPropagation wrapper around DataTableRowActions) |
| Pressing Enter on a focused row navigates | PASS (FOUND-01f tabIndex+Enter test) |
| Rows show `cursor-pointer` only when handler provided | PASS (FOUND-01f cursor-pointer test, both branches) |
| TypeScript compiles | PASS (tsc --noEmit exit 0) |
| `router.replace` for filter URL state preserved | PASS (2 occurrences confirmed via grep) |
| DataTable extension is reusable for future tables | PASS (additive optional prop, no regression in 13+ existing consumers) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocker] Replaced `import.meta.url` with `process.cwd()` for grep test path resolution**
- **Found during:** Task 2, after writing the source-level grep tests
- **Issue:** `new URL(relativePath, import.meta.url)` in vitest jsdom env produces a URL whose scheme is not `file:`, causing `fs.readFile` to throw `TypeError: The URL must be of scheme file`
- **Fix:** Switched to `path.resolve(process.cwd(), "src/app/app/recordings/components/recordings-columns.tsx")` for both grep tests
- **Files modified:** `apps/web/src/__tests__/data-table.test.tsx` (only)
- **Commit:** `e2d50b2` (rolled into Task 2 GREEN commit because the fix was discovered during the verification step)

No other deviations. Plan executed otherwise exactly as written.

### Authentication Gates

None — pure UI/test work, no auth surface touched.

## Commits

| Phase | Hash | Subject |
|-------|------|---------|
| TDD RED | `34059e1` | test(17-01): add failing tests for DataTable onRowClick (FOUND-01f) |
| TDD GREEN (Task 1) | `c7e3843` | feat(17-01): add onRowClick prop to base DataTable |
| Task 2 | `e2d50b2` | feat(17-01): wire row-click navigation on recordings DataTable (REC-01) |

## Threat Model Status

| Threat ID | Disposition | Implementation Note |
|-----------|-------------|---------------------|
| T-17-01-T (Tampering) | accept | URL is `'/app/recordings/' + row.id` where `row.id` is a UUID from API — not user-controllable as path-traversal vector |
| T-17-01-S (Spoofing) | n/a | No new auth surface; existing AuthGuard on `/api/recordings/*` unchanged |
| T-17-01-A11y | mitigated | tabIndex=0, Enter+Space handlers, aria-labels on row contents preserved |

No new threat surface introduced. No threat flags raised.

## Self-Check: PASSED

- `apps/web/src/components/ui/data-table/data-table.tsx`: FOUND
- `apps/web/src/app/app/recordings/components/recordings-columns.tsx`: FOUND
- `apps/web/src/app/app/recordings/components/recordings-data-table.tsx`: FOUND
- `apps/web/src/__tests__/data-table.test.tsx`: FOUND
- Commit `34059e1`: FOUND
- Commit `c7e3843`: FOUND
- Commit `e2d50b2`: FOUND
