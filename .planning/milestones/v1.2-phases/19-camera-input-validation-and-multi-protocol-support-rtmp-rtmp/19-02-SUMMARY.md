---
phase: 19
plan: 02
subsystem: streams/cameras
tags: [ffmpeg, ffprobe, rtmp, rtsp, srt, protocol-branching, d-13]
requires:
  - phase-19/19-00 (Wave 0 scaffold — ffmpeg-command-builder.test.ts stubs)
provides:
  - "FfprobeService.inputFlagsFor(url): protocol-aware input flag selection"
  - "shouldAddRtspTransport(url): exported predicate for builders/tests"
  - "FfprobeService __test__ namespace for whitebox unit testing of private helpers"
affects:
  - "rtmp://, rtmps://, srt://, http(s):// ingest — no longer emits stray -rtsp_transport flag"
  - "rtsp:// ingest — behavior unchanged (still passes -rtsp_transport tcp)"
tech-stack:
  added: []
  patterns:
    - "Named __test__ export for private-method whitebox tests (replaces deep `(service as any)` casts in call sites)"
    - "Module-level predicate helpers for protocol branching (keeps buildFfmpegCommand body linear)"
key-files:
  created: []
  modified:
    - apps/api/src/cameras/ffprobe.service.ts
    - apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts
    - apps/api/tests/cameras/ffprobe.test.ts
    - apps/api/tests/streams/ffmpeg-command-builder.test.ts
decisions:
  - "Use named __test__ export over `protected` method — keeps the production surface private while giving tests a single stable entry point (no runtime cost in production bundles that tree-shake unused exports)."
  - "Add `shouldAddRtspTransport` as an exported module-level function rather than inlining — lets Wave 0 scaffolded tests exercise protocol logic without reaching into fluent-ffmpeg's internal `_inputOptions` array (undocumented, version-fragile)."
  - "Branch on `startsWith('rtsp://')` (not a regex or set lookup) — cheapest check, matches the one URL family that actually needs the flag, future protocols default-safe to omit the flag."
metrics:
  duration_minutes: 4
  completed_date: 2026-04-22
  tasks_total: 2
  tasks_completed: 2
  commits: 4
  test_delta: +8 tests (4 ffprobe, 4 ffmpeg-command-builder)
---

# Phase 19 Plan 02: Protocol-branch `-rtsp_transport tcp` flag Summary

**One-liner:** `-rtsp_transport tcp` is now emitted only for `rtsp://` URLs in both `ffprobe.service.ts` (via a private `inputFlagsFor` helper) and `ffmpeg-command.builder.ts` (via an exported `shouldAddRtspTransport` predicate), closing D-13 and unblocking clean end-to-end RTMP/RTMPS/SRT ingest.

## Objective vs Outcome

**Objective:** Stop unconditionally emitting `-rtsp_transport tcp` for every input URL. This flag is an RTSP demuxer flag — today ffmpeg 7 silently ignores it for RTMP/SRT (with a warning on stderr), and stricter future ffmpeg versions are expected to reject it. D-13 locks this as a correctness fix.

**Outcome:** Both touched files gained a 3-line conditional. The Wave 0 `it.todo` stubs in `apps/api/tests/streams/ffmpeg-command-builder.test.ts` are now real assertions. The new `ffprobe.service.ts` branching is covered by 4 fresh tests that ride alongside the existing 8 FfprobeService tests. All 16 scoped tests pass.

## Before / After

### `apps/api/src/cameras/ffprobe.service.ts` (line 24)

```diff
- const cmd = `ffprobe -v quiet -print_format json -show_streams -rtsp_transport tcp "${streamUrl}"`;
+ const transportFlag = this.inputFlagsFor(streamUrl);
+ const cmd = `ffprobe -v quiet -print_format json -show_streams ${transportFlag}"${streamUrl}"`;
```

**New helper (private, near top of class):**

```ts
/** Returns the input-specific flags string for ffprobe. D-13 — only RTSP needs -rtsp_transport. */
private inputFlagsFor(streamUrl: string): string {
  if (streamUrl.startsWith('rtsp://')) return '-rtsp_transport tcp ';
  return '';
}
```

