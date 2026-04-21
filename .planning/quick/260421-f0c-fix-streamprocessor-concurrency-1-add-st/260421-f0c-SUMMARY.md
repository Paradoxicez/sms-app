---
phase: 260421-f0c
plan: 01
subsystem: api
tags: [bullmq, ffmpeg, nestjs, streams, cameras, concurrency, ffprobe]

# Dependency graph
requires:
  - phase: 11-camera-management
    provides: CamerasService.bulkImport, FfprobeService.probeCamera, Camera.codecInfo column
  - phase: 15-ffmpeg-resilience-camera-maintenance
    provides: StreamProcessor + StreamsService start/stop pipeline
provides:
  - StreamProcessor BullMQ concurrency raised to 50 (parallel multi-camera streaming on a single API instance)
  - StreamProbeProcessor wired end-to-end (Camera.codecInfo populated after CSV bulk import)
  - Cross-module BullMQ queue injection pattern (StreamsModule registers + exports BullModule, CamerasModule re-registers)
  - Background-worker DB write pattern using SystemPrismaService (RLS bypass — no CLS context in BullMQ workers)
affects: [16-stream-control-ui, 17-codec-policy, future transcode-decision logic, multi-camera UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BullMQ queue names use kebab-case (BullMQ v5 forbids `:` in queue names)"
    - "Best-effort probe — ffprobe failures stored as `codecInfo.error`, do NOT throw (no retry storms on unreachable cameras)"
    - "Cross-module queue injection — registerQueue in owning module + re-register in consumer module + export BullModule"
    - "Background processors use SystemPrismaService (no AsyncLocalStorage tenant context available in worker callbacks)"

key-files:
  created:
    - apps/api/src/streams/processors/stream-probe.processor.ts
    - apps/api/tests/streams/probe-processor.test.ts
  modified:
    - apps/api/src/streams/processors/stream.processor.ts
    - apps/api/src/streams/streams.module.ts
    - apps/api/src/cameras/cameras.module.ts
    - apps/api/src/cameras/cameras.service.ts
    - apps/api/tests/cameras/bulk-import.test.ts
    - apps/api/tests/cameras/camera-crud.test.ts
    - apps/api/tests/cameras/hierarchy.test.ts
    - apps/api/tests/cameras/maintenance.test.ts

key-decisions:
  - "Concurrency=50 chosen as a generous upper bound; FFmpeg processes are CPU-bound but the BullMQ slot is held only by an awaited Promise — 50 mirrors typical max-cameras-per-instance ceiling"
  - "Probe processor concurrency=5 (ffprobe is I/O-light but network-bound; 5 parallel probes balances responsiveness vs. burst-import load)"
  - "Probe failures recorded as data (codecInfo.error) instead of thrown errors — keeps unreachable cameras from triggering BullMQ retry storms"
  - "Use SystemPrismaService (RLS bypass) inside background workers — BullMQ callbacks have no HTTP context, so AsyncLocalStorage tenant resolution is unavailable"
  - "Queue name renamed `stream:probe` → `stream-probe` to satisfy BullMQ v5 validation (auto-fix during verification)"

patterns-established:
  - "BullMQ queue naming: kebab-case only (no colons, BullMQ v5 enforced)"
  - "Cross-module queue injection: owning module registers + exports BullModule; consumer module re-registers same name"
  - "Background-worker Prisma access: inject SystemPrismaService, not the tenant-scoped PrismaService"

requirements-completed: [QUICK-260421-f0c]

# Metrics
duration: ~30min (plan execution + orchestrator-applied auto-fix + verification)
completed: 2026-04-21
---

# Quick 260421-f0c: StreamProcessor Concurrency + Probe Pipeline Summary

**Raised BullMQ StreamProcessor concurrency 1→50 to unblock parallel multi-camera streaming, and wired a new StreamProbeProcessor so bulk-imported cameras get `codecInfo` populated within seconds.**

## Performance

- **Duration:** ~30 min (single task plan + post-merge auto-fix + verification)
- **Started:** 2026-04-21T10:55Z (approx)
- **Completed:** 2026-04-21T11:09Z (verification timestamp from API logs)
- **Tasks:** 1 (plus 1 orchestrator-applied auto-fix commit)
- **Files modified:** 10 (2 created, 8 modified)

## Accomplishments

- **Multi-camera streaming unblocked.** Verified 4 cameras (BKR02, BKR05, BKR06, cam1) transitioned `connecting → online` simultaneously at 11:09:13–11:09:28 with 4 concurrent FFmpeg processes and 4 SRS active streams (recv_bytes 13M–21M each).
- **Probe pipeline wired end-to-end.** New `StreamProbeProcessor` (concurrency=5) consumes `stream-probe` jobs, calls `FfprobeService.probeCamera`, persists `codecInfo` + `needsTranscode` via `SystemPrismaService`. Best-effort: ffprobe failures stored as `codecInfo.error` (no retry storms).
- **Refactored `bulkImport`.** Replaced the dynamic `new Queue('stream:probe', ...)` ad-hoc construction (which had no registered processor — orphan queue) with `@InjectQueue('stream-probe')` constructor injection.
- **4 unit tests for probe processor** (RED→GREEN): success path, HEVC `needsTranscode` flag, ffprobe error path, DB-error survival.
- **Cross-module queue injection pattern** documented and codified in module comments.

## Task Commits

1. **Task 1: StreamProcessor concurrency 1→50 + StreamProbeProcessor + queue wiring + 4 test fixtures + new probe-processor.test.ts** — `1800a7d` (fix)
2. **Auto-fix (orchestrator-applied during verification): rename queue `stream:probe` → `stream-probe` for BullMQ v5 compatibility** — `ff1cdc1` (fix)

_Total: 2 commits (1 main + 1 auto-fix). SUMMARY commit handled by orchestrator._

## Files Created/Modified

**Created (2):**
- `apps/api/src/streams/processors/stream-probe.processor.ts` — `@Processor('stream-probe', { concurrency: 5 })`. Calls `FfprobeService.probeCamera`, persists `codecInfo` + `needsTranscode` via `SystemPrismaService`. Best-effort error handling.
- `apps/api/tests/streams/probe-processor.test.ts` — 4 unit tests (success, HEVC transcode flag, ffprobe error → codecInfo.error, DB-error survival).

**Modified (8):**
- `apps/api/src/streams/processors/stream.processor.ts` — `@Processor('stream-ffmpeg', { concurrency: 50 })` (was implicit 1).
- `apps/api/src/streams/streams.module.ts` — Register `stream-ffmpeg` + `stream-probe` queues; provide `StreamProbeProcessor`; export `BullModule` for cross-module `@InjectQueue`.
- `apps/api/src/cameras/cameras.module.ts` — Re-register `stream-probe` (NestJS cross-module injection pattern).
- `apps/api/src/cameras/cameras.service.ts` — Inject `@InjectQueue('stream-probe') probeQueue?: Queue`, drop dynamic `new Queue(...)` construction in `bulkImport`. Optional injection guards unit-test environments where `BullModule` isn't bootstrapped.
- `apps/api/tests/cameras/bulk-import.test.ts` — Added 4th constructor arg.
- `apps/api/tests/cameras/camera-crud.test.ts` — Added 4th constructor arg.
- `apps/api/tests/cameras/hierarchy.test.ts` — Added 4th constructor arg.
- `apps/api/tests/cameras/maintenance.test.ts` — Updated for new constructor signature.

## Decisions Made

- **Concurrency=50 for StreamProcessor.** A live FFmpeg stream's promise resolves only on END/ERROR, so each running stream permanently holds a worker slot. 50 covers the practical max-cameras-per-instance ceiling without over-allocating.
- **Concurrency=5 for StreamProbeProcessor.** ffprobe is I/O-light but network-bound; 5 parallel probes responsive enough for bulk imports without saturating outbound RTSP connections.
- **Best-effort probe (errors as data, not exceptions).** Unreachable cameras during bulk import would otherwise trigger BullMQ exponential-backoff retry storms. Recording `codecInfo: { error: "..." }` lets the UI surface the issue and the operator retry on demand.
- **`SystemPrismaService` for background workers.** BullMQ workers have no HTTP request context, so `AsyncLocalStorage`-based tenant resolution (used by `PrismaService`) returns undefined. RLS-bypass is correct here — the worker already trusts the `cameraId` carried in the job payload.
- **Queue name `stream-probe` (kebab-case).** Forced by BullMQ v5 validation. See deviation below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Renamed queue `stream:probe` → `stream-probe` (BullMQ v5 forbids `:`)**
- **Found during:** Verification (orchestrator restarted API after merge).
- **Issue:** BullMQ v5 throws `Error: Queue name cannot contain :` at app boot. The plan's frontmatter and all 4 touch points specified `'stream:probe'` based on a convention that pre-dates BullMQ v5 validation. App refused to start.
- **Fix:** Renamed across 4 files: `streams.module.ts`, `stream-probe.processor.ts`, `cameras.module.ts`, `cameras.service.ts` (decorator, registerQueue, InjectQueue token, comments).
- **Files modified:** apps/api/src/streams/streams.module.ts, apps/api/src/streams/processors/stream-probe.processor.ts, apps/api/src/cameras/cameras.module.ts, apps/api/src/cameras/cameras.service.ts
- **Verification:** API booted cleanly; 4 cameras streamed concurrently (BKR02, BKR05, BKR06, cam1 → online at 11:09:13–11:09:28); 6 jobs in BullMQ active queue (vs the previous concurrency=1 limit); 4 FFmpeg processes confirmed via `ps aux | grep ffmpeg`.
- **Committed in:** `ff1cdc1` (orchestrator-applied edits, executor-committed).

---

**Total deviations:** 1 auto-fixed (1 blocking — BullMQ v5 validation).
**Impact on plan:** Auto-fix essential to make the plan's wiring boot. Pure rename (no logic change). The plan's `must_haves.artifacts.contains` patterns reference `'stream:probe'` — they should be re-read as `'stream-probe'` going forward. No scope creep.

## Issues Encountered

**3 cameras stuck — flagged as out-of-scope follow-up (NOT caused by this plan):**

| Camera                   | Status / failedReason                                    | Likely Root Cause                                                            |
| ------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| BKR03 (`b4bbe50a…`)      | failedReason: `"No input specified"`                     | FFmpeg got an empty input arg — possible `streamUrl` serialization bug       |
| BKR04 (`2ed69e51…`)      | failedReason: `"No input specified"`                     | Same as above                                                                |
| BKR07 (`fcc2b8ab…`)      | failedReason: `"Invalid transition: online → connecting"` | StatusService state machine doesn't allow this transition — separate bug    |

These are pre-existing bugs unrelated to the concurrency/probe fix. Recommend a follow-up `/gsd-quick` for both. The orchestrator's verification confirmed the **concurrency lock** (the actual production blocker) is resolved.

## Verification Status

**Concurrency fix — VERIFIED end-to-end** by orchestrator after merge:
- API logs: 4 cameras `connecting → online` simultaneously (11:09:13 BKR02, BKR05, BKR06; 11:09:28 cam1)
- `ps aux | grep ffmpeg`: 4 concurrent FFmpeg processes
- SRS API `/api/v1/streams`: 4 active streams with growing recv_bytes (13M–21M)
- BullMQ active queue: 6 jobs (proves the previous concurrency=1 limit is gone)

**Probe pipeline — PARTIALLY VERIFIED:**
- StreamProbeProcessor compiled, registered, and bound to `stream-probe` queue (no boot error)
- 4 unit tests GREEN (success / HEVC / ffprobe error / DB error)
- **End-to-end CSV import → `codecInfo` populated NOT yet user-tested.** Requires a fresh CSV import to fully exercise the probe pipeline. Tracked as user-side verification.

## Next Phase Readiness

- **Multi-camera streaming on a single API instance: UNBLOCKED.** Production-ready.
- **Bulk-import codec detection: WIRED.** Awaits user-side CSV import to confirm `codecInfo` populates as expected.
- **Follow-up quick task recommended:** Investigate the 3 stuck cameras (BKR03 "No input specified", BKR04 same, BKR07 "Invalid transition: online → connecting"). Both look like small fixes — empty `streamUrl` propagation and a StatusService transition gap.
- **Frontmatter drift:** This plan's frontmatter (`must_haves.artifacts.contains: "@Processor('stream:probe'"` etc.) references the old queue name. If the verifier or future planner re-reads the plan literally, those `contains` checks will fail. Either patch the plan in place or note in STATE.md that `stream:probe` → `stream-probe` is a documented rename.

## Self-Check: PASSED

**Files (10/10 exist on disk):**
- FOUND: apps/api/src/streams/processors/stream-probe.processor.ts
- FOUND: apps/api/tests/streams/probe-processor.test.ts
- FOUND: apps/api/src/streams/processors/stream.processor.ts
- FOUND: apps/api/src/streams/streams.module.ts
- FOUND: apps/api/src/cameras/cameras.module.ts
- FOUND: apps/api/src/cameras/cameras.service.ts
- FOUND: apps/api/tests/cameras/bulk-import.test.ts
- FOUND: apps/api/tests/cameras/camera-crud.test.ts
- FOUND: apps/api/tests/cameras/hierarchy.test.ts
- FOUND: apps/api/tests/cameras/maintenance.test.ts

**Commits (2/2 in git log):**
- FOUND: 1800a7d fix(260421-f0c-01): unblock multi-camera streaming + wire probe pipeline
- FOUND: ff1cdc1 fix(260421-f0c-02): rename queue stream:probe → stream-probe (BullMQ v5 forbids colon)

---
*Quick: 260421-f0c-fix-streamprocessor-concurrency-1-add-st*
*Completed: 2026-04-21*
