---
phase: quick-260425-wy8
plan: 01
subsystem: srs-callbacks
tags: [snapshot, srs, on-hls, on-publish, ffmpeg, race-fix]
requires:
  - "apps/api/src/srs/srs-callback.controller.ts (existing onHls handler)"
  - "apps/api/src/cameras/snapshot.service.ts refreshOneFireAndForget"
  - "config/srs.conf on_hls hook (already wired to /api/srs/callbacks/on-hls)"
provides:
  - "Race-free snapshot trigger that fires only after SRS has written the first HLS segment"
affects:
  - "apps/api/src/srs/srs-callback.controller.ts"
  - "apps/api/tests/srs/callbacks.test.ts"
tech_stack:
  added: []
  patterns:
    - "first-segment guard: `if (parsed.data.seq_no === 0)` trips snapshot exactly once per session"
    - "fire-and-forget chained off lifecycle hook (no await, no try/catch — service swallows internally)"
key_files:
  created: []
  modified:
    - apps/api/src/srs/srs-callback.controller.ts
    - apps/api/tests/srs/callbacks.test.ts
decisions:
  - "Trigger on seq_no===0 (not <=1 or <2) — exact-zero is the cleanest first-segment signal SRS v6 emits"
  - "Single-arg call refreshOneFireAndForget(cameraId) — service resolves orgId internally via prisma; matches existing call shape"
  - "Test the realistic .ts segment extension stripping (cam-1-0.ts), not the .m3u8 playlist extension — SRS v6 on_hls posts the segment file in body.stream, and parseStreamKey's existing -{seq} suffix strip cannot disambiguate cam-1.m3u8 from cam-{1}.m3u8 anyway"
metrics:
  duration_seconds: 326
  duration_human: "5 min 26 sec"
  tasks_completed: 1
  files_modified: 2
  tests_added: 5
  commits: 1
  completed_at: "2026-04-25T16:54:40Z"
commit: a4c517d
---

# Quick Task 260425-wy8: Switch snapshot trigger from on_publish to on_hls (seq_no===0) Summary

