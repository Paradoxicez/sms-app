---
plan: 20-03
phase: 20-cameras-ux-bulk-actions-maintenance-toggle-copy-id-expressiv
status: complete
completed: 2026-04-25
tasks: 3/3
commits: 3
---

## What shipped

**Plan 20-03: Bulk Actions System + Partial-Failure Badges**

Wired the multi-select + bulk-actions fan-out path from `tenant-cameras-page.tsx` through `cameras-data-table.tsx` into `cameras-columns.tsx`, added the sticky `BulkToolbar`, built the `bulk-actions` library (`chunkedAllSettled` + `bulkAction` + `VERB_COPY` + pre-filters), and surfaced partial-failure error badges in the Status column.

## Tasks

| # | Commit | What |
|---|--------|------|
| 1 | `04dcbd7` | `bulk-actions.ts` — `chunkedAllSettled`, `bulkAction`, `VERB_COPY`, `filterStartStreamTargets` |
| 2 | `b905a85` | `BulkToolbar` sticky component with per-verb buttons + selection count |
| 3 | `beca3b5` | Row selection plumbing: `rowSelection` prop pair in data-table, select column in columns, mixed-state maintenance dialog flow, partial-failure badges in Status cell; added bulk-action mocks to `test-utils/setup.ts` |

## Test results (from agent's last-known state)

- **148 tests pass** across the four affected test files:
  - `bulk-actions.test.ts` — 34 tests
  - `bulk-toolbar.test.tsx` — 25 tests
  - `cameras-data-table.test.tsx` — 10 tests
  - `tenant-cameras-page.test.tsx` — 26 tests (plus existing page tests)
- Typecheck clean

## Key files

| Path | Kind |
|------|------|
| `apps/web/src/lib/bulk-actions.ts` | created — library |
| `apps/web/src/lib/bulk-actions.test.ts` | filled from scaffold (34 tests) |
| `apps/web/src/app/admin/cameras/components/bulk-toolbar.tsx` | created — sticky toolbar |
| `apps/web/src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx` | filled from scaffold (25 tests) |
| `apps/web/src/app/admin/cameras/components/cameras-columns.tsx` | modified — select column, partial-failure badge |
| `apps/web/src/app/admin/cameras/components/cameras-data-table.tsx` | modified — rowSelection plumbing |
| `apps/web/src/app/admin/cameras/components/__tests__/cameras-data-table.test.tsx` | filled from scaffold (10 tests) |
| `apps/web/src/components/pages/tenant-cameras-page.tsx` | modified — state + bulk handlers |
| `apps/web/src/components/pages/__tests__/tenant-cameras-page.test.tsx` | filled from scaffold (26 tests) |
| `apps/web/src/test-utils/setup.ts` | extended with bulk-action mocks |

## Completion note

The executor agent's stream watchdog timed out after Task 3's tests were green
but before the final commit + SUMMARY.md were created. The orchestrator
committed Task 3's staged changes and authored this SUMMARY based on the
agent's reported state ("All 148 tests pass, typecheck clean. Now committing
Task 3"). Test re-verification runs once the worktree is merged.
