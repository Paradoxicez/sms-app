---
phase: 02-stream-engine-camera-management
plan: 03
status: completed
started: "2026-04-09T13:13:54Z"
completed: "2026-04-09T13:20:57Z"
duration: 423s
commits:
  - f3de95f
  - c554d44
  - 25bad13
  - f7b263c
tasks_completed: 4
tasks_total: 4
key-decisions:
  - "BullModule.forRoot configured with Redis host/port from env vars (default localhost:6380)"
  - "StatusModule is @Global for cross-module access by StreamsModule and SrsModule"
  - "SRS callbacks route: /api/srs/callbacks/* matching docker-compose srs.conf callback URLs"
  - "FfmpegService uses simulateEnd helper for testability without spawning real processes"
key-files:
  created:
    - apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts
    - apps/api/src/streams/ffmpeg/ffmpeg.service.ts
    - apps/api/src/streams/processors/stream.processor.ts
    - apps/api/src/streams/streams.service.ts
    - apps/api/src/streams/streams.controller.ts
    - apps/api/src/streams/streams.module.ts
    - apps/api/src/status/status.service.ts
    - apps/api/src/status/status.gateway.ts
    - apps/api/src/status/status.module.ts
    - apps/api/src/srs/srs-callback.controller.ts
    - apps/api/src/srs/srs-api.service.ts
    - apps/api/src/srs/srs.module.ts
    - apps/api/tests/streams/ffmpeg-command.test.ts
    - apps/api/tests/streams/stream-lifecycle.test.ts
    - apps/api/tests/streams/reconnect.test.ts
    - apps/api/tests/status/state-machine.test.ts
    - apps/api/tests/srs/callbacks.test.ts
  modified:
    - apps/api/src/app.module.ts
dependency-graph:
  requires:
    - "Phase 2 Prisma models (Camera, StreamProfile) from 02-01"
    - "Tenancy extension with CLS-based org_id injection from Phase 1"
    - "AuthGuard from 02-02"
    - "BullMQ, Socket.IO, fluent-ffmpeg npm packages from 02-01"
  provides:
    - "StreamsService with start/stop orchestration via BullMQ"
    - "FfmpegService for FFmpeg process lifecycle management"
    - "StatusService with 5-state camera status machine"
    - "StatusGateway for Socket.IO real-time broadcasting"
    - "SrsCallbackController for SRS HTTP callback handling"
    - "SrsApiService for querying SRS streaming engine"
  affects:
    - "02-04 (stream profiles will use StreamsService)"
    - "02-05 (bulk import will trigger stream lifecycle)"
    - "02-06 (stream engine settings will use SrsApiService)"
tech-stack:
  added:
    - "@nestjs/bullmq BullModule.forRoot in AppModule"
    - "@nestjs/websockets StatusGateway"
  patterns:
    - "BullMQ processor with exponential backoff (1s base, 5min max)"
    - "5-state camera status machine (offline, connecting, online, reconnecting, degraded)"
    - "Socket.IO org room broadcasting for real-time status"
    - "SRS HTTP callback parsing with multi-format stream key support"
---

# Phase 02 Plan 03: Stream Lifecycle & Status Summary

FFmpeg process manager with BullMQ orchestration, 5-state camera status machine with Socket.IO broadcasting, SRS HTTP callback handlers for publish/play events, and exponential backoff auto-reconnect capped at 5 minutes.

## Objective

Enable the core streaming pipeline -- starting/stopping camera streams and monitoring their status in real-time via FFmpeg process management, BullMQ job queues, status state machine, and SRS callback integration.

## What Was Built

### Task 1: FFmpeg Command Builder and Service
- `buildFfmpegCommand` function supporting passthrough (`-c:v copy`) and transcode (`-c:v libx264`) profiles
- Auto-detection: when `codec=auto` and `needsTranscode=true`, uses libx264; otherwise uses copy
- `FfmpegService` wraps process lifecycle with `startStream()`, `stopStream()`, and `isRunning()`
- Process tracking via internal Map with cleanup on end/error
- 7 tests covering all codec selection paths and service operations

