---
phase: quick-260421-g9o
plan: 01
subsystem: streams/processors
tags: [bugfix, defensive, bullmq, ffmpeg, stream-processor]
requires: []
provides:
  - StreamProcessor defensive guard against empty-data BullMQ jobs
affects:
  - apps/api/src/streams/processors/stream.processor.ts
tech-stack:
  added: []
  patterns:
    - Choke-point defense (log + silent-complete, no throw, no retry-storm)
key-files:
  created:
    - apps/api/tests/streams/stream-processor-guard.test.ts
  modified:
    - apps/api/src/streams/processors/stream.processor.ts
decisions:
  - Defensive-only fix; upstream race (BootRecoveryService / CameraHealthService / BullMQ jobId dedup) deferred
  - Guard returns (not throws) so BullMQ marks bogus jobs complete instead of retrying
metrics:
  duration: ~12 min
  tasks: 1
  files_created: 1
  files_modified: 1
  tests_added: 6
  completed: 2026-04-21
commit: 5cf6343
requirements: [BUG-260421-g9o]
---

# Quick Task 260421-g9o: StreamProcessor Undefined cameraId Guard Summary

Adds a defensive guard at the top of `StreamProcessor.process()` that rejects BullMQ jobs with empty `cameraId` or `rtspUrl` — logs an error naming the bad fields plus the jobId, then returns without throwing so BullMQ marks the job complete and does NOT retry into a storm. Bogus jobs never reach StatusService or FFmpeg, so cameras no longer stick in `connecting` and the misleading "Processing stream job for camera undefined" log line disappears.

## What Changed

**Guard added** (`apps/api/src/streams/processors/stream.processor.ts`, +11 lines inside `process()`):

```typescript
if (!cameraId || !rtspUrl) {
  this.logger.error(
    `Refusing job with empty data: cameraId=${cameraId ?? '<undefined>'}, rtspUrl=${rtspUrl ? 'set' : 'empty'}, jobId=${job.id}`,
  );
  return;
}
```

Placed as the FIRST statements inside `process()` — BEFORE `streamKey`/`srsHost`/`outputUrl` derivations, BEFORE the log line, BEFORE `statusService.transition`, and BEFORE `ffmpegService.startStream`. Zero changes to the `@Processor` decorator, concurrency setting, `MAX_BACKOFF_MS`, `calculateBackoff`, or the `StreamJobData` interface.

**Tests added** (`apps/api/tests/streams/stream-processor-guard.test.ts`, 6 specs, 117 lines):

1. Refuses job when `cameraId` is `undefined` (no throw, no side effects)
2. Refuses job when `cameraId` is empty string
3. Refuses job when `rtspUrl` is `undefined`
4. Refuses job when `rtspUrl` is empty string
5. Processes a valid job normally (guard is non-invasive — asserts `statusService.transition` + `ffmpegService.startStream` wiring + correct rtmp outputUrl shape)
6. Guard path does not throw (so BullMQ marks job complete, no retry)

`beforeEach` unsets `SRS_HOST` to keep the happy-path URL assertion (`rtmp://localhost:1935/live/org-1/cam-1`) deterministic regardless of the shell environment.

## Why Defensive-Only

The upstream race that produces empty-data jobs is still unknown — candidate enqueue sites include `BootRecoveryService`, `CameraHealthService`, `SrsRestartDetector`, `StreamsService`, and BullMQ's jobId dedup. Tracing the exact producer requires reproducing the race in staging and is out of scope for a quick task.

The guard is 5 lines at the choke point and fixes every current and future "undefined data" scenario regardless of which upstream site is to blame. It is non-invasive (happy path unchanged, verified by test 5) and does not throw (so BullMQ does not retry-storm on bogus payloads). Upstream investigation is tracked in memory note 260421 — `StreamProcessor undefined cameraId bug`.

## Verification

- `cd apps/api && pnpm test -- stream-processor-guard` → 6/6 green
- `cd apps/api && pnpm test -- stream` (full stream suite regression) → 65/65 green across 7 test files (probe-processor, stream-lifecycle, reconnect, ffmpeg-command, profile-builder, stream-processor-guard, plus one more)
- Guard ordering check: `Refusing job` string at line 53, `statusService.transition` at line 64 — guard precedes the transition as required

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: `apps/api/src/streams/processors/stream.processor.ts` (modified, guard at line 53)
- FOUND: `apps/api/tests/streams/stream-processor-guard.test.ts` (created)
- FOUND: commit `5cf6343` in `git log --oneline`
