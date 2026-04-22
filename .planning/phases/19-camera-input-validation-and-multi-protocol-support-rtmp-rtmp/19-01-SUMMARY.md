---
phase: 19
plan: 01
subsystem: api/cameras/dto
tags: [security, validation, dto, rtmp, zod]
requires:
  - 19-00  # Scaffolding + shared types + it.todo stubs
provides:
  - 4-protocol (rtsp/rtmps/rtmp/srt) allowlist at DTO boundary
  - T-19-01 SSRF/malicious-scheme mitigation at API entry
  - D-17 bulk-import .url() parity with createCamera
affects:
  - apps/api/src/cameras/dto/create-camera.dto.ts
  - apps/api/src/cameras/dto/update-camera.dto.ts
  - apps/api/src/cameras/dto/bulk-import.dto.ts
  - apps/api/tests/cameras/bulk-import.test.ts
tech_stack:
  patterns:
    - "Duplicated STREAM_URL_ALLOWED_PREFIXES constant per DTO (framework-boundary cleanness — avoids cross-DTO imports; web-side duplicates in P06)"
    - "Zod .url() before .refine() — WHATWG URL parser acts as cheap floor filter, then prefix allowlist tightens to stream protocols"
key_files:
  created: []
  modified:
    - apps/api/src/cameras/dto/create-camera.dto.ts
    - apps/api/src/cameras/dto/update-camera.dto.ts
    - apps/api/src/cameras/dto/bulk-import.dto.ts
    - apps/api/tests/cameras/bulk-import.test.ts
decisions:
  - D-12 applied: 4-protocol allowlist (rtsp, rtmps, rtmp, srt) at DTO level
  - D-17 applied: bulk-import now matches createCamera strictness (.url() floor)
metrics:
  duration: "~4 min"
  completed: 2026-04-22
  tasks_completed: 3
  tests_added: 6
  tests_passing: 27
  tests_todo: 6
---

# Phase 19 Plan 01: DTO Protocol Allowlist (rtsp/rtmps/rtmp/srt) Summary

One-liner: Extend all three camera DTOs from 2-protocol (rtsp/srt) to 4-protocol (rtsp/rtmps/rtmp/srt) allowlist via a module-level `STREAM_URL_ALLOWED_PREFIXES` constant, plus bring bulk-import up to create-camera parity with `.url()` (D-17). This is the T-19-01 entry-boundary mitigation — any malicious scheme (http, javascript, file, gopher, ftp) is now rejected before the URL reaches FFmpeg/ffprobe.

## What Shipped

### Before / After Diff (streamUrl field)

**Before (all 3 DTOs):**
```ts
streamUrl: z.string().url().refine(
  (url) => url.startsWith('rtsp://') || url.startsWith('srt://'),
  { message: 'Stream URL must be rtsp:// or srt://' },
)
```
(bulk-import.dto.ts additionally *missing* `.url()` — the D-17 gap)

**After (all 3 DTOs):**
```ts
const STREAM_URL_ALLOWED_PREFIXES = ['rtsp://', 'rtmps://', 'rtmp://', 'srt://'] as const;
// ...
streamUrl: z
  .string()
  .url()
  .refine((url) => STREAM_URL_ALLOWED_PREFIXES.some((p) => url.startsWith(p)), {
    message: 'Stream URL must be rtsp://, rtmps://, rtmp://, or srt://',
  })
```

### Test Count Delta

| File | Before | After | Added |
|------|--------|-------|-------|
| apps/api/tests/cameras/bulk-import.test.ts | 12 passing | 18 passing | +6 Phase-19 cases |
| apps/api/tests/cameras/camera-crud.test.ts | 9 passing + 6 todo | 9 passing + 6 todo | 0 (stubs stay todo per plan; P03 flips them) |

New tests (all green):
1. `accepts rtmp:// URLs (D-12 RTMP unblock)`
2. `accepts rtmps:// URLs`
3. `rejects http:// URLs with allowlist message` (asserts error message contains the 4 protocols)
4. `rejects javascript: URLs (T-19-01 SSRF/XSS surface)`
5. `rejects file:// URLs (T-19-01 local file read)`
6. `rejects malformed URLs via .url() floor (D-17)`

