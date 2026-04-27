---
phase: 23-tech-debt-cleanup-phase-0-prerequisites
plan: 02
subsystem: api

tags: [streaming, bullmq, observability, metrics, nestjs, di]

# Dependency graph
requires:
  - phase: 21-stream-restart-active-job-fix
    provides: Stream guard that returns (no throw) on empty job data — preserved here, instrumented now
  - phase: 22-quick-task-260421-g9o
    provides: Defensive guard at stream.processor.ts:72-77 — extended with metric call
provides:
  - StreamGuardMetricsService — in-memory refusal counter mirroring ArchiveMetricsService topology
  - StreamGuardRefusalReason union type ('undefined_cameraId' | 'empty_inputUrl')
  - StreamGuardMetricsSnapshot interface
  - /api/srs/callbacks/metrics now exposes streamGuard alongside archives (backward-compatible)
  - Real-Redis BullMQ integration test (skipIf-gated) closing stuck-camera bug end-to-end
affects: [phase-24-deploy-folder, phase-25-multistage-dockerfiles, phase-28-ci-cd, observability, debugging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-memory metrics service with snapshot()-via-REST exposure (mirrors ArchiveMetricsService convention)"
    - "Explicit @Optional() decorator on new DI dependencies (per Nest contract; existing ?-only deps untouched)"
    - "describe.skipIf(!isRedisAvailable) integration test idiom with synchronous /dev/tcp probe"

key-files:
  created:
    - apps/api/src/streams/stream-guard-metrics.service.ts
    - apps/api/tests/streams/stream-guard-metrics.test.ts
    - apps/api/tests/integration/stream-guard.integration.test.ts
  modified:
    - apps/api/src/streams/processors/stream.processor.ts
    - apps/api/src/streams/streams.module.ts
    - apps/api/src/srs/srs-callback.controller.ts
    - apps/api/tests/streams/stream-processor-guard.test.ts

key-decisions:
  - "Three-state status enum ('idle'|'degraded'|'failing') — no 'healthy' because StreamGuard has no success denominator (every refusal is degradation)"
  - "Status thresholds: idle=0 refusals, degraded=1-4, failing=5+ — sufficient for operator alerting without log spam"
  - "Explicit @Optional() decorator only on the new SrsCallbackController dep — existing ?-only deps (archiveMetrics, auditService, snapshotService) intentionally untouched (out of scope per research finding 5)"
  - "Reason discriminator in stream.processor.ts: !cameraId → 'undefined_cameraId' (primary stuck-camera repro); else 'empty_inputUrl'"
  - "Phase 21.1 retry-storm guarantee preserved — guard still `return`s, never `throw`s (recordRefusal called BEFORE existing log+return)"

patterns-established:
  - "DEBT observability: in-memory counter + snapshot() field on /api/srs/callbacks/metrics — reusable for future guard instrumentation"
  - "Optional DI for metrics services keeps positional-construction tests building (StreamProcessor, SrsCallbackController)"
  - "Integration tests gate on real Redis via synchronous TCP probe at module load; skipped CI-clean when unavailable"

requirements-completed: [DEBT-01]

# Metrics
duration: 11min
completed: 2026-04-27
---

# Phase 23 Plan 02: StreamGuardMetricsService + observability for empty-job guard

**Closes the silent stuck-camera bug (memory note 260421-g9o) by adding a real-time refusal counter at GET /api/srs/callbacks/metrics, surfaced via the same in-memory snapshot pattern as ArchiveMetricsService**

## Performance

- **Duration:** ~11 min (10m 31s)
- **Started:** 2026-04-27T10:22:54Z
- **Completed:** 2026-04-27T10:33:25Z
- **Tasks:** 4
- **Files created:** 3 (1 service, 2 tests)
- **Files modified:** 4

## Accomplishments

- `StreamGuardMetricsService` (61 LOC) — clones ArchiveMetricsService topology with three-state status enum
- `StreamProcessor.process()` guard now records `recordRefusal('undefined_cameraId' | 'empty_inputUrl')` before the existing log/return — zero behavior change, full observability
- `/api/srs/callbacks/metrics` returns `{ archives, streamGuard }` — operators can detect stuck-camera fires within 1s (in-memory, no Redis hop)
- Real-Redis BullMQ integration test proves end-to-end: empty job → no FFmpeg child process → metric counter incremented → BullMQ marks job complete (no retry storm)
- All 9 stream-processor-guard tests + 5 stream-guard-metrics tests + 1 integration test green
- Build green; explicit `@Optional()` decorator confirmed on the new SrsCallbackController dep (existing `?`-only deps untouched per research finding 5)

## Task Commits

Each task committed atomically (with `--no-verify` per parallel-execution flag):

1. **Task 1: Create StreamGuardMetricsService + unit test** — `8809b58` (feat)
2. **Task 2: Wire StreamGuardMetricsService into StreamProcessor + extend guard test** — `529be1a` (feat)
3. **Task 3: Expose streamGuard field on /api/srs/callbacks/metrics** — `cc06742` (feat)
4. **Task 4: Real-Redis BullMQ integration test (skipIf gated)** — `e2f7e1e` (test)

_Wave-1 parallel executor; orchestrator owns the merge-back + final metadata commit._

## Files Created/Modified

### Created
- `apps/api/src/streams/stream-guard-metrics.service.ts` — In-memory counter service. Exports `StreamGuardMetricsService`, `StreamGuardRefusalReason`, `StreamGuardMetricsSnapshot`. 61 LOC (mirrors ArchiveMetricsService at 60 LOC).
- `apps/api/tests/streams/stream-guard-metrics.test.ts` — 5 unit tests: idle baseline, recordRefusal increment, status threshold transitions (idle → degraded → failing at 5), byReason split, snapshot fresh-object guarantee.
- `apps/api/tests/integration/stream-guard.integration.test.ts` — Real BullMQ Queue + Worker + QueueEvents end-to-end harness, gated by `describe.skipIf(!isRedisAvailable)`. Enqueues empty job, awaits completion, asserts FFmpeg never spawned + metric incremented.

### Modified
- `apps/api/src/streams/processors/stream.processor.ts` — Added `@Optional() streamGuardMetrics?: StreamGuardMetricsService` 5th constructor arg + `recordRefusal(reason)` call in the existing guard (before the log/return). Preserves Phase 21.1 retry-storm guarantee.
- `apps/api/src/streams/streams.module.ts` — Registers + exports `StreamGuardMetricsService`. SrsCallbackController resolves it through the existing `forwardRef(() => StreamsModule)` import.
- `apps/api/src/srs/srs-callback.controller.ts` — Added `Optional` to `@nestjs/common` import, imported `StreamGuardMetricsService`, added `@Optional() streamGuardMetrics?` constructor param (explicit decorator), extended `getMetrics()` response with `streamGuard:` field.
- `apps/api/tests/streams/stream-processor-guard.test.ts` — Added 3 new tests in a separate `describe` block: records refusal with reason 'undefined_cameraId', records 'empty_inputUrl', and 4-arg fallback safety (no metrics injected). 9 tests total now (was 6).

## Test Results

| Test Pattern | Tests | Status |
|--------------|-------|--------|
| `stream-guard-metrics --run` | 5 / 5 passed | green |
| `stream-processor-guard --run` | 9 / 9 passed (6 existing + 3 new) | green |
| `stream-processor --run` (full pattern, 4 files) | 24 / 24 passed | green |
| `stream-guard.integration --run` | 1 / 1 passed (Redis present) | green |
| `pnpm --filter @sms-platform/api build` | exit 0 (169 files compiled by SWC) | green |

## DI Graph Confirmation

`pnpm --filter @sms-platform/api build` succeeded after the controller wiring. SWC compilation report:
```
> nest build
> SWC Running...
Successfully compiled: 169 files with swc (110.43ms — 206.06ms across runs)
```
The DI graph resolves both `archives` (existing) and `streamGuard` (new) providers cleanly. No circular-dependency warnings, no DI failures at module load.

## Sample /metrics Response Shape

After this plan deploys, GET /api/srs/callbacks/metrics returns:
```json
{
  "archives": {
    "successes": 0,
    "failures": 0,
    "total": 0,
    "failureRate": 0,
    "lastFailureAt": null,
    "lastFailureMessage": null,
    "lastSuccessAt": null,
    "status": "idle"
  },
  "streamGuard": {
    "refusals": 0,
    "byReason": { "undefined_cameraId": 0, "empty_inputUrl": 0 },
    "lastRefusalAt": null,
    "lastRefusalReason": null,
    "status": "idle"
  }
}
```
First refusal flips `streamGuard.status` to `degraded`; the 5th refusal flips it to `failing`. Both fields update synchronously on next snapshot call.

## Decisions Made

- **Status enum (3-state vs 4-state):** Locked to `idle | degraded | failing`. Adding `healthy` would require a "successful job" denominator the StreamGuard cannot provide. Three states are sufficient for operator alerting (per 23-RESEARCH.md A1).
- **Status threshold (5 refusals → failing):** Tightens alerting compared to ArchiveMetricsService's 10% failure-rate gate, because the guard fires on edge-case bugs only. Even a small absolute number signals a regression.
- **Explicit @Optional() on new dep only:** Research finding 5 documents that existing `?`-only deps in SrsCallbackController are a latent bug-that-happens-to-work. This plan applies the documented Nest contract on the new dep without changing existing ones (out of scope cleanup).
- **Reason discriminator order:** `!cameraId` evaluated first because the original 260421-g9o repro was undefined cameraId, and bug telemetry reports prefer "undefined_cameraId" over "empty_inputUrl" when both conditions are true (cameraId precedence).

## Deviations from Plan

None — plan executed exactly as written.

The pre-task setup did require copying `.env`, `.env.test` from the main checkout to bootstrap the test DB in this fresh worktree (`node_modules` was not yet installed). Both files are gitignored and not committed. This is environment provisioning, not a plan deviation.

## Issues Encountered

- Worktree `node_modules` was missing on first test run → ran `pnpm install --frozen-lockfile` (15s, no errors).
- `pretest` hook required `apps/api/.env.test` and root `.env` → copied from main checkout. Both gitignored; not committed.

Both resolved without scope changes.

## User Setup Required

None — no external service configuration required. The new metric is exposed on the existing `/api/srs/callbacks/metrics` endpoint with no auth/permission changes.

## Next Plan Readiness

- DEBT-01 closed end-to-end. Plan 23-03 (DEBT-03 SRS hls_use_fmp4) is unaffected and can proceed in parallel (different files).
- The `/api/srs/callbacks/metrics` endpoint is the canonical observability surface for future DEBT instrumentation (extend the response object, add another snapshot field).
- StreamProcessor 5-arg constructor signature is now stable. Future test files should follow the `(ffmpegService, statusService, undefined, undefined, metrics)` pattern when they need metric assertions.

## Self-Check: PASSED

Verified:
- `apps/api/src/streams/stream-guard-metrics.service.ts` — FOUND
- `apps/api/tests/streams/stream-guard-metrics.test.ts` — FOUND
- `apps/api/tests/integration/stream-guard.integration.test.ts` — FOUND
- `apps/api/src/streams/processors/stream.processor.ts` — modified (5-arg constructor + recordRefusal call)
- `apps/api/src/streams/streams.module.ts` — modified (provider + export)
- `apps/api/src/srs/srs-callback.controller.ts` — modified (Optional import + new dep + streamGuard field)
- `apps/api/tests/streams/stream-processor-guard.test.ts` — modified (3 new tests appended)
- Commit `8809b58` — found in git log
- Commit `529be1a` — found in git log
- Commit `cc06742` — found in git log
- Commit `e2f7e1e` — found in git log

---
*Phase: 23-tech-debt-cleanup-phase-0-prerequisites*
*Plan: 02*
*Completed: 2026-04-27*