**New test-only export (bottom of file):**

```ts
export const __test__ = {
  inputFlagsFor: (service: FfprobeService, url: string): string =>
    (service as any).inputFlagsFor(url),
};
```

### `apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts` (around line 20)

```diff
- const cmd = ffmpeg(inputUrl)
-   .inputOptions(['-rtsp_transport', 'tcp'])
-   .output(outputUrl)
-   .outputFormat('flv');
+ const cmd = ffmpeg(inputUrl).output(outputUrl).outputFormat('flv');
+
+ if (shouldAddRtspTransport(inputUrl)) {
+   cmd.inputOptions(['-rtsp_transport', 'tcp']);
+ }
```

**New module-level predicate (before `buildFfmpegCommand`):**

```ts
/**
 * D-13: -rtsp_transport is an RTSP-only demuxer flag. Emit it only for
 * rtsp:// URLs. For rtmp/rtmps/srt/http(s) ffmpeg either ignores it with a
 * warning (today) or rejects it (stricter future versions).
 */
export function shouldAddRtspTransport(inputUrl: string): boolean {
  return inputUrl.startsWith('rtsp://');
}
```

## Rationale: Helper Extraction

Both files could have inlined the `startsWith('rtsp://')` check. They were extracted for two reasons:

1. **Testability without fluent-ffmpeg introspection.** fluent-ffmpeg's `.inputOptions()` stores args in an undocumented private array; asserting "inputOptions was called with X" from tests would require either spying on the prototype (brittle across versions) or hand-constructing a mock. An exported predicate lets the test pin down the branching logic without touching fluent-ffmpeg internals.

2. **Symmetry between the two files.** `ffprobe.service.ts` builds a shell string; `ffmpeg-command.builder.ts` calls a fluent-ffmpeg method. Having a same-named convention in both (`inputFlagsFor` on the class, `shouldAddRtspTransport` at module scope) means future readers — and anyone adding another protocol-specific flag (e.g. SRT mode, RTMP timeout) — know where to put it.

The D-13 plan anticipated this split (class-method for a Nest `@Injectable`, module-function for a stateless builder).

## Tasks Completed

| # | Name                                      | Commit (RED)      | Commit (GREEN)    | Files                                                                                      |
| - | ----------------------------------------- | ----------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| 1 | Protocol-branch `ffprobe.service.ts`      | `59e4667`         | `16ec86b`         | `apps/api/src/cameras/ffprobe.service.ts`, `apps/api/tests/cameras/ffprobe.test.ts`        |
| 2 | Protocol-branch `ffmpeg-command.builder`  | `26aa7c8`         | `588ab89`         | `apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts`, `apps/api/tests/streams/ffmpeg-command-builder.test.ts` |

Full TDD RED→GREEN cycle per task. No REFACTOR commits needed (helpers fell out of the plan as the right shape on first pass).

## Test Count Delta

| Test file                                    | Pre-19-02             | Post-19-02 | Net |
| -------------------------------------------- | --------------------- | ---------- | --- |
| `tests/cameras/ffprobe.test.ts`              | 8 passing             | 12 passing | +4  |
| `tests/streams/ffmpeg-command-builder.test.ts` | 4 `it.todo` stubs   | 4 passing  | +4 real assertions (Wave 0 stubs converted) |

Combined scoped run (`pnpm --filter @sms-platform/api test -- --run tests/cameras/ffprobe tests/streams/ffmpeg-command-builder`) → **16 pass / 0 fail** (1.06s).

Sibling `tests/streams/ffmpeg-command.test.ts` (5 existing tests against `buildFfmpegCommand`) also continues to pass — confirms the input-options reshuffle didn't regress copy/transcode selection.

## Verification Results

