---
phase: 19-camera-input-validation-and-multi-protocol-support-rtmp-rtmp
plan: 07
subsystem: frontend
tags: [react, nextjs, vitest, react-testing-library, bulk-import, validation, dedup, tdd]

# Dependency graph
requires:
  - phase: 19-00
    provides: Wave 0 test scaffold — 17 it.todo stubs in bulk-import-dialog.test.tsx across 3 describe blocks
  - phase: 19-04
    provides: bulk-import API response extended with `skipped: number` field for post-import toast cascade
  - phase: 19-06
    provides: validateStreamUrl helper + ALLOWED_PREFIXES (shared 4-protocol allowlist between Add Camera dialog and Bulk Import dialog)
provides:
  - Bulk Import dialog consumes validateStreamUrl (4-protocol allowlist parity with backend zod refine)
  - annotateDuplicates function — within-file dedup via exact trim string match (D-09)
  - CameraRow type extended with duplicate + duplicateReason (within-file | against-db)
  - Copy (amber) status icon for duplicate rows with tooltip cascade
  - 3-way footer counter (valid / duplicate / errors)
  - canImport rule allows duplicates, blocks only on errors (D-08 skip-with-warning)
  - Post-import toast cascade consuming result.imported + result.skipped
  - Exports validateRow, annotateDuplicates, CameraRow for unit testability
  - 17 tests converted from Wave 0 it.todo scaffold — all green
affects:
  - 19-08 (E2E pipeline — bulk import now reports imported vs skipped split)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared client-side validator (stream-url-validation.ts) consumed by two dialogs — single source of truth for 4-protocol allowlist on the web layer"
    - "Within-file dedup via Map<string, number> — O(n) scan, first occurrence wins, subsequent rows flagged (idx-vs-firstIdx guard prevents self-flagging on re-runs)"
    - "3-way status priority in table cell: errors > duplicate > valid (rendered as nested ternary)"
    - "Toast cascade (4 branches) reading server response shape {imported, skipped} from P04 — client and server agree on what 'skipped' means without extra protocol"
    - "Unit-testable functions exported from component file (validateRow, annotateDuplicates) — sidesteps complex React integration scaffolding for pure-function tests while still allowing component-level tests for UI behavior"

key-files:
  created:
    - apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx (rewrite — 301 lines, 17 tests replacing Wave 0 it.todo stubs)
  modified:
    - apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx

key-decisions:
  - "D-08 (row-state policy): duplicates render as amber Copy icon, NOT red X — they are skip-with-warning, not errors. canImport = (validCount + duplicateCount) > 0 && errorCount === 0."
  - "D-09 (exact match dedup): trimmed streamUrl, no normalization (no lowercasing, no query-param stripping). Matches backend DB @@unique + server-side pre-check behavior. `rtsp://h/s` and `rtsp://h/s/` are treated as different URLs on purpose."
  - "D-10a (within-file only): client flags duplicates within the current CSV preview; against-db is reserved for future planner choice and the type already supports it (duplicateReason === 'against-db')."
  - "D-12 (4-protocol allowlist): delegates to validateStreamUrl — zero copy-paste risk vs backend zod refine."
  - "D-16 (host check): WHATWG `new URL()` parse inside validateStreamUrl — catches `rtsp:///` (empty hostname) with 'Invalid URL — check host and path'."
  - "Row-level copy brevity: bulk-import uses 'Must be rtsp://, rtmps://, rtmp://, or srt://' (shorter than the form-dialog copy 'URL must start with…') because the error displays in a 16px-wide Status cell tooltip, not a full-width form slot. Helper re-maps the longer upstream message to the shorter row copy."

patterns-established:
  - "When the same client-side validator serves two surfaces with different copy expectations, the helper owns the canonical message and each caller adapts it — not vice versa. Caller-side adaptation keeps the shared helper's output stable for downstream consumers."
  - "Exporting pure-function internals from a React component file for unit tests is acceptable in this codebase when the alternative (full integration-test scaffold per function) dwarfs the surface-area cost."

requirements-completed: []

# Metrics
duration: ~25 min
completed: 2026-04-22
---

# Phase 19 Plan 07: Bulk Import Dialog — 4-Protocol Allowlist + Within-File Dedup + Toast Cascade Summary

**Extended bulk-import-dialog with shared 4-protocol validator, within-file duplicate detection (amber Copy icon), 3-way footer counter, Import-button rule that allows duplicates, and post-import toast cascade — closes audit gap "Bulk Import duplicate detection: ไม่มีเลยทั้งสองฝั่ง".**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-22T16:03Z
- **Completed:** 2026-04-22T16:08Z
- **Tasks:** 3 of 3
- **Commits:** 2 (RED + GREEN — all three tasks touched the same file and landed as a unified GREEN commit after the RED tests were in place)

