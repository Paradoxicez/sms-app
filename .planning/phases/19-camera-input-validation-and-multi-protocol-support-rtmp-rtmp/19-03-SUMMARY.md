---
phase: 19
plan: 03
subsystem: cameras + streams + srs (async probe pipeline)
tags: [wave-1, probe-pipeline, codec-info, srs-callback, retry-endpoint, d-01, d-02, d-04, d-06, d-07]
dependency_graph:
  requires:
    - "apps/api/src/cameras/types/codec-info.ts (P00 — CodecInfo tagged union + ProbeJobData)"
    - "apps/api/src/streams/processors/stream-probe.processor.ts (pre-19 baseline processor)"
  provides:
    - "apps/api/src/srs/srs-api.service.ts.getStream(streamKey) + SrsStreamInfo"
    - "apps/api/src/streams/processors/stream-probe.processor.ts (tagged-union shape + guard + normalizeError + srs-api branch)"
    - "apps/api/src/cameras/cameras.service.ts.enqueueProbeFromSrs + enqueueProbeRetry"
    - "POST /api/cameras/:id/probe (202 Accepted) — UI retry endpoint (D-06)"
    - "SRS on-publish callback → probe:{cameraId} with source=srs-api + delay=1000ms"
  affects:
    - "apps/web/ — P05 4-state cell can now observe pending → success|failed transitions"
tech_stack:
  added: []
  patterns:
    - "Fire-and-forget probe enqueue after DB commit (BullMQ add() resolves on Redis write)"
    - "jobId: probe:{cameraId} for idempotency — merges create/on-publish/retry"
    - "forwardRef cycle-breaking (CamerasModule ↔ StreamsModule ↔ SrsModule)"
    - "9-pattern normalizeError dictionary + 80-char truncation (T-19-04 info-disclosure)"
key_files:
  created: []
  modified:
    - apps/api/src/srs/srs-api.service.ts
    - apps/api/src/srs/srs.module.ts
    - apps/api/src/srs/srs-callback.controller.ts
    - apps/api/src/streams/processors/stream-probe.processor.ts
    - apps/api/src/streams/streams.module.ts
    - apps/api/src/cameras/cameras.service.ts
    - apps/api/src/cameras/cameras.module.ts
    - apps/api/src/cameras/cameras.controller.ts
    - apps/api/tests/cameras/stream-probe.test.ts
    - apps/api/tests/srs/srs-callback.test.ts
decisions:
  - "SystemPrismaService injected as OPTIONAL constructor arg on CamerasService so existing positional test harnesses (bulk-import, hierarchy, maintenance, camera-crud) still construct without touching those files — plan explicitly forbids modifying camera-crud.test.ts."
  - "Three-way forwardRef (CamerasModule ↔ StreamsModule ↔ SrsModule) chosen over moving SrsApiService into a standalone module — minimal blast radius, existing exports preserved."
  - "normalizeError 'Stream not found' → 'Stream path not found' — the UI-SPEC dictionary pattern maps both 404 and 'Stream not found' to the same canonical phrase, keeping srs-api null-match aligned with ffprobe 404 behavior."
  - "Dedup assertion for jobId kept at the cameras.service layer (where add() is called). Tests in srs-callback.test.ts assert the controller funnels through enqueueProbeFromSrs; the BullMQ merge itself is a framework contract, not a code path we test directly."
metrics:
  duration_minutes: ~25
  tasks_completed: 5
  commits: 5
  completed_date: 2026-04-22
---

# Phase 19 Plan 03: Async Probe Pipeline Summary

Wired the full async probe pipeline from three trigger points (createCamera, SRS on-publish, UI retry) into a single BullMQ job with `jobId: probe:{cameraId}` dedup. Extended `StreamProbeProcessor` to write the P00 `CodecInfo` tagged-union shape (pending → success | failed), added the MEMORY.md defensive guard, implemented the 9-pattern `normalizeError` dictionary (T-19-04 info-disclosure mitigation), and added the source='srs-api' branch that pulls ground truth from SRS `/api/v1/streams`. Added `POST /api/cameras/:id/probe` (202) for the UI's failed-probe retry icon. 18 tests converted from it.todo to passing assertions.

## What Was Built

### SrsApiService.getStream (Task 1)

`apps/api/src/srs/srs-api.service.ts` gains:

