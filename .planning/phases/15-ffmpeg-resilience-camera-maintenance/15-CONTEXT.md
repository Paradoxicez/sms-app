# Phase 15: FFmpeg Resilience & Camera Maintenance - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Camera streams recover automatically from failures (SRS container restart, FFmpeg process death, server reboot) and operators can put individual cameras into maintenance mode to suppress noisy notifications/webhooks during planned work. Scope: per-camera health polling, SRS restart detection + bulk re-enqueue, graceful shutdown + boot re-enqueue, maintenance mode schema/API/UI, flapping dedup.

Out of scope: stderr parsing for degradation (RESIL-05, deferred), scheduled maintenance windows (CAM-04, deferred), Prometheus exporter work.

</domain>

<decisions>
## Implementation Decisions

### Health Check Loop (RESIL-02, RESIL-03)
- **D-01:** Runner is a BullMQ repeatable job on a new `camera-health` queue, fire interval 60s. Consistent with existing `cluster-health` and `stream-ffmpeg` queues; Redis-locked so it runs once per cluster regardless of API instance count.
- **D-02:** Each tick iterates cameras where `status IN (online, connecting, reconnecting, degraded) AND maintenanceMode = false`. For each: check FFmpeg presence in `FfmpegService` map AND presence in SRS `/api/v1/streams` response. Either missing → considered dead.
- **D-03:** Recovery action on dead stream: SIGTERM the stale FFmpeg (if still in map), call `StatusService.transition(cameraId, 'reconnecting')`, then enqueue a `stream-ffmpeg` start job. Reuses existing BullMQ backoff (1s → 5min cap).
- **D-04:** Flapping dedup: notifications and webhooks fire only after the new status has been stable for a 30s debounce window. Implementation: `StatusService.transition` schedules a delayed dispatch keyed by `cameraId`; a new transition within 30s cancels the pending dispatch. In-app status badge updates immediately (no debounce on UI state), only outbound notify/webhook is delayed.

### SRS Restart Recovery (RESIL-01)
- **D-05:** Detect SRS restart via `/api/v1/summaries` `self_process.start_time` (or `pid`) delta vs last-seen value cached in memory + Redis. Checked every health tick. When delta is detected → fire `srs.restarted` internal event.
- **D-06:** On `srs.restarted`: query cameras where `status != offline AND maintenanceMode = false`, SIGTERM any existing FFmpeg entries in the map (SRS lost them anyway), enqueue `stream-ffmpeg` start jobs with **jitter delay 0–30s per camera** (BullMQ `delay` option, `Math.random() * 30_000`). Prevents thundering herd against a freshly-started SRS.
- **D-07:** First tick after app boot initializes the `start_time` baseline without triggering recovery (avoids false positive on cold start; boot recovery path D-10 handles that case).

### Graceful Shutdown + Boot Re-enqueue (RESIL-04)
- **D-08:** Enable NestJS shutdown hooks (`app.enableShutdownHooks()`) in `main.ts`. New `ResilienceModule` implements `onApplicationShutdown`: sends SIGTERM to every FFmpeg in the map in parallel, waits up to 10s for exit, then SIGKILL any stragglers. Stops health check job scheduling so it doesn't fight shutdown.
- **D-09:** No new "was-running" column. Source of truth for "should be running at boot" is the existing `camera.status` field — if status is in `[online, connecting, reconnecting, degraded]` AND `maintenanceMode = false`, the camera is considered desired-running. Shutdown intentionally does NOT reset status to offline (the old status represents last-known desired state).
- **D-10:** Boot re-enqueue is a dedicated `BootRecoveryService` wired via `onApplicationBootstrap`. Runs once per process start: queries desired-running cameras, enqueues `stream-ffmpeg` start jobs with the same 0–30s jitter as D-06. Does NOT gate on detecting a crash — it runs every boot.
- **D-11:** Idempotency comes from BullMQ `jobId = "camera:{cameraId}"` on the stream-ffmpeg queue. If a duplicate enqueue races (boot recovery + SRS-restart detection firing close together), BullMQ dedups automatically. No Redis lock, no instance marker.