| Plan step | Status |
| --- | --- |
| 1. `pnpm ... test -- --run tests/cameras/ffprobe tests/streams/ffmpeg-command-builder` exits 0 | ✓ 16 pass |
| 2. 8 new/converted tests pass (4 per file) | ✓ |
| 3. `cmd.inputOptions(['-rtsp_transport', ...])` sits inside an `if` block | ✓ (`rg -B 2` confirms `if (shouldAddRtspTransport(inputUrl)) {` above) |
| 4. `-rtsp_transport tcp` in ffprobe.service.ts sits inside `inputFlagsFor` conditional | ✓ (inside `if (streamUrl.startsWith('rtsp://'))`) |
| 5. Full API test suite green | ⚠️ Scoped suite green. Full suite has **59 pre-existing failures** unrelated to 19-02 (test DB missing `PlaybackSession` table, prisma-mock wiring issues in `bulk-import` and `status/*` tests). Confirmed pre-existing via baseline `git stash` run. See `deferred-items.md`. |

## Acceptance Criteria

### Task 1
- [x] `rg "inputFlagsFor" apps/api/src/cameras/ffprobe.service.ts` → 4 matches (declaration + usage + 2 in __test__ export)
- [x] `rg "startsWith\('rtsp://'\)" apps/api/src/cameras/ffprobe.service.ts` → 1 match
- [x] `rg "Phase 19 — ffprobe protocol branching"` in test file → 1 match
- [x] 4 new tests pass
- [x] `this.redactUrl` usage unchanged (1 call, same as pre-edit)

### Task 2
- [x] `rg "shouldAddRtspTransport"` in builder → 2 matches (export + usage)
- [x] `rg "startsWith\('rtsp://'\)"` in builder → 1 match (inside `shouldAddRtspTransport`)
- [x] `if (shouldAddRtspTransport(inputUrl))` guard present around `cmd.inputOptions([...rtsp_transport...])`
- [x] 4 tests converted (no `it.todo` remaining in describe block)
- [x] Scoped test run exits 0

## Deviations from Plan

None for Rules 1-3. Plan executed exactly as specified.

**One scope observation (deferred, not fixed):** During Verification step 5 (full API test suite), 59 tests fail across unrelated files (bulk-import DTO, StatusService, OrgAdminGuard). All confirmed pre-existing via baseline run on HEAD~2. Logged to `deferred-items.md`. Scope boundary: these touch services this plan does not modify, so auto-fix rules do not apply.

## Threat Model Status

Threat register items from the plan:

| Threat ID | Status |
| --- | --- |
| T-19-02-01 (Tampering / command injection via ffprobe cmd string) | Unchanged — URL is still double-quoted and passes zod `.url()` at the DTO boundary (P01). The only string concatenation change is splicing a constant flag before the URL token; nothing from user input crosses into the flag itself. |
| T-19-02-02 (Log Injection via redactUrl bypass) | Unchanged — `rg "this\.redactUrl"` count is **1** (same as before). No log statement was touched by this plan. |

No new threat surface. No threat_flag section needed.

## Known Stubs

None. Both files now have fully-wired protocol branching; no placeholder data.

## Auth Gates Encountered

None.

## Self-Check: PASSED

**Files exist:**
- FOUND: `apps/api/src/cameras/ffprobe.service.ts` (modified)
- FOUND: `apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts` (modified)
- FOUND: `apps/api/tests/cameras/ffprobe.test.ts` (modified)
- FOUND: `apps/api/tests/streams/ffmpeg-command-builder.test.ts` (modified)
- FOUND: `.planning/phases/19-camera-input-validation-and-multi-protocol-support-rtmp-rtmp/deferred-items.md` (new)

**Commits exist (verified via `git log --oneline | grep 19-02`):**
- FOUND: `59e4667` test(19-02): add failing tests for ffprobe protocol branching
- FOUND: `16ec86b` feat(19-02): protocol-branch ffprobe.service.ts rtsp_transport flag
- FOUND: `26aa7c8` test(19-02): add failing tests for ffmpeg builder protocol branching
- FOUND: `588ab89` feat(19-02): protocol-branch ffmpeg-command.builder rtsp_transport flag