### T-19-01 Mitigation Coverage

| Attack Vector | Status | Test |
|---------------|--------|------|
| `javascript:alert(1)` → XSS in URL parsers / ffmpeg arg | rejected at DTO | Task 3 test 4 |
| `file:///etc/passwd` → local file exfiltration via ffprobe | rejected at DTO | Task 3 test 5 |
| `http://evil.example` → SSRF / wrong scheme | rejected at DTO | Task 3 test 3 (also existing bulk-import http test) |
| `gopher://` / `ftp://` → other non-stream schemes | rejected at DTO | Covered implicitly (not in allowlist) |
| `not-a-url` → malformed strings bypass refine | rejected at `.url()` | Task 3 test 6 |

The T-19-01 threat (HIGH severity per plan's threat model) is fully mitigated at the DTO entry boundary. Downstream FFmpeg/ffprobe/SRS code never sees a URL that failed the allowlist.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | ccabd18 | feat(19-01): extend create-camera.dto.ts to 4-protocol allowlist |
| 2 | 8da0168 | feat(19-01): extend update-camera.dto.ts to 4-protocol allowlist |
| 3 | ed03b23 | feat(19-01): extend bulk-import.dto.ts + add 4-protocol allowlist tests |

## Verification (all green)

- `pnpm --filter @sms-platform/api test -- --run tests/cameras/bulk-import tests/cameras/camera-crud` → 27 passed / 6 todo / 0 failing
- All 3 DTOs reference `STREAM_URL_ALLOWED_PREFIXES` (grep)
- Old `startsWith('rtsp://') || url.startsWith('srt://')` pattern: ZERO survivors in `apps/api/src/cameras/dto/`
- Every `streamUrl:` chain includes `.url()` (grep confirmed across all 3 DTOs)
- TypeScript compile: no new errors introduced in the DTO files (pre-existing `apps/api` type errors — e.g., `Express.Multer`, `PlaybackService | null` — are out of scope per plan; will be addressed separately)

## Deviations from Plan

None. Plan executed exactly as written.

One transient test-infra note (not a deviation from plan logic): the first run of `bulk-import.test.ts` in this worktree failed 2 pre-existing DB tests (`should bulk import cameras with status offline`, `should check maxCameras limit`) with FK-constraint errors caused by leftover DB state from prior aborted runs. A re-run (which triggers the `pretest` hook for fresh DB setup) produced 18/18 passing. The 6 new Phase-19 tests passed on every attempt including the first, since they are pure zod safeParse checks with no DB dependency.

## Acceptance Criteria Met

All task-level and plan-level success criteria satisfied:
- [x] All 3 DTOs use `STREAM_URL_ALLOWED_PREFIXES` (4 protocols)
- [x] Bulk-import DTO now includes `.url()` (D-17)
- [x] 6 new tests cover rtmp, rtmps, http reject (with message), javascript reject, file reject, malformed reject
- [x] camera-crud it.todo stubs stay as todo (P03 flips them)
- [x] Full bulk-import + camera-crud test suites still green
- [x] No TypeScript regressions in DTO files

## Known Stubs

None introduced by this plan. The 6 `it.todo` stubs in `camera-crud.test.ts` (createCamera probe enqueue + duplicate detection) are intentionally deferred to Plan 03 per the plan's success criteria.

## Self-Check: PASSED

- DTOs exist and compile: FOUND create-camera.dto.ts, update-camera.dto.ts, bulk-import.dto.ts
- Tests green: FOUND 27 passing across the two test files
- Commits exist:
  - FOUND: ccabd18 feat(19-01): extend create-camera.dto.ts to 4-protocol allowlist
  - FOUND: 8da0168 feat(19-01): extend update-camera.dto.ts to 4-protocol allowlist
  - FOUND: ed03b23 feat(19-01): extend bulk-import.dto.ts + add 4-protocol allowlist tests