### Maintenance Mode (CAM-01, CAM-02, CAM-03)
- **D-12:** Add `maintenanceMode Boolean @default(false)` to the `Camera` Prisma model plus `maintenanceEnteredAt DateTime?` and `maintenanceEnteredBy String?` (user id). Indexed on `maintenanceMode` for the health check filter.
- **D-13:** Entering maintenance: API endpoint stops the stream (reuses `stopStream`), which also halts recording (recording is downstream of the live FFmpeg pipeline), sets `maintenanceMode = true`, sets `status = offline`, writes audit log. Notifications/webhooks for the `camera.offline` transition that maintenance causes are **not** fired — the transition code checks `maintenanceMode` right before dispatch.
- **D-14:** Exiting maintenance: API endpoint sets `maintenanceMode = false`, leaves operator to explicitly click Start Stream again (we do NOT auto-restart on exit — matches operator intent). Writes audit log.
- **D-15:** Suppress scope: notification + webhook are suppressed for any `camera.*` event on a camera where `maintenanceMode = true`. Audit log entries continue normally (compliance). Stream engine logs continue normally. Status transitions still run (the state machine stays correct) — only outbound notify/webhook is gated.
- **D-16:** Camera table UI: one `Status` column, horizontal stack of 3 icons — (1) reuse `CameraStatusDot` for online/offline/degraded/connecting, (2) recording indicator dot (red when `isRecording`, gray otherwise), (3) wrench icon (amber when `maintenanceMode`, hidden otherwise). Each icon has a tooltip describing the state.
- **D-17:** Quick action: add a single entry in the existing row dropdown that toggles between "Enter maintenance" / "Exit maintenance" based on current state. Clicking shows a confirmation dialog ("This will stop the stream and suppress notifications") before calling the API.

### Claude's Discretion
- Exact icon choice for maintenance (wrench vs tool vs pause) — defer to UI-SPEC.
- Tooltip wording.
- Debounce implementation detail (setTimeout map vs BullMQ delayed job) — whichever the researcher recommends after checking BullMQ delayed-job semantics.
- Health check job concurrency (1 vs parallel per-camera sub-jobs).
- Confirmation dialog copy.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### FFmpeg / Stream Engine
- `apps/api/src/streams/ffmpeg/ffmpeg.service.ts` — FFmpeg spawn/stop, process map, intentional-stop flag
- `apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts` — Codec/preset construction (read for full picture)
- `apps/api/src/streams/processors/stream.processor.ts` — BullMQ stream-ffmpeg processor, `calculateBackoff()` (lines ~22-25)
- `apps/api/src/streams/streams.service.ts` — startStream/stopStream orchestration

### Status Machine + Events
- `apps/api/src/status/status.service.ts` — state machine (lines 28-86), `transition()`, `emitEvent()` (lines 59-62)
- `apps/api/src/notifications/notifications.service.ts` — `createForCameraEvent()`
- `apps/api/src/notifications/notifications.gateway.ts` — WebSocket broadcast
- `apps/api/src/webhooks/webhooks.service.ts` — subscription CRUD
- `apps/api/src/webhooks/webhook-delivery.processor.ts` — HMAC-signed async dispatch

### SRS Integration
- `apps/api/src/srs/srs-api.service.ts` — `/api/v1/summaries`, `/api/v1/streams`, `reloadConfig()` (lines 33-37)
- `apps/api/src/srs/srs-callback.controller.ts` — on_publish/on_unpublish/on_play/on_stop/on_hls handlers
- `apps/api/src/cluster/templates/srs-origin.conf.ts` — SRS config template with callback URLs
- `apps/api/src/cluster/cluster-health.service.ts` — Existing 10s cluster-health pattern to mirror for camera-health

### Prisma + DB
- `apps/api/src/prisma/schema.prisma` — Camera model (add maintenanceMode here), Notification, WebhookSubscription
- `apps/api/src/prisma/prisma.service.ts` — $disconnect OnModuleDestroy pattern