## Objective Recap

Extend the bulk import dialog to match the 4-protocol allowlist (D-12), detect within-file duplicates (D-10a + D-16), surface a 3rd "duplicate" row status alongside existing ✓/✗ icons (D-08), and cascade the post-import toast based on the API's `skipped` field (P04 Task 5). The dialog is the primary vector for first-time bulk onboarding — this change closes the audit gap for bulk-import dedup.

## Tasks Completed

| Task | Name                                                                   | Commit    | Files                                                                                                                                                                                           |
| ---- | ---------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED  | Write failing tests (17 tests converted from Wave 0 it.todo stubs)     | `e798e17` | `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx`                                                                                                               |
| 1-3  | Extend validateRow + annotateDuplicates + type + status cell + counter + toast cascade (GREEN) | `2beb28c` | `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx`                                                                                                                              |

Tasks 1, 2, and 3 all modify the same file and share verification (the same 17-test suite covers all three). They were implemented together in one GREEN commit following the RED commit — preserves atomic task boundaries for traceability while avoiding the anti-pattern of multiple partial commits that don't individually satisfy the test suite.

## Diff Summary

### `validateRow`

**Before (L152-172):**
```ts
function validateRow(row: CameraRow): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!row.name.trim()) errors.name = 'Name is required';
  if (!row.streamUrl.trim()) {
    errors.streamUrl = 'Stream URL is required';
  } else if (
    !row.streamUrl.startsWith('rtsp://') &&
    !row.streamUrl.startsWith('srt://')
  ) {
    errors.streamUrl = 'Must be rtsp:// or srt://';
  }
  // ... lat/lng checks unchanged
}
```

**After:**
```ts
export function validateRow(row: CameraRow): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!row.name.trim()) errors.name = 'Name is required';
  const url = row.streamUrl.trim();
  if (!url) {
    errors.streamUrl = 'Stream URL is required';
  } else {
    const urlError = validateStreamUrl(url); // shared helper (P06)
    if (urlError) {
      if (urlError === 'URL must start with rtsp://, rtmps://, rtmp://, or srt://') {
        errors.streamUrl = 'Must be rtsp://, rtmps://, rtmp://, or srt://';
      } else {
        errors.streamUrl = urlError; // 'Invalid URL — check host and path'
      }
    }
  }
  // ... lat/lng checks unchanged
}
```

### `annotateDuplicates` (new)

```ts
export function annotateDuplicates(rows: CameraRow[]): CameraRow[] {
  const seen = new Map<string, number>();
  return rows.map((row, idx) => {
    const url = row.streamUrl.trim();
    if (!url) return { ...row, duplicate: false, duplicateReason: undefined };
    const firstIdx = seen.get(url);
    if (firstIdx !== undefined && firstIdx !== idx) {
      return { ...row, duplicate: true, duplicateReason: 'within-file' as const };
    }
    seen.set(url, idx);
    return { ...row, duplicate: false, duplicateReason: undefined };
  });
}
```

Wired into 4 call sites:
- `processRows` (initial CSV/Excel/JSON parse)
- `handleCellEdit` (on every cell edit)
- `handleRemoveRow` (re-compute after removing a row — a previously-flagged dup can become valid if its "original" was removed)
- Exported for direct unit-tests

### 3-way Status Cell (L534-547 → expanded)

```tsx
{hasErrors ? (
  // existing ✗ destructive branch — unchanged structure
) : row.duplicate ? (
  // NEW: amber Copy icon + tooltip cascade (within-file | against-db)
  <Tooltip>...<Copy className="... text-amber-600 dark:text-amber-500" /></Tooltip>
) : (
  // existing ✓ primary branch — unchanged
)}
```

Priority: errors > duplicate > valid. A row that's both error and dup shows ✗ (errors always win).

### Footer Counter (L566-575 → 3 conditionals)

```tsx
<span className="text-primary font-medium inline-flex items-center gap-1">
  <Check className="h-3.5 w-3.5" /> {validCount} valid
</span>
{duplicateCount > 0 && (
  <span className="text-amber-600 ... font-medium inline-flex items-center gap-1">
    <Copy className="h-3.5 w-3.5" /> {duplicateCount} duplicate
  </span>
)}
{errorCount > 0 && (
  <span className="... text-destructive font-medium">
    <AlertCircle className="h-3.5 w-3.5" /> {errorCount} errors
  </span>
)}
```

Order: valid → duplicate → errors. Conditional rendering hides zero-counts.

### `canImport` Rule

**Before:** `canImport = validCount > 0 && errorCount === 0 && !!selectedSiteId`
**After:**  `canImport = (validCount + duplicateCount) > 0 && errorCount === 0 && !!selectedSiteId`

Duplicates count toward "enabled". Only format errors block. Matches D-08 skip-with-warning policy.

