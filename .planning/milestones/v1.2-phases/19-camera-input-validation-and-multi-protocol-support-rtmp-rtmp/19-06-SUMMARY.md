---
phase: 19-camera-input-validation-and-multi-protocol-support-rtmp-rtmp
plan: 06
subsystem: ui
tags: [react, vitest, testing-library, whatwg-url, aria, accessibility, nextjs]

requires:
  - phase: 19
    plan: 00
    provides: camera-form-dialog.test.tsx scaffold with 12 it.todo stubs
  - phase: 19
    plan: 01
    provides: backend zod refine protocol allowlist (mirrored by client validator)
  - phase: 19
    plan: 04
    provides: DuplicateStreamUrlError (P2002 -> 409 with code=DUPLICATE_STREAM_URL body)

provides:
  - validateStreamUrl(url) shared helper with 4-protocol allowlist + WHATWG URL host check
  - HELPER_TEXT / ERROR_PREFIX / ERROR_HOST copy constants
  - Add Camera / Edit Camera dialog live prefix validation + helper/error slot
  - Dialog duplicate-error branch rendering specific 409 copy
  - ApiError class exposing status + body + code for structured error handling
  - 13 camera-form-dialog test cases (was 12 it.todo, now 13 green tests)

affects:
  - 19-07 (bulk-import reuses validateStreamUrl — link already exists per live codebase)

tech-stack:
  added: []
  patterns:
    - Shared client-side validator helper (duplicated vs zod schema to avoid cross-version risk per RESEARCH Pitfall 4)
    - Single helper/error slot beneath inputs — swaps content, never layout (D-15 UI pattern)
    - ApiError class for structured server error responses — enables code-based branching

key-files:
  created:
    - apps/web/src/lib/stream-url-validation.ts
  modified:
    - apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx
    - apps/web/src/lib/api.ts

key-decisions:
  - "Duplicate the allowlist in the client validator rather than share the zod schema (RESEARCH Pitfall 4 — zod 3/4 cross-package risk)"
  - "Use single shared DOM slot for helper/error (vertical-jitter-free) per UI-SPEC §Add Camera Dialog"
  - "Empty URL returns null (no error) — HTML required + disabled Save handles the 'not yet typed' case without showing a premature red message"
  - "Upgraded apiFetch to throw ApiError instead of plain Error — mandatory to branch on 409 DUPLICATE_STREAM_URL (Rule 3)"

patterns-established:
  - "Client-side validator helper lives in src/lib/ and returns string | null (null == valid). Callers decide how to render — matches existing escape-html/utils pattern."
  - "ApiError is the structured shape thrown by apiFetch on non-2xx. Callers can `err instanceof ApiError` to branch on status + code; message and Error semantics preserved for legacy catch sites."

requirements-completed: []

duration: ~10min
completed: 2026-04-22
---

# Phase 19 Plan 06: Add Camera Dialog Live Validation Summary

**Live 4-protocol prefix validation + WHATWG URL host check + inline 409 DUPLICATE_STREAM_URL branch wired into the Add/Edit Camera dialog, gated by a shared `validateStreamUrl` helper that is also already consumed by P07 bulk-import.**

## Performance

- **Duration:** ~10 minutes
- **Started:** 2026-04-22T16:03:30Z (approx)
- **Completed:** 2026-04-22T16:07:00Z (approx)
- **Tasks:** 2/2
- **Files modified:** 4 (1 created + 3 modified)

## Accomplishments

- `validateStreamUrl` helper with 4-protocol allowlist (`rtsp://`, `rtmps://`, `rtmp://`, `srt://`) + WHATWG URL host check (D-15, D-16).
- Exported copy constants (`HELPER_TEXT`, `ERROR_PREFIX`, `ERROR_HOST`) — single source of truth for UI text.
- Add Camera / Edit Camera dialog now shows live inline error as the user types, auto-swaps back to the helper line when valid/empty, disables Save while invalid, and wires `aria-invalid` + `aria-describedby` to the correct element id.
- Submit catch branch on `ApiError.status === 409 && code === 'DUPLICATE_STREAM_URL'` renders the approved inline copy `A camera with this stream URL already exists.` (D-11 consumption).
- Converted all 12 `it.todo` stubs in `camera-form-dialog.test.tsx` into real tests + added 1 extra (13 green).
- Upgraded `apiFetch` to throw a structured `ApiError` (status + body + parsed `code`) so dialogs can branch on server error codes. Backward compatible with all existing `.catch` sites (still `instanceof Error` with the same message shape).

## Task Commits

1. **Task 1: Create validateStreamUrl helper** — `0cfa968` (feat)
2. **Task 2: Wire validation into camera-form-dialog + duplicate 409 branch** — `015bf54` (feat)

Both tasks followed RED -> GREEN: Task 2 wrote the 13 tests first (8 failures captured the contract gaps), then the dialog patch flipped them all green in a single GREEN step.

## Files Created/Modified