- `SrsStreamInfo` interface — `{ video?, audio? }` with codec, profile, level, width, height, sample_rate, channel
- `async getStream(streamKey: string): Promise<SrsStreamInfo | null>` — wraps existing `getStreams()`, finds a single stream by key, handles BOTH SRS name formats (`app=live, name=orgId/cameraId` OR `app=live/orgId, name=cameraId`) per RESEARCH Pitfall 3, returns `null` on not-found or SRS unreachable

No new HTTP endpoint on SRS — the existing `/api/v1/streams` response is filtered locally.

### StreamProbeProcessor rewrite (Task 2)

`apps/api/src/streams/processors/stream-probe.processor.ts` now:

1. Imports shared `ProbeJobData` + `CodecInfo` types from `cameras/types/codec-info` (deletes local interface)
2. Injects `SrsApiService` as third constructor arg
3. Refuses jobs with empty `cameraId` or `streamUrl` (mirror of `stream.processor.ts:47-56`, MEMORY.md 260421-g9o defensive guard)
4. Writes `status: 'pending'` FIRST so the UI spinner appears immediately
5. Branches on `job.data.source`:
   - `'ffprobe'` (default) — existing ffprobe pull, writes tagged-union with `source: 'ffprobe'`
   - `'srs-api'` — calls `srsApi.getStream(${orgId}/${cameraId})`, writes `video.profile/level` from SRS response
6. Runs `normalizeError` BEFORE writing `codecInfo.error` — 9 patterns + 80-char truncation (see §Verification Results)

`apps/api/src/streams/streams.module.ts` imports `SrsModule` (via `forwardRef` because of the eventual cycle introduced by Task 4).

### cameras.service (Task 3)

`apps/api/src/cameras/cameras.service.ts`:

- `createCamera` — after DB commit, fire-and-forget enqueues `probe-camera` with `jobId: probe:${camera.id}`. BullMQ `add()` resolves on Redis write (not job run), so the HTTP response is not blocked.
- `bulkImport` — existing enqueue loop updated to include `jobId: probe:${camera.id}` for cross-trigger dedup (previously lacked it).
- **New** `enqueueProbeFromSrs(cameraId, orgId, opts?)` — called by SRS on-publish. Uses `SystemPrismaService` (optional constructor arg) to look up `streamUrl` because the callback runs without CLS context. Enqueues with `source: 'srs-api'` + optional delay.
- **New** `enqueueProbeRetry(cameraId, streamUrl, orgId)` — called by POST `/api/cameras/:id/probe`. Reuses the `ffprobe` source path.
- `SystemPrismaService` added as **optional** constructor arg to preserve compatibility with all 5 existing positional test harnesses (bulk-import, hierarchy, maintenance, camera-crud, and any new 19-01 work).

### srs-callback.controller (Task 4)

`apps/api/src/srs/srs-callback.controller.ts`:

- Constructor grows 5th arg: `@Inject(forwardRef(() => CamerasService))`
- `onPublish` — after `statusService.transition(online)`, calls `camerasService.enqueueProbeFromSrs(cameraId, orgId, { delay: 1000 })`. The 1s delay lets SRS populate `/api/v1/streams` before the worker fetches (RESEARCH Pitfall 3).
- Enqueue wrapped in try/catch so SRS still receives `{ code: 0 }` if the queue throws (required to allow the publish).

Module cycle (`CamerasModule` → `StreamsModule` → `SrsModule` → `CamerasModule`) broken with three `forwardRef` entries — no existing exports or providers moved.

### cameras.controller (Task 5)

`apps/api/src/cameras/cameras.controller.ts`:

- **New** `@Post('cameras/:id/probe')` with `@HttpCode(202)` at `/api/cameras/:id/probe`
- Calls `findCameraById` (tenancy-scoped → cross-org 404) then `enqueueProbeRetry`
- Route registers under `@Controller('api')` with inline `cameras/` prefix (matches `test-connection` and `bulk-import` convention) so the UI's `/api/cameras/${id}/probe` hits without rewriting
- Does NOT touch existing `cameras/:id/test-connection` (D-18 forbids mixing — test-connection stays for post-save diagnostic)

## Deviations from Plan

### [Rule 3 - Blocking] SystemPrismaService injection on CamerasService

- **Found during:** Task 3, `enqueueProbeFromSrs`
- **Issue:** Plan sketched `this.prisma.camera.findUnique` for the streamUrl lookup. `PrismaService` here uses the `app_user` DB role which has RLS enforced; SRS on-publish callback runs without CLS context, so the query would return null 100% of the time.
- **Fix:** Added `SystemPrismaService` as an OPTIONAL 5th constructor arg and fall back to `this.prisma` when absent. `PrismaModule` is `@Global()` so no module change needed.
- **Files modified:** apps/api/src/cameras/cameras.service.ts
- **Commit:** 529b046

