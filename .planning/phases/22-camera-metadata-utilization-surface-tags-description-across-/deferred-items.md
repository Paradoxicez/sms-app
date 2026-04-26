# Phase 22 — Deferred items

Out-of-scope discoveries by parallel executors. NOT addressed by the owning
plan; logged here for triage.

## From Plan 22-10 execution (parallel agent-a7e9373d6d4181783)

### 3 pre-existing failures in bulk-import-dialog tests (out of scope)

- `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx` — 2 failing
- `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog-push.spec.tsx` — 1 failing

Verified by running `pnpm vitest run bulk-import-dialog` against HEAD before
any Plan 22-10 changes — same 3 failures present. Unrelated to map popup
or map page changes; lives in `BulkImportDialog` Select wiring (Base UI
combobox option list not surfacing under jsdom).

Action: NOT fixed. To be picked up by a quick task in a separate workflow.