### Task 2: BullMQ Stream Processor and Streams Service
- `StreamProcessor` (BullMQ `@Processor('stream:ffmpeg')`) spawns FFmpeg with status transitions
- `StreamsService` orchestrates start/stop: creates BullMQ jobs with camera data, removes jobs on stop
- `StreamsController` exposes `POST /api/cameras/:id/stream/start` and `POST /api/cameras/:id/stream/stop`
- `StreamsModule` registers queue, controller, service, processor
- Exponential backoff: `calculateBackoff()` with 1s base, doubling per attempt, 300s (5min) max (D-09)
- `BullModule.forRoot` configured in AppModule with Redis connection from env vars
- 12 tests covering lifecycle, backoff calculation, and processor flow

### Task 3: Camera Status State Machine and Socket.IO Gateway
- 5-state machine: offline, connecting, online, reconnecting, degraded (D-06)
- Valid transitions enforced with always-allow-offline escape hatch for user stops
- `lastOnlineAt` timestamp set when transitioning to online
- `StatusGateway` Socket.IO WebSocket gateway on `/camera-status` namespace
- Clients join org rooms via `orgId` query parameter; status broadcasts scoped to org
- Viewer counting with `incrementViewers`/`decrementViewers` (floor at 0)
- `StatusModule` is `@Global()` for cross-module dependency injection
- 16 tests covering all valid/invalid transitions, broadcasting, and viewer counting

### Task 4: SRS Callback Controller and API Service
- `SrsCallbackController` handles all 6 SRS HTTP callbacks (D-12): on_publish, on_unpublish, on_play, on_stop, on_hls, on_dvr
- `on_publish` transitions camera to online; `on_unpublish` logs only (BullMQ handles reconnect)
- `on_play`/`on_stop` increment/decrement viewer counts with Socket.IO broadcast
- `parseStreamKey` handles multiple SRS formats: `app=live stream=orgId/camId`, `app=live/orgId stream=camId`
- `SrsApiService` wraps SRS HTTP API: versions, streams, summaries, clients, config reload
- 12 tests covering all callbacks, stream key parsing, and API service

## Key Files

### Created
- `apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts`: FFmpeg command construction
- `apps/api/src/streams/ffmpeg/ffmpeg.service.ts`: FFmpeg process lifecycle
- `apps/api/src/streams/processors/stream.processor.ts`: BullMQ processor with backoff
- `apps/api/src/streams/streams.service.ts`: Stream start/stop orchestration
- `apps/api/src/streams/streams.controller.ts`: REST endpoints for stream control
- `apps/api/src/streams/streams.module.ts`: Streams module with BullMQ queue
- `apps/api/src/status/status.service.ts`: Camera status state machine
- `apps/api/src/status/status.gateway.ts`: Socket.IO WebSocket gateway
- `apps/api/src/status/status.module.ts`: Global status module
- `apps/api/src/srs/srs-callback.controller.ts`: SRS HTTP callback handlers
- `apps/api/src/srs/srs-api.service.ts`: SRS API client
- `apps/api/src/srs/srs.module.ts`: SRS module
- `apps/api/tests/streams/ffmpeg-command.test.ts`: 7 tests
- `apps/api/tests/streams/stream-lifecycle.test.ts`: 4 tests
- `apps/api/tests/streams/reconnect.test.ts`: 8 tests
- `apps/api/tests/status/state-machine.test.ts`: 16 tests
- `apps/api/tests/srs/callbacks.test.ts`: 12 tests

### Modified
- `apps/api/src/app.module.ts`: Added BullModule.forRoot, StreamsModule, StatusModule, SrsModule

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all services are fully implemented with complete business logic.

## Threat Mitigations Applied

| Threat ID | Mitigation | Implementation |
|-----------|-----------|----------------|
| T-02-08 | FFmpeg resource exhaustion | BullMQ concurrency configurable on queue; job deduplication via jobId |
| T-02-09 | Stream key manipulation | parseStreamKey validates format; requires both orgId and cameraId |

## Self-Check: PASSED