### [Rule 3 - Blocking] Module cycle via on-publish → CamerasService

- **Found during:** Task 4, SrsModule import
- **Issue:** Plan said to `imports: [CamerasModule]` on SrsModule. That created a cycle: `CamerasModule → StreamsModule → SrsModule → CamerasModule`.
- **Fix:** Three `forwardRef` entries (CamerasModule.StreamsModule, StreamsModule.SrsModule, SrsModule.CamerasModule) + `@Inject(forwardRef(() => CamerasService))` on the callback controller constructor.
- **Files modified:** srs.module.ts, streams.module.ts, cameras.module.ts, srs-callback.controller.ts
- **Commit:** 80202df

No Rule 1 (bugs) or Rule 2 (missing critical functionality) triggered. No Rule 4 (architectural) escalations.

## Authentication Gates

None — pure internal wiring + BullMQ coordination.

## Verification Results

| Check | Expected | Actual |
|---|---|---|
| `async getStream(streamKey: string)` in srs-api.service.ts | ≥1 | ✓ 1 |
| `export interface SrsStreamInfo` in srs-api.service.ts | ≥1 | ✓ 1 |
| `SrsApiService` in srs.module.ts (provider + export) | ≥2 | ✓ 2 |
| `SrsModule` in streams.module.ts | ≥2 | ✓ 2 |
| `import.*codec-info` in stream-probe.processor.ts | ≥1 | ✓ 1 |
| `SrsApiService` in stream-probe.processor.ts | ≥2 | ✓ 2 |
| `normalizeError` in stream-probe.processor.ts | ≥2 | ✓ 3 |
| `status: 'pending'` + `'success'` + `'failed'` in processor | ≥3 | ✓ 5 |
| `Connection refused` in processor (dictionary entry) | ≥1 | ✓ 1 |
| `refusing job with empty data` in processor (guard) | ≥1 | ✓ 1 |
| `enqueueProbeFromSrs` in cameras.service.ts | ≥1 | ✓ 3 |
| `enqueueProbeRetry` in cameras.service.ts | ≥1 | ✓ 2 |
| `jobId: \`probe:` in cameras.service.ts | ≥3 | ✓ 4 |
| `if (this.probeQueue)` in cameras.service.ts | ≥2 | ✓ 2 |
| `source: 'srs-api'` in cameras.service.ts | ≥1 | ✓ 1 |
| camera-crud.test.ts NOT modified | 0 changes | ✓ untouched |
| `enqueueProbeFromSrs` in srs-callback.controller.ts | ≥1 | ✓ 1 |
| `delay: 1000` in srs-callback.controller.ts | ≥1 | ✓ 1 |
| `@Post('cameras/:id/probe')` in cameras.controller.ts | exactly 1 | ✓ 1 |
| `@HttpCode(202)` in cameras.controller.ts | ≥1 | ✓ 1 |
| `'cameras/:id/test-connection'` still present | ≥1 | ✓ 1 |
| `pnpm test tests/cameras/stream-probe tests/srs/srs-callback` | 0 failed | ✓ 18 passed |
| Full cameras + srs test suite (`tests/cameras tests/srs`) | 0 regressions | ✓ 106 passed, 13 todo, 0 failed |

## normalizeError Dictionary

The 9 pattern-to-phrase mappings in `stream-probe.processor.ts::normalizeError` (matches 19-UI-SPEC.md §"Error Reason Copy Dictionary"):

| Pattern | Canonical Phrase |
|---|---|
| `Connection refused` / `ECONNREFUSED` | Connection refused |
| `Network is unreachable` / `ENETUNREACH` | Network unreachable |
| `401 Unauthorized` / `authorization required` / `Authentication failed` | Auth failed — check credentials |
| `404 Not Found` / `Stream not found` | Stream path not found |
| `timed out` / `ETIMEDOUT` / `Timeout` | Timeout — camera not responding |
| `Invalid data found when processing input` | Invalid stream format |
| `Unsupported codec` / `No decoder for codec` | Unsupported codec |
| `SSL handshake` / `TLS error` | TLS handshake failed |
| `unable to resolve host` / `ENOTFOUND` / `getaddrinfo` | Hostname not resolvable |

