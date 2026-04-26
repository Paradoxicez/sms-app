# Phase 22 — Deferred Items

Out-of-scope issues discovered during plan execution. Tracked here per SCOPE
BOUNDARY rule: only auto-fix issues directly caused by the current task's
changes; pre-existing problems get logged for separate triage.

## Pre-existing test failures (bulk-import-dialog)

Discovered independently by Plan 22-07 and Plan 22-10 verification runs. These
failures exist on Phase 22's base branch BEFORE either plan's changes, in files
NOT modified by Phase 22 (D-10 explicitly says bulk-import-dialog stays
unchanged), and are NOT caused by Phase 22 edits.

| Test file | Failing case | Root cause (best guess) |
|-----------|--------------|--------------------------|
| `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx` | "footer counter shows 'N valid' + 'M duplicate' + 'K errors' when duplicates present" | jsdom `Not implemented: navigation` + counter rendering races during `click` cascade |
| `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx` | "Import button stays enabled when validCount + duplicateCount > 0 && errorCount === 0" | Same flake family as above — async state transitions in BulkImportDialog |
| `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog-push.spec.tsx` | "parses ingestMode column case-insensitive and populates push rows" | Test expects `2 valid` text in counter that doesn't render in time |

These should be fixed in a separate quick task (e.g., `quick-26xxxx-fix-bulk-import-dialog-test-flake`).

**Phase 22 scope verification:**
- 22-07 — `tag-input-combobox.test.tsx` (13/13), `camera-form-dialog.test.tsx` + `camera-form-dialog-push.spec.tsx` (30/30) all pass
- 22-10 — `camera-popup.test.tsx` (26/26), `tenant-map-page-tag-filter.test.tsx` (8/8), `camera-marker.test.tsx` (8/8), `camera-map-inner.test.tsx` (3/3) all pass
- `bulk-import-dialog.tsx` NOT modified (verified via `git status`); D-10 honored