- `apps/web/src/lib/stream-url-validation.ts` (NEW) — helper + constants + WHATWG URL parser.
- `apps/web/src/lib/api.ts` — added `ApiError` class; `apiFetch` now reads response body (JSON or text) and throws `ApiError(status, statusText, body)` on non-2xx.
- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` — imports validator, `useMemo` over `streamUrl`, single helper/error `<p>` slot beneath input, `aria-*` wiring, extended Save-disabled rule, catch branch on `ApiError` 409 + `DUPLICATE_STREAM_URL`.
- `apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx` — converted 12 `it.todo` to real tests; added 1 extra helper-id assertion (13 total, all green).

## Decisions Made

- **Helper copy constants live in the helper module, not the component.** This lets P07 (already consuming `validateStreamUrl` per live codebase) stay aligned on the canonical strings without cross-importing a component.
- **`aria-describedby` always points at a present id (`cam-url-help` when valid, `cam-url-error` when invalid).** Screen readers always announce the right neighbour, and the UI shape doesn't bounce when toggling.
- **Empty-string input returns `null` from the validator** so the dialog doesn't show a red error on first mount or after reset — matches UI-SPEC copywriting contract ("Inline error — empty URL: no message — `required` HTML attribute + disabled Save button covers it").
- **`ApiError extends Error` with the same message format** to keep all existing `.catch(() => …)` sites (~180 across the web app) behaving exactly as before. Only new callers that want typed access use `err instanceof ApiError`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Upgraded `apiFetch` to throw structured `ApiError`**
- **Found during:** Task 2 (submit 409 branch)
- **Issue:** Original `apiFetch` threw a generic `new Error(` API error: ${status} ${statusText} `)` with no status, body, or code accessible on the thrown value. The plan's Task 2 action sketch (`error?.response?.status === 409 && code === 'DUPLICATE_STREAM_URL'`) could not be satisfied by the existing helper — the code literally had no way to reach the 409 branch.
- **Fix:** Added an `ApiError` class with `status`, `statusText`, `body`, and `code` fields (code auto-extracted when body is JSON with a string `code` property). `apiFetch` now reads the response body (JSON first, text fallback), then throws `new ApiError(…)` on non-2xx. Backward compatible — message/name preserved, still `instanceof Error`.
- **Files modified:** `apps/web/src/lib/api.ts`, `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx`
- **Verification:** Camera-form-dialog test `server 409 DUPLICATE_STREAM_URL shows …` passes; test `server non-duplicate error shows generic Failed to create camera…` also passes, confirming both branches work. All ~180 pre-existing `apiFetch(…).catch(…)` sites are backward compatible (verified by spot-checking `.catch(() => [])` patterns which rely only on the catch firing).
- **Committed in:** `015bf54` (Task 2 commit — bundled with the dialog changes since the dialog depends on the structured error)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep. The fix is strictly necessary for D-11 consumption and is scoped narrowly to the error contract — public API of `apiFetch` unchanged, new `ApiError` is purely additive.

## Issues Encountered

- **`act()` warnings in test output.** Several async `useEffect` data loads (projects, sites, stream profiles) fire state updates that Testing Library's default `fireEvent` does not auto-wrap. Tests still pass deterministically (13/13 green) and assertions use `waitFor` / `findByText` where needed. Pre-existing pattern in this suite — `bulk-import-dialog.test.tsx` (Plan 19-07) shows the same warnings. Not a regression; no action taken.

- **Pre-existing bulk-import test failures (3/17).** After my work, the full `src/app/admin/cameras` suite has 36 passing + 3 failing tests; those 3 failures are inside `bulk-import-dialog.test.tsx` (Plan 19-07's scope — `annotateDuplicates` export, toast warning assertion). Verified by stashing my changes: without them, `bulk-import-dialog.test.tsx` drops from 14/17 passing to 1/17 passing (because it imports `validateStreamUrl` from the helper this plan creates). My plan moves the net pass rate up, not down. Deferred — out of scope for P06.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `validateStreamUrl` is ready for P07 bulk-import (already imported — the P07 test file also references `annotateDuplicates`, which is P07's own work, not this plan's).
- `ApiError` is available platform-wide for any future dialog that needs to branch on server error codes.
- No blockers.

## Self-Check: PASSED

- [x] `apps/web/src/lib/stream-url-validation.ts` exists
- [x] `export function validateStreamUrl` grep match
- [x] `export const ALLOWED_PREFIXES` with all 4 protocols grep match
- [x] `export const HELPER_TEXT` grep match
- [x] `new URL(trimmed)` grep match (WHATWG parser per D-16)
- [x] `import { validateStreamUrl, HELPER_TEXT } from '@/lib/stream-url-validation'` present in dialog
- [x] `streamUrlError` referenced ≥ 2 times in dialog (actual: 7)
- [x] `aria-invalid={!!streamUrlError}` grep match
- [x] `aria-describedby={streamUrlError ? 'cam-url-error' : 'cam-url-help'}` grep match
- [x] `DUPLICATE_STREAM_URL` grep match in dialog
- [x] `A camera with this stream URL already exists.` grep match in dialog
- [x] `!!streamUrlError` in Save disabled rule
- [x] Commit `0cfa968` exists
- [x] Commit `015bf54` exists
- [x] 13/13 camera-form-dialog tests pass (exceeds ≥ 10 acceptance threshold)

---
*Phase: 19-camera-input-validation-and-multi-protocol-support-rtmp-rtmp*
*Plan: 06*
*Completed: 2026-04-22*