Snapshot capture moved from the SRS `on_publish` callback (where SRS has not yet written the `.m3u8` playlist, so every FFmpeg snapshot 404'd) to the `on_hls` callback gated on `seq_no === 0` — the earliest moment SRS guarantees a playable playlist + first segment on disk.

## What Shipped

| Layer | Change |
|-------|--------|
| `apps/api/src/srs/srs-callback.controller.ts` | Removed `snapshotService?.refreshOneFireAndForget(...)` from BOTH `onPublish` branches (push at L116, live at L184). Inserted a `seq_no === 0` guarded snapshot trigger inside `onHls`, AFTER the live-mode gate / cameraId resolution and BEFORE the recording-archive try block. |
| `apps/api/tests/srs/callbacks.test.ts` | Switched controller construction to the full positional signature with `mockSnapshotService` + `mockRecordingsService`. Added 5 new on_hls behavior tests (seq_no===0 fires; seq_no>0 skipped; .ts segment extension stripping; push-mode skip; code:0 ACK preserved with no active recording). Updated the existing on_publish assertion to require the snapshot mock NOT to be called. |

NO changes to:
- `config/srs.conf` (on_hls hook already wired since the recording-archive feature)
- `SnapshotService` internals
- Module DI wiring
- `srs-callback-push.test.ts` (verified untouched — no `snapshot` references in that file)
- Frontend, DB schema, recording archival path

## Why The Fix Works

**Before (broken):** SRS v6 fires `on_publish` the instant the publisher TCP-handshake completes — BEFORE any HLS encoding has happened. The HLS muxer needs ~1× `hls_fragment` (2s in our config) before it writes the first `.ts` segment, and only THEN writes the `.m3u8` playlist. Snapshot FFmpeg `-i http://localhost:8080/live/{org}/{cam}.m3u8` therefore got `Server returned 404 Not Found` on every cold-publish, and every fire-and-forget snapshot attempt failed silently in the SnapshotService catch handler.

**After (fixed):** SRS only emits `on_hls` AFTER it has written a segment to disk AND updated the playlist. The first segment of each session arrives with `seq_no === 0` (deterministic per SRS v6 spec). At that moment:

1. `./objs/nginx/html/live/{org}/{cam}.m3u8` exists and lists at least one segment.
2. `./objs/nginx/html/live/{org}/{cam}-0.ts` exists on disk.
3. The HTTP server on port 8080 will return `200 OK` for the playlist URL.

Snapshot FFmpeg can now read the playlist on its first try — no retry/backoff logic needed inside SnapshotService. Subsequent on_hls callbacks (`seq_no = 1, 2, 3, ...`) are gated out by the strict `=== 0` check, so we don't spawn one FFmpeg per segment.

The recording-archive path (which the existing `onHls` handler already implemented) is wholly unaffected — the snapshot trigger is inserted ABOVE the `try` block and the snapshot service swallows all errors fire-and-forget, so a failed snapshot cannot interfere with archival or with the `{code: 0}` ACK to SRS.

## Verification

**Automated (this commit):**

- `pnpm --filter @sms-platform/api build` → SWC compiles 162 files, 0 errors.
- `pnpm exec vitest run tests/srs/callbacks.test.ts tests/srs/srs-callback-push.test.ts` → **23 passed** (16 in callbacks.test.ts including 5 new on_hls behavior tests + 7 in srs-callback-push.test.ts).
- `grep -n refreshOneFireAndForget apps/api/src/srs/srs-callback.controller.ts` → exactly ONE call site (line 327, inside `onHls` under `seq_no === 0` guard); the only other match is in a comment.
- `git diff --name-only HEAD~1` → exactly 2 files: `apps/api/src/srs/srs-callback.controller.ts`, `apps/api/tests/srs/callbacks.test.ts`.

**Live verification (post-deploy by user, not part of this commit):**

1. Tail `/tmp/sms-api.log | grep -E '(SnapshotService|on_publish|on_hls|404|Snapshot refreshed)'` while restarting an online camera.
2. Confirm the sequence:
   - SRS posts `on_publish` → API responds `{code:0}` → status transitions to online (NO snapshot log entry yet — correct).
   - ~2s later SRS produces the first `.ts` segment → posts `on_hls` with `seq_no=0` → API fires `refreshOneFireAndForget(cameraId)`.
   - SnapshotService spawns `ffmpeg -i http://localhost:8080/live/{org}/{cam}.m3u8 -frames:v 1 -f image2 -` → playlist EXISTS → JPEG written to MinIO `snapshots/{cameraId}.jpg` → `Camera.thumbnail` updated.
3. `grep "Snapshot refreshed for camera" /tmp/sms-api.log` shows exactly ONE entry per stream session (not one per segment).
4. `grep "Server returned 404" /tmp/sms-api.log` from the snapshot path shows zero new entries after restart.
5. UI `/cameras` card view → camera card shows the freshly-grabbed JPEG thumbnail.

## Deviations from Plan

### Deviation 1 (Rule 1 — Bug in test expectation)

**Found during:** RED→GREEN verification, on the `.m3u8` extension-stripping test.

**Issue:** The plan's test brief asserted that `parseStreamKey` would resolve `org-1/cam-1.m3u8` to `cameraId='cam-1'`. In reality the existing parser strips both the extension AND the trailing `-{seq}` segment number when an extension was present, so `cam-1.m3u8` becomes `cam` (the parser cannot distinguish "cam-1 with no segment number" from "cam with segment number 1"). This is a pre-existing parser behavior used for on_play segment events — not something this task should change.

**Fix:** Re-aimed the test at the actual real-world payload — SRS v6 on_hls posts the segment filename (`cam-1-0.ts`) in `body.stream`, not the playlist filename. Updated the test's stream input to `org-1/cam-1-0.ts` and renamed it `strips .ts segment suffix when resolving cameraId for snapshot`. The plan's interface section had already noted this ("the cameraId returned for the seq_no===0 segment-event payload is already clean") — the example value `cam-1.m3u8` in the plan's behavior section was an internal inconsistency.

**Files modified:** `apps/api/tests/srs/callbacks.test.ts` (test rename + stream input change). **Production code unaffected.**

**Commit:** included in atomic commit `a4c517d`.

## Deferred Issues

5 pre-existing TypeScript errors surfaced by `pnpm exec tsc --noEmit` in unrelated files — verified to exist on commit `041b1ed` (parent of this work) before any of my edits:

- `src/account/avatar/avatar.controller.ts:55` — `Express.Multer` namespace not exported (TS2694)
- `src/cameras/cameras.controller.ts:62` — `PlaybackService | null` not assignable to `PlaybackService` (TS2322)
- `src/cluster/cluster.gateway.ts:15` — `server` has no initializer (TS2564)
- `src/recordings/minio.service.ts:9` — `client` has no initializer (TS2564)
- `src/status/status.gateway.ts:16` — `server` has no initializer (TS2564)

These are out of scope (none touch the SRS callback path) and the production build (`pnpm --filter @sms-platform/api build`, which uses `nest build` → SWC) succeeds cleanly with all 162 files compiled. The errors are tsc-strict-mode warnings that the SWC pipeline does not enforce.

## Self-Check: PASSED

**Files exist:**
- `/Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app/.claude/worktrees/agent-ae73dba5061884172/apps/api/src/srs/srs-callback.controller.ts` — FOUND (modified)
- `/Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app/.claude/worktrees/agent-ae73dba5061884172/apps/api/tests/srs/callbacks.test.ts` — FOUND (modified)

**Commit exists:**
- `a4c517d` — `fix(quick-260425-wy8-01): move snapshot trigger from on_publish to on_hls (seq_no===0)` — FOUND in `git log --oneline -3`.

**Behavior assertions verified by passing tests:**
- on_publish (live mode, push mode) does NOT call refreshOneFireAndForget — PASS
- on_hls seq_no=0 calls refreshOneFireAndForget('cam-1') exactly once — PASS
- on_hls seq_no=1,2,47 does NOT call it — PASS
- on_hls .ts segment extension stripping — PASS
- on_hls push-mode payload does NOT call it — PASS
- on_hls returns {code:0} with no active recording — PASS
- Existing srs-callback-push.test.ts unmodified, all 7 tests still pass — PASS
