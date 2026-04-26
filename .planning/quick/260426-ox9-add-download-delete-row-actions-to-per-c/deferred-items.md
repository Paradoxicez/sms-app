# Deferred Items — Quick Task 260426-ox9

Out-of-scope discoveries during execution. Logged per executor scope rules
(only auto-fix issues directly caused by the current task's changes).

## Pre-existing failing tests in unrelated files

The full `pnpm vitest run` (web) reports 3 failing tests across 2 unrelated files:

1. `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog-push.spec.tsx`
   - First failure: "Unable to find an element with the text: 2 valid"
2. `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx`
   - Multiple failures with similar AlertDialog overlay / portal selectors.

Both files were already modified before this quick task started (visible in
`git status` at session start as `M`). The failures are unrelated to the
per-camera Recordings detail-page table that this task touches and should
be triaged via a separate `/gsd-debug` session.

Targeted suites for this quick task:

- `src/app/app/recordings/[id]/components/__tests__/recordings-list.test.tsx` — 8 / 8 passing
- `src/__tests__/playback-page.test.tsx` — 7 / 7 passing (regression guard)
