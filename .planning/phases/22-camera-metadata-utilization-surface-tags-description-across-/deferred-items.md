# Phase 22 — Deferred Items

Out-of-scope issues discovered during plan execution. Tracked here per SCOPE
BOUNDARY rule: only auto-fix issues directly caused by the current task's
changes; pre-existing problems get logged for separate triage.

## Plan 22-07 — TagInputCombobox

### Pre-existing test failures (bulk-import-dialog)

Discovered while running the full `pnpm --filter @sms-platform/web test` suite
during Plan 22-07 verification. These failures exist on the base branch (commit
`73e5b61`) BEFORE Plan 22-07 changes, are in files NOT modified by 22-07
(D-10 explicitly says bulk-import-dialog stays unchanged), and are NOT caused
by the TagInputCombobox or camera-form-dialog edits.

| Test file | Failing case | Root cause (best guess) |
|-----------|--------------|--------------------------|
| `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx` | "footer counter shows 'N valid' + 'M duplicate' + 'K errors' when duplicates present" | jsdom `Not implemented: navigation` + counter rendering races during `click` cascade |
| `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx` | "Import button stays enabled when validCount + duplicateCount > 0 && errorCount === 0" | Same flake family as above — async state transitions in BulkImportDialog |
| `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog-push.spec.tsx` | "parses ingestMode column case-insensitive and populates push rows" | Test expects `2 valid` text in counter that doesn't render in time |

These are pre-existing flaky/broken tests in `bulk-import-dialog.*`. They
should be fixed in a separate plan (e.g., a quick task: `quick-26xxxx-fix-
bulk-import-dialog-test-flake`).

**Plan 22-07 scope verification:**
- `apps/web/src/app/admin/cameras/components/__tests__/tag-input-combobox.test.tsx` — 13/13 passing (new component)
- `apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx` + `camera-form-dialog-push.spec.tsx` — 30/30 passing (Plan 22-07 changes verified)
- `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx` — NOT modified (verified via `git status`); D-10 honored