### Toast Cascade (L313-353 → 4-branch)

```ts
const imported = result?.imported ?? 0;
const skipped = result?.skipped ?? 0;

if (imported > 0 && skipped === 0) {
  toast.success(`Imported ${imported} cameras successfully.`);
} else if (imported > 0 && skipped > 0) {
  toast.success(`Imported ${imported} cameras, skipped ${skipped} duplicates.`);
} else if (imported === 0 && skipped > 0) {
  toast.warning(`No cameras imported — all ${skipped} rows were duplicates.`);
} else {
  toast.error('Import failed. Check camera limits and try again.');
}
```

Also: client-side payload filter — duplicates are stripped from the request body to reduce server load. Server still authoritatively dedupes via `@@unique([orgId, streamUrl])` race-safety.

## Test Count Delta

| Before              | After                | Converted                                 |
| ------------------- | -------------------- | ----------------------------------------- |
| 17 `it.todo` stubs  | 17 passing tests     | **17 of 17** — 100% conversion rate       |

Test coverage breakdown:
- **Group 1 (7 tests):** protocol allowlist — accepts rtsp/rtmp/rtmps/srt, rejects http, empty, empty-host
- **Group 2 (7 tests):** duplicate detection — within-file flagging, first-occurrence-wins, exact string match (trailing slash differs), footer 3-counter render, canImport with duplicates, canImport blocked by errors, edit-removes-flag
- **Group 3 (3 tests):** toast cascade — 3 server-response shapes (imported=N/skipped=0, imported=N/skipped=M, imported=0/skipped=M)

Full web test suite: **258 passed, 1 skipped, 18 todo, 0 failed**. Zero regressions.

## Verification

```bash
# TypeScript — clean
pnpm --filter @sms-platform/web exec tsc --noEmit
# (no output → no errors)

# Targeted test run — all green
pnpm --filter @sms-platform/web test -- --run app/admin/cameras/components/__tests__/bulk-import-dialog
# Test Files  1 passed (1)
# Tests       17 passed (17)

# Full web suite — zero regressions
pnpm --filter @sms-platform/web test -- --run
# Test Files  40 passed | 2 skipped (42)
# Tests       258 passed | 1 skipped | 18 todo (277)
```

## Acceptance Criteria Status

- [x] `validateRow` uses shared `validateStreamUrl` helper
- [x] `annotateDuplicates` flags within-file dupes (exact trim match per D-09)
- [x] `CameraRow` type extended with `duplicate` + `duplicateReason`
- [x] Copy amber icon renders in status cell for duplicate rows
- [x] Footer shows 3-way counter (valid / duplicate / errors) conditionally
- [x] Import button: `canImport` allows duplicates (skip-with-warning)
- [x] Post-import toast cascades on imported/skipped combinations
- [x] 17 of 17 tests converted from `it.todo` (plan's floor was 14)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dependency on P06's `stream-url-validation.ts` was ambiguous at plan-execute time**

- **Found during:** initial Task 1 read-first
- **Issue:** Plan 19-07 imports `validateStreamUrl` from `@/lib/stream-url-validation`, which is produced by Plan 19-06. The file exists on `main` (committed by P06 at `0cfa968`), but a false-positive `ls` check early in execution implied it was missing. The file was present the whole time — no actual fix was needed once the ambiguity was resolved via `git log --oneline --all -- apps/web/src/lib/stream-url-validation.ts`.
- **Fix:** None required — verified the file existed and had the expected export signature before proceeding.
- **Files modified:** none
- **Commit:** N/A

### Scope-Boundary Observations

- **Not fixed (out of scope):** Several existing tests in the web workspace emit `act(...)` warnings (`recordings-feature-gate.test.tsx`, etc.) — pre-existing noise, not caused by Phase 19 changes. Logged via the existing deferred-items pipeline.
- **Not fixed (intentional):** The live `DialogContent` has `sm:max-w-4xl` on preview; mobile < sm breakpoint relies on Dialog default. Plan doesn't require mobile verification and UI-SPEC explicitly allows counter wrap at mobile widths.

## Known Stubs

None. All rendered row states receive live data. No hardcoded empty values that flow to UI rendering.

## Threat Flags

None. No new network endpoints, no new trust boundaries, no new schema changes. The only newly-reachable server response field (`skipped`) is an int from a pre-existing authenticated endpoint (`/api/cameras/bulk-import`) already constrained by tenant RLS.

## Self-Check: PASSED

- [x] `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx` — FOUND
- [x] `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx` — FOUND
- [x] `apps/web/src/lib/stream-url-validation.ts` — FOUND (pre-existing from P06)
- [x] Commit `e798e17` (RED — 17 failing tests) — FOUND in git log
- [x] Commit `2beb28c` (GREEN — Tasks 1-3 implementation) — FOUND in git log