Unmatched raw stderr is truncated at 80 chars — ensures NO raw internal host/network/file-path text reaches the UI tooltip (T-19-04 mitigation).

## Test Conversion Count

- `tests/cameras/stream-probe.test.ts`: 12 it.todo → 13 passing tests (1 extra assertion added for srs-api + jobId contract)
- `tests/srs/srs-callback.test.ts`: 5 it.todo → 5 passing tests

**Total converted:** 17 → 18 passing (one extra test kept for srs-api failure-mode coverage)

## Enqueue Call-Site Count

`jobId: probe:${cameraId}` is now used at 4 call sites in `cameras.service.ts`:

1. `createCamera` — after DB commit (D-01)
2. `bulkImport` — per-row after transaction (D-04 — NEW jobId added)
3. `enqueueProbeFromSrs` — on SRS on-publish (D-02)
4. `enqueueProbeRetry` — on UI retry click (D-06)

All four merge at BullMQ level if they fire within the same window (T-19-03 dedup mitigation).

## New Endpoint Signature

```
POST /api/cameras/:id/probe
Content-Type: (none)
Auth: AuthGuard (class-level), ClsService provides ORG_ID

Responses:
  202 Accepted { "accepted": true }
  404 Not Found { ... }  (cross-org or non-existent camera)
```

The endpoint is idempotent on repeat calls (BullMQ jobId dedup). No rate limit this phase — UI-SPEC documents the future-proof warning toast design.

## Commits

| Task | Hash | Subject |
|---|---|---|
| 1 | `5eecbc1` | feat(19-03): add SrsApiService.getStream(streamKey) + SrsStreamInfo |
| 2 | `62ac50d` | feat(19-03): extend StreamProbeProcessor — tagged-union + guard + normalizeError + srs-api branch |
| 3 | `529b046` | feat(19-03): createCamera probe enqueue + enqueueProbeFromSrs / enqueueProbeRetry |
| 4 | `80202df` | feat(19-03): SRS on-publish enqueues source=srs-api refresh probe |
| 5 | `4812af0` | feat(19-03): POST /api/cameras/:id/probe endpoint (D-06 UI retry) |

## Known Stubs

None — all code paths either resolve to real behavior or silently no-op when `probeQueue`/`systemPrisma` are undefined (test harness). No placeholder data flows to the UI.

## Threat Flags

No new trust-boundary surface introduced beyond what the plan's `<threat_model>` already covers (T-19-03 dedup, T-19-04 info-disclosure, T-19-Guard-01 empty-data jobs). The new retry endpoint reuses existing AuthGuard + tenancy lookup — no new attack vector.

## Deferred Issues

Pre-existing full-suite failures in `tests/status/*` (StatusService `this.prisma.camera.findFirst is not a function`), `tests/cameras/bulk-import.test.ts` prisma mock issues, and `tests/users/org-admin-guard.test.ts` missing-table failures are confirmed pre-existing (baseline verified via `git stash` + re-run). Already documented in `deferred-items.md` from plan 19-02. No new deferred items from 19-03.

## Self-Check: PASSED

- [x] `apps/api/src/srs/srs-api.service.ts` — MODIFIED
- [x] `apps/api/src/srs/srs.module.ts` — MODIFIED
- [x] `apps/api/src/srs/srs-callback.controller.ts` — MODIFIED
- [x] `apps/api/src/streams/processors/stream-probe.processor.ts` — MODIFIED
- [x] `apps/api/src/streams/streams.module.ts` — MODIFIED
- [x] `apps/api/src/cameras/cameras.service.ts` — MODIFIED
- [x] `apps/api/src/cameras/cameras.module.ts` — MODIFIED
- [x] `apps/api/src/cameras/cameras.controller.ts` — MODIFIED
- [x] `apps/api/tests/cameras/stream-probe.test.ts` — MODIFIED
- [x] `apps/api/tests/srs/srs-callback.test.ts` — MODIFIED
- [x] Commit `5eecbc1` — FOUND (Task 1)
- [x] Commit `62ac50d` — FOUND (Task 2)
- [x] Commit `529b046` — FOUND (Task 3)
- [x] Commit `80202df` — FOUND (Task 4)
- [x] Commit `4812af0` — FOUND (Task 5)
- [x] Scoped test suite passes: 18/18 in stream-probe + srs-callback
- [x] Broader cameras + srs suite: 106/106 (0 regressions)
- [x] camera-crud.test.ts untouched (Wave 1 file-overlap avoidance)