### Camera Table UI
- `apps/web/src/app/admin/cameras/components/cameras-data-table.tsx` — Table component
- `apps/web/src/app/admin/cameras/components/cameras-columns.tsx` — Column defs (edit Status column here)
- `apps/web/src/app/admin/cameras/components/camera-status-badge.tsx` — Status badge/dot colors
- `apps/web/src/hooks/use-camera-status.tsx` — WebSocket-based live status hook

### DataTable Base (for row action pattern)
- `apps/web/src/components/ui/data-table/data-table-row-actions.tsx` — Row dropdown pattern used in Phase 14 migrations

### Requirements
- `.planning/REQUIREMENTS.md` §FFmpeg Resilience (RESIL-01..04), §Camera Management (CAM-01..03)
- `.planning/ROADMAP.md` §Phase 15 — goal statement + 5 success criteria
- `.planning/phases/14-bug-fixes-datatable-migrations/14-CONTEXT.md` — DataTable conventions (D-04..D-08) that the maintenance quick action must follow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FfmpegService` process map — already tracks per-camera FfmpegCommand, just needs shutdown hook wired up.
- `StatusService.transition` — existing state machine, already fires webhook + notification. Add maintenanceMode guard + debounce here.
- `stream-ffmpeg` BullMQ queue with backoff logic — reuse for all re-enqueue paths (health recovery, SRS restart, boot recovery).
- `cluster-health.service.ts` pattern — near-identical shape to what camera-health needs (10s vs 60s tick, different probe).
- `CameraStatusDot` component — covers 4/5 icon states already; add 2 sibling icons beside it.
- `DataTableRowActions` pattern from Phase 14 — matches CAM-03 quick action requirement.
- `webhooks` queue + HMAC dispatch — suppression happens upstream (in StatusService), webhook pipeline itself unchanged.

### Established Patterns
- BullMQ repeatable jobs with `OnModuleInit` scheduling (see `cluster-health.service.ts`).
- NestJS `onApplicationBootstrap` / `onApplicationShutdown` for lifecycle work (Prisma already uses `OnModuleDestroy`).
- Status transitions are the single chokepoint for notify/webhook — new suppression logic lives there, not in 4 separate callers.
- BullMQ jobId dedup for idempotency (used in stream-ffmpeg queue already).
- Camera table: columns factory + DataTable wrapper (Phase 14 D-04).

### Integration Points
- `srs-callback.controller.ts` on_publish/on_unpublish already drive status transitions — health check must not double-fire.
- SRS config callbacks fire for every stream — health check is a complement (catches cases where the callback was missed or SRS died).
- Camera CRUD endpoints in `cameras.controller.ts` — add `POST /cameras/:id/maintenance` + `DELETE /cameras/:id/maintenance` (or single PATCH with body).
- Audit log service already writes for camera CRUD — add entries for maintenance toggle.
- Existing `cameras-columns.tsx` Status column swaps from single dot to composite.

</code_context>

<specifics>
## Specific Ideas

- BullMQ 0–30s jitter on bulk re-enqueue — standard pattern, preserves SRS from thundering herd; same approach used on CDN reconnect backoffs.
- Stripe-style confirmation dialog for maintenance entry ("This will stop the stream and suppress notifications until you exit maintenance mode") — matches Phase 14's Stripe-inspired API key dialog tone (D-01).
- Reuse `CameraStatusDot` rather than building a new composite component — keeps color vocabulary consistent with the rest of the app.

</specifics>

<deferred>
## Deferred Ideas

- **RESIL-05** FFmpeg stderr parsing for proactive degradation detection — already in REQUIREMENTS.md as future.
- **CAM-04** Scheduled maintenance windows (auto-enter/exit) — already in REQUIREMENTS.md as future.
- Observability/Prometheus metrics for health check (hit counts, recovery latency) — not in scope; can be its own phase.
- Testing strategy document (how to simulate SRS restart in tests) — deferred to the phase planner; researcher can propose an approach.
- DB migration rollout plan (index creation on large Camera table) — trivial at current scale; planner covers in migration plan.
- Bulk maintenance (multi-select → enter maintenance) — CAM-03 only requires per-row quick action; bulk is a future UX enhancement.

</deferred>

---

*Phase: 15-ffmpeg-resilience-camera-maintenance*
*Context gathered: 2026-04-18*
