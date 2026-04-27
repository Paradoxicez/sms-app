# Phase 15: FFmpeg Resilience & Camera Maintenance - Research

**Researched:** 2026-04-18
**Domain:** FFmpeg lifecycle orchestration, BullMQ scheduling, NestJS lifecycle hooks, Prisma schema evolution, DataTable UI composition
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Health Check Loop (RESIL-02, RESIL-03):**
- **D-01** — BullMQ repeatable job on new `camera-health` queue, 60s interval. Mirrors `cluster-health` pattern. Redis-locked to run once per cluster.
- **D-02** — Tick iterates `status IN (online, connecting, reconnecting, degraded) AND maintenanceMode = false`. Dead = missing from `FfmpegService` map OR missing from SRS `/api/v1/streams`.
- **D-03** — Recovery: SIGTERM stale FFmpeg, `StatusService.transition(cameraId, 'reconnecting')`, enqueue `stream-ffmpeg` start job (existing backoff 1s → 5min cap).
- **D-04** — Flapping dedup: notifications + webhooks debounce 30s on status change (keyed by cameraId). New transition inside 30s cancels pending dispatch. In-app status badge updates immediately; only outbound notify/webhook is delayed.

**SRS Restart Recovery (RESIL-01):**
- **D-05** — Detect via `/api/v1/summaries` `self.pid` (or `start_time`) delta vs last-seen (cached in memory + Redis). Checked every health tick. Delta → fire `srs.restarted` internal event.
- **D-06** — On `srs.restarted`: query `status != offline AND maintenanceMode = false`, SIGTERM FFmpeg map entries, enqueue `stream-ffmpeg` start jobs with **jitter delay 0–30s per camera** (`delay: Math.random() * 30_000`). Prevents thundering herd.
- **D-07** — First tick after app boot initializes baseline without triggering recovery. Boot recovery (D-10) handles that case.

**Graceful Shutdown + Boot Re-enqueue (RESIL-04):**
- **D-08** — `app.enableShutdownHooks()` in `main.ts`. New `ResilienceModule` implements `onApplicationShutdown`: parallel SIGTERM all FFmpeg, wait up to 10s, then SIGKILL. Stops health check scheduling first.
- **D-09** — No new "was-running" column. Source of truth = existing `camera.status`. Desired-running = `status IN [online, connecting, reconnecting, degraded] AND maintenanceMode = false`. Shutdown does NOT reset status to offline.
- **D-10** — Boot re-enqueue in dedicated `BootRecoveryService` via `onApplicationBootstrap`. Queries desired-running cameras, enqueues with same 0–30s jitter. Runs every boot, no crash gating.
- **D-11** — Idempotency via BullMQ `jobId = "camera:{cameraId}"` on stream-ffmpeg queue. BullMQ dedups automatically on racing duplicate. No Redis lock, no instance marker.

**Maintenance Mode (CAM-01, CAM-02, CAM-03):**
- **D-12** — Add `maintenanceMode Boolean @default(false)` + `maintenanceEnteredAt DateTime?` + `maintenanceEnteredBy String?` to Camera. Index on `maintenanceMode` for health filter.
- **D-13** — Enter: API endpoint calls `stopStream` (recording halts downstream), sets `maintenanceMode = true`, `status = offline`, writes audit log. Resulting `camera.offline` transition does NOT dispatch notifications/webhooks — gated on `maintenanceMode`.
- **D-14** — Exit: sets `maintenanceMode = false` only. Operator must click Start Stream to restart (no auto-restart). Writes audit log.
- **D-15** — Suppress scope: notification + webhook gated for any `camera.*` event where `maintenanceMode = true`. Audit log + stream engine logs continue normally. Status transitions still run (state machine stays correct).
- **D-16** — Camera table Status column: 3 horizontally-stacked icons — (1) reuse `CameraStatusDot`, (2) recording dot (red/gray), (3) wrench icon (amber when `maintenanceMode`, invisible otherwise). Each icon has tooltip.
- **D-17** — Row action: single toggle entry ("Enter/Exit maintenance") in existing dropdown. Confirmation dialog before API call.

### Claude's Discretion

- Exact icon choice for maintenance (wrench vs tool vs pause) — resolved in UI-SPEC as **Wrench** (lucide).
- Tooltip wording — resolved in UI-SPEC (Thai-first).
- Debounce implementation: setTimeout map vs BullMQ delayed job — **recommended BullMQ delayed job** (this research).
- Health check job concurrency — **recommended concurrency 1** (this research).
- Confirmation dialog copy — resolved in UI-SPEC.

### Deferred Ideas (OUT OF SCOPE)

- RESIL-05 FFmpeg stderr parsing for proactive degradation detection
- CAM-04 Scheduled maintenance windows
- Observability/Prometheus metrics for health check
- Testing strategy document (how to simulate SRS restart) — covered here in Validation Architecture
- DB migration rollout plan for index creation
- Bulk maintenance (multi-select)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RESIL-01 | System auto-reconnects all FFmpeg streams when SRS container restarts | Finding #6 (SRS restart detection via `self.pid` delta), Finding #3 (jitter delay + jobId dedup), Finding #11 (audit log integration) |
| RESIL-02 | Health check loop verifies FFmpeg process + SRS streams every 60s | Finding #1 (BullMQ repeatable job pattern), Finding #7 (status service refactor) |
| RESIL-03 | User receives notification + webhook when camera status changes | Finding #2 (BullMQ delayed job for 30s debounce), Finding #12 (webhook/notification suppression at StatusService chokepoint) |
| RESIL-04 | FFmpeg processes shut down gracefully on server restart, re-enqueue on boot | Finding #4 (NestJS `onApplicationShutdown`), Finding #5 (`onApplicationBootstrap`), Finding #3 (jobId dedup) |
| CAM-01 | User can toggle camera into maintenance mode (suppress notify/webhooks) | Finding #8 (Prisma migration), Finding #11 (audit logs), Finding #12 (suppression point) |
| CAM-02 | Camera table shows 3 status icons (online/offline, recording, maintenance) | Finding #9 (camera table UI composition) |
| CAM-03 | Camera quick actions menu has Maintenance toggle | Finding #10 (row action toggle pattern from Phase 14) |
</phase_requirements>

---

## Executive Summary

- **Stack is locked and mature** — NestJS 11.0 + BullMQ 5.73.2 + Prisma 6.19.3 (`apps/api/package.json`). All patterns CONTEXT.md references already exist verbatim in the codebase: `cluster-health.service.ts` is a direct template for the new `CameraHealthService`, `webhooks.service.ts` shows the BullMQ `add(...)` + custom backoff pattern, and `stream.processor.ts` already has `calculateBackoff()` (1s → 5min cap) that the recovery path reuses.

- **The SRS restart marker is `self.pid`, not `self_process.start_time`.** [CITED: SRS source `trunk/src/app/srs_app_http_api.cpp` + `trunk/src/app/srs_app_utility.cpp`] The `/api/v1/summaries` response contains a top-level `pid` (process identity, string) and a `data.self.pid` (integer PID from `getpid()`), plus `data.self.srs_uptime` (seconds since process start). The actual JSON path `self.start_time` does NOT exist — CONTEXT.md's "or `pid`" parenthetical is the canonical field. `srs_uptime` is a useful secondary signal (a value that suddenly goes backward is a definite restart).

- **BullMQ repeatable jobs work but are deprecated as of 5.16.** [CITED: docs.bullmq.io/guide/jobs/repeatable] The recommended API in 5.73 is `queue.upsertJobScheduler(schedulerId, { every: 60000 })`. The existing `cluster-health.service.ts` uses the legacy `add(..., { repeat: { every } })` form — consistency argues for matching that pattern here, but the planner should note the deprecation and consider `upsertJobScheduler` for the new `camera-health` queue. Both coexist in 5.x. See Finding #1.

- **NestJS lifecycle hook ordering favors the CONTEXT.md choices.** [CITED: docs.nestjs.com/fundamentals/lifecycle-events] `onModuleInit` fires when the host module's deps resolve; `onApplicationBootstrap` fires once ALL modules are initialized but before listening for connections. This is the right hook for boot recovery (D-10) because Prisma and BullMQ queues are guaranteed ready. Shutdown runs in order: `onModuleDestroy` → `beforeApplicationShutdown` → `onApplicationShutdown`. `enableShutdownHooks()` attaches SIGINT/SIGTERM/SIGHUP listeners (SIGTERM may not work on Windows per docs — not a concern for our Linux Docker target).

- **The one material risk:** jobId dedup only holds while a job exists in Redis. Once a job completes with `removeOnComplete: true` (our current setting for stream-ffmpeg at `streams.service.ts:70`), the same jobId CAN be re-added. D-11's idempotency claim is correct for the boot-recovery + SRS-restart race window (both fire seconds apart), but NOT for "boot recovery enqueues at T0, completes at T1, SRS restart at T2" — that second enqueue is allowed. This is actually what we want (we do want to restart on SRS bounce), but the planner should document it so a future reader doesn't assume jobId dedup is absolute.

**Primary recommendation:** Build `CameraHealthService` and `ResilienceModule` (containing `BootRecoveryService`) as the two new service units. Mirror `cluster-health.service.ts` for scheduling, `StatusService` for the suppression chokepoint, and `streams.service.ts` for enqueue shape. Prisma migration is trivial (three columns + one index). UI surface is a 30-line diff inside `cameras-columns.tsx` + one new AlertDialog component. All findings below are HIGH confidence — the codebase already has every pattern CONTEXT.md asks for.

---

## Findings

### 1. BullMQ repeatable jobs for `camera-health` queue [HIGH]

**Mirror `cluster-health.service.ts`:**
- Scheduling: `cluster-health.service.ts:172-182` — `this.healthQueue.add(name, data, { repeat: { every: HEALTH_CHECK_INTERVAL_MS }, removeOnComplete: true, removeOnFail: 10 })`
- Queue registration: `cluster.module.ts:15` — `BullModule.registerQueue({ name: 'cluster-health' })`
- Processor: `cluster-health.processor.ts:10-23` — trivial `WorkerHost` extending class with `@Processor('cluster-health')`, delegates to `service.checkNode(nodeId)`

**For `camera-health`:** one repeatable job (NOT one per camera — CONTEXT.md D-01 says "tick interval 60s" for the whole queue). The tick fetches all cameras matching the filter and processes them inline. Concurrency 1 is correct per Claude's Discretion (lightweight DB query + N hashmap probes per tick; no reason to parallelize the tick across workers).

**Redis-lock semantics:** [CITED: docs.bullmq.io/guide/job-schedulers] BullMQ uses a single Redis-backed queue; whichever worker grabs the job next processes it. In a multi-API-instance deployment, only one instance's worker will process each tick — that's the cluster lock. NOT explicit distributed-lock code; it falls out of BullMQ's job consumption semantics. This matches `cluster-health`'s existing guarantee.

**Deprecation note:** [CITED: docs.bullmq.io/guide/jobs/repeatable] Repeatable jobs are deprecated as of BullMQ 5.16 in favor of Job Schedulers (`upsertJobScheduler`). We run 5.73.2. The existing codebase uses the legacy form for `cluster-health`. **Recommendation: match `cluster-health` (legacy form) for consistency** — the planner can file a future cleanup to migrate both queues to `upsertJobScheduler` simultaneously. Don't split the pattern.

**Redis connection:** already configured globally in `app.module.ts:32-37` via `BullModule.forRoot({ connection: { host, port } })`. New module only needs `BullModule.registerQueue({ name: 'camera-health' })`.

### 2. BullMQ delayed jobs vs `setTimeout` map for 30s debounce (D-04) [HIGH]

**Recommendation: BullMQ delayed job.**

**The problem with `setTimeout`:**
- NestJS graceful shutdown (D-08) calls `onApplicationShutdown` and clears timers the service cleans up, but any in-flight `setTimeout` for a pending notification is lost — a status change that occurred 15s before `SIGTERM` will never emit.
- On crash/SIGKILL, all pending notifications vanish with the process.
- The 30s debounce is specifically defensive against rapid online/offline flapping. If the process dies during a flap window, the debounce protection dies with it — exactly when we need it most.

**Why BullMQ delayed job wins:**
- Job data is persisted in Redis. A Node process restart does not lose pending debounced notifications — the job simply resumes when the worker reconnects.
- `jobId` dedup semantics: when a new transition fires inside the 30s window, we `await queue.getJob(jobId)?.remove()` then `queue.add(...)` with the same jobId. If the previous job hasn't been processed yet (in delayed state), `remove()` succeeds. If it's already moved to active/processed, `removeOnComplete` cleans it up and the new add is not a duplicate. [CITED: docs.bullmq.io/guide/jobs/job-ids]
- Mirrors existing `stream-ffmpeg` jobId pattern at `streams.service.ts:58-72`.

**Proposed implementation shape** (to live in StatusService OR a new `notify-dispatch.service.ts`):

```typescript
// Pseudo-code — planner determines exact placement
const jobId = `camera:${cameraId}:notify`;
const existing = await this.notifyQueue.getJob(jobId);
if (existing) await existing.remove().catch(() => {});
await this.notifyQueue.add(
  'dispatch',
  { orgId, cameraId, previousStatus, newStatus, cameraName },
  { jobId, delay: 30_000, removeOnComplete: true, removeOnFail: 10 },
);
```

A new processor (`notify-dispatch.processor.ts`) reads the job at T+30s, re-fetches the camera (to confirm the status hasn't flipped back), checks `maintenanceMode` (suppress gate), then calls `WebhooksService.emitEvent` and `NotificationsService.createForCameraEvent` as the current StatusService does inline today.

**Caveat on semantics:** "the new status has been stable for 30s" means the processor at T+30s must verify `camera.status === newStatusAtEnqueue`. If status changed in the interim, the pending job was removed by a later `transition()` call (good) OR the job ran before the later transition had a chance to remove it (race). Belt-and-braces: the processor re-reads the camera and compares.

### 3. BullMQ jitter delay + jobId dedup (D-06, D-10, D-11) [HIGH]

**Jitter delay:**
```typescript
await this.streamQueue.add('start', jobData, {
  jobId: `camera:${cameraId}`,  // D-11 idempotency
  delay: Math.floor(Math.random() * 30_000),
  attempts: 20,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: true,
  removeOnFail: false,
});
```

**Important:** existing `streams.service.ts:64` uses `jobId: "stream-${cameraId}"` (the string `stream-` prefix). CONTEXT.md D-11 specifies `jobId: "camera:{cameraId}"` (colon). **The planner must reconcile this.** Options:

1. Update `streams.service.ts:64` to match D-11 — unifies the jobId namespace so boot recovery, SRS restart, and user-initiated start all collide on the same key. Minor risk of a pending `stream-{id}` job outliving the deploy (handled by `removeOnComplete: true`).
2. Keep `stream-{id}` as the canonical jobId and update CONTEXT.md D-11 to reflect it.

**Recommended option 1** because the whole point of D-11 is that the three enqueue paths dedup. If they use different jobIds, they don't dedup.

**jobId dedup semantics confirmed:** [CITED: docs.bullmq.io/guide/jobs/job-ids] "When you call `queue.add()` twice with the same `jobId`, that job will just be ignored and not added to the queue at all." Dedup holds only while the job exists — once `removeOnComplete` or manual removal clears it, the same jobId can be re-added. For our use case this is correct: we WANT a new start to be allowed after the previous start completed or was manually stopped.

**Race example (benign):** Boot recovery enqueues at T=0 for camera A. SRS restarts at T=5s before recovery has processed. SRS-restart handler enqueues for camera A at T=5s — jobId dedups, returns the existing queued job. At T=15s (random jitter), boot recovery job runs. SRS is alive. FFmpeg spins up. Correct outcome.

**Race example (also benign):** Boot recovery enqueues and completes at T=2s. SRS restart fires at T=4s. Second enqueue succeeds because previous job was removed. Two FFmpegs for one camera? No — `FfmpegService.startStream` at `ffmpeg.service.ts:19-22` checks `if (this.runningProcesses.has(cameraId)) return`. Double-enqueue produces one process.

### 4. NestJS `onApplicationShutdown` wiring (D-08) [HIGH]

**main.ts change** (`apps/api/src/main.ts:15`):

```typescript
const app = await NestFactory.create(AppModule, { rawBody: true });
app.enableShutdownHooks();  // NEW — before enableCors or after, order irrelevant
```

[CITED: docs.nestjs.com/fundamentals/lifecycle-events] `enableShutdownHooks()` attaches listeners for SIGINT, SIGTERM, SIGHUP (Linux). Docker Compose sends SIGTERM on `docker stop`, then SIGKILL after 10s grace (the default `--stop-timeout`). Our shutdown must finish within that 10s window or the container gets SIGKILLed — this is why D-08 specifies exactly 10s grace before SIGKILL from our side. The math:

- Docker sends SIGTERM → NestJS fires `onApplicationShutdown` hooks (nearly instant).
- Our hook: SIGTERM all FFmpegs in parallel, start 10s timer.
- At T+10s: remaining FFmpegs get SIGKILL from our code.
- Docker's own T+10s SIGKILL arrives at the same moment or just after — mostly a no-op because our code already killed stragglers.

**To stay under Docker's timeout**, either (a) set `--stop-timeout=15s` in compose (gives us 5s slack) OR (b) reduce our grace to 8s. Planner picks.

**Shutdown hook contract:** [CITED: same source]
```typescript
@Injectable()
export class ResilienceService implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string) {
    // signal is 'SIGTERM' / 'SIGINT' / etc.
    // awaiting here blocks subsequent hooks until this resolves/rejects
  }
}
```

**Interaction with BullMQ worker shutdown:** The concern in the research prompt — "we must stop scheduling health ticks first — how?" — is addressable:

- BullMQ workers get their own `onApplicationShutdown` handler via `@nestjs/bullmq` internals — they stop processing new jobs gracefully when the app shuts down.
- Our `ResilienceService.onApplicationShutdown` should run BEFORE the BullMQ worker shutdown handler OR simply not care about ordering, because: if a health tick lands MID-shutdown, the tick runs against a fine camera set, sees everything as "running" (because FFmpegs are actively being SIGTERM'd but not yet marked offline), and either enqueues a stream-ffmpeg restart job (queue still accepts) OR finds BullMQ already closed and errors. The error is fine because tick code already wraps in try/catch (`cluster-health.service.ts:87`).
- **Practical answer:** use `beforeApplicationShutdown` for "stop the health tick scheduler" (e.g., `await this.cameraHealthQueue.pause()`), then `onApplicationShutdown` for the FFmpeg SIGTERM + grace loop. Ordering is guaranteed: `onModuleDestroy → beforeApplicationShutdown → onApplicationShutdown`.

**Shutdown implementation sketch:**

```typescript
@Injectable()
export class ResilienceService implements OnApplicationShutdown {
  constructor(private readonly ffmpegService: FfmpegService) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    const running = this.ffmpegService.getRunningCameraIds();  // new helper method
    if (!running.length) return;

    this.logger.log(`Shutting down ${running.length} FFmpeg processes (${signal})`);

    // Parallel SIGTERM
    for (const cameraId of running) {
      this.ffmpegService.stopStream(cameraId);
    }

    // Wait up to 10s for all to exit
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (running.every((id) => !this.ffmpegService.isRunning(id))) return;
      await new Promise((r) => setTimeout(r, 100));
    }

    // SIGKILL stragglers
    for (const cameraId of running) {
      if (this.ffmpegService.isRunning(cameraId)) {
        this.ffmpegService.forceKill(cameraId);  // new method — sends SIGKILL
      }
    }
  }
}
```

This requires two small additions to `FfmpegService`:
1. `getRunningCameraIds(): string[]` — returns `Array.from(this.runningProcesses.keys())`.
2. `forceKill(cameraId: string): void` — calls `cmd.kill('SIGKILL')` rather than `SIGTERM`, also sets `intentionalStops`.

### 5. NestJS `onApplicationBootstrap` for boot recovery (D-10) [HIGH]

**Ordering guarantee:** [CITED: docs.nestjs.com/fundamentals/lifecycle-events] "`onApplicationBootstrap()` is called once all modules have been initialized, but before listening for connections." This is stronger than `onModuleInit`, which only waits for the host module's own deps. By the time `onApplicationBootstrap` fires, ALL modules (including PrismaModule, BullModule queue registrations, StreamsModule, StatusModule) are fully initialized.

**Implication for `BootRecoveryService`:**
- Prisma client is ready: safe to `this.prisma.camera.findMany(...)`.
- BullMQ queue `stream-ffmpeg` is registered and connected: safe to `await this.streamQueue.add(...)`.
- No ordering hazard between this service and the `CameraHealthService` (which starts its repeatable job in `onModuleInit`) because they touch independent queues.

**Implementation shape:**

```typescript
@Injectable()
export class BootRecoveryService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('stream-ffmpeg') private readonly streamQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const desiredRunning = await this.prisma.camera.findMany({
      where: {
        status: { in: ['online', 'connecting', 'reconnecting', 'degraded'] },
        maintenanceMode: false,
      },
      include: { streamProfile: true },
    });

    this.logger.log(`Boot recovery: re-enqueuing ${desiredRunning.length} streams`);

    for (const camera of desiredRunning) {
      await this.streamQueue.add(
        'start',
        buildJobData(camera),
        {
          jobId: `camera:${camera.id}`,
          delay: Math.floor(Math.random() * 30_000),  // 0-30s jitter
          attempts: 20,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }
  }
}
```

**Note:** `BootRecoveryService` should live in the new `ResilienceModule` (which imports `PrismaModule`, the `stream-ffmpeg` BullMQ queue, and `StreamsModule` if it needs `buildJobData`). Or pull the job-data-shape helper out of `streams.service.ts:34-55` into a shared helper. Planner decides.

**Risk: RLS bypass.** Prisma via `PrismaService` (not `TENANCY_CLIENT`) is the right choice here — boot recovery runs across all orgs, with no tenant context set. This matches `cluster-health.service.ts` which uses `PrismaService` directly.

### 6. SRS restart detection — exact API shape (D-05) [HIGH]

**Endpoint:** `GET http://srs:1985/api/v1/summaries`

**Response structure** [CITED: SRS source `trunk/src/app/srs_app_http_api.cpp` — `SrsGoApiSummaries::serve_http`; `trunk/src/app/srs_app_utility.cpp` — `srs_api_dump_summaries`]:

```json
{
  "code": 0,
  "server": "vid-xxxxx",       // stat_->server_id() — changes on restart
  "service": "vid-yyyyy",      // stat_->service_id() — changes on restart
  "pid": "12345",              // stat_->service_pid() as string — restart marker
  "data": {
    "ok": true,
    "now_ms": 1234567890,
    "self": {
      "version": "6.0.184",
      "pid": 12345,             // getpid() as integer — restart marker
      "ppid": 1,
      "argv": "...",
      "cwd": "...",
      "mem_kbyte": 45000,
      "mem_percent": 0.5,
      "cpu_percent": 2.1,
      "srs_uptime": 3600       // seconds since SRS process start
    },
    "system": {
      "cpu_percent": ..., "mem_ram_kbyte": ..., "disk_busy_percent": ...,
      "srs_send_bytes": ..., "srs_recv_bytes": ...
      // Note: existing cluster-health.service.ts uses `self.srs_bytes_sent_total`
      // but actual field is `system.srs_send_bytes`. That's an existing bug
      // unrelated to this phase — don't fix it here.
    }
  }
}
```

**Restart detection logic:**

```typescript
// Primary: self.pid changes on restart
const current = await this.srsApi.getSummaries();
const currentPid = current?.data?.self?.pid;  // integer
const currentServerId = current?.server;      // string — also changes

// Compare to cached last-seen
const lastPid = await this.redis.get('srs:last_pid');
if (lastPid && lastPid !== String(currentPid)) {
  // SRS restart detected
  this.eventEmitter.emit('srs.restarted', { previousPid: lastPid, currentPid });
}
await this.redis.set('srs:last_pid', String(currentPid));
```

**First-tick baseline (D-07):** on first tick after boot, read `self.pid`, write to Redis, DO NOT emit event. Use a flag in memory (`this.firstTickComplete = false` → set to true after first successful read) OR check `lastPid === null` on read.

**Where to cache baseline:**
- **Redis preferred for cluster** (as CONTEXT.md specifies) — multiple API instances see the same baseline. Key: `srs:last_pid:{nodeId}` if we want per-SRS-node tracking (future-proof for edge clusters). For now, single origin, single key works.
- In-memory cache is a performance win (avoid Redis round-trip every 60s) but is lost on API restart. First tick after API restart should re-sync from Redis, then optionally cache in memory.

**Secondary signal (`srs_uptime`):** if `self.srs_uptime` goes backward between ticks (current < previous), SRS definitely restarted, even if `pid` happened to be recycled (very unlikely on Linux, but defense in depth). Recommend OR-ing both signals.

### 7. Status service refactor (D-04, D-13, D-15) [HIGH]

**Current shape** at `apps/api/src/status/status.service.ts:28-86`:
- Validates transition against `validTransitions` map (lines 12-18).
- Updates DB.
- Broadcasts via `StatusGateway.broadcastStatus` (line 56) — **always runs, never debounced**.
- Fires webhook inline (lines 60-73) — **MUST be moved to the debounced path + maintenance suppression**.
- Fires notification inline (lines 77-83) — **same**.

**Minimal refactor shape:**

```typescript
async transition(cameraId: string, orgId: string, newStatus: string): Promise<void> {
  const camera = await this.prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new Error(...);
  if (newStatus === camera.status) return;  // no-op guard (existing)
  // ... validation (existing)

  await this.prisma.camera.update({ where: { id: cameraId }, data: { status: newStatus, ... } });

  // UI updates IMMEDIATELY (per D-04)
  this.statusGateway.broadcastStatus(orgId, cameraId, newStatus);

  // OUTBOUND notify/webhook: debounced + maintenance-gated
  if (camera.maintenanceMode) {
    // D-15: suppress outbound notify/webhook entirely
    this.logger.debug(`Maintenance mode active — suppressing notify/webhook for ${cameraId}`);
    return;
  }

  const notifiableStatuses = ['online', 'offline', 'degraded', 'reconnecting'];
  if (notifiableStatuses.includes(newStatus)) {
    await this.scheduleDebouncedNotify(orgId, cameraId, camera.name, newStatus, camera.status);
  }
}

private async scheduleDebouncedNotify(...) {
  const jobId = `camera:${cameraId}:notify`;
  const existing = await this.notifyQueue.getJob(jobId);
  if (existing) await existing.remove().catch(() => {});
  await this.notifyQueue.add('dispatch', {...}, { jobId, delay: 30_000, ... });
}
```

**A new BullMQ queue `camera-notify` (or `status-notify`)** holds the delayed jobs. The processor reads the job, re-fetches the camera, re-checks `maintenanceMode` (operator may have entered maintenance during the 30s window), and calls `WebhooksService.emitEvent` + `NotificationsService.createForCameraEvent`.

**Callsite compatibility:** `srs-callback.controller.ts:28`, `streams.service.ts:105`, `stream.processor.ts:46` all call `this.statusService.transition(cameraId, orgId, newStatus)`. None of those callers need to change — the refactor is internal to StatusService.

**Risk: debounce jobs outliving their cameras.** If a camera is deleted while a notify job is queued, the processor should gracefully handle `camera not found` (already the case with `prisma.findUnique` returning null). Not a blocker.

### 8. Prisma migration (D-12) [HIGH]

**Schema diff** at `apps/api/src/prisma/schema.prisma:199-229`:

```diff
 model Camera {
   id              String         @id @default(uuid())
   ...
   lastOnlineAt    DateTime?
   createdAt       DateTime       @default(now())
   updatedAt       DateTime       @updatedAt

   retentionDays    Int?
   isRecording      Boolean  @default(false)

+  maintenanceMode       Boolean   @default(false)
+  maintenanceEnteredAt  DateTime?
+  maintenanceEnteredBy  String?   // User.id — no FK for now, same pattern as AuditLog.userId

   policy            Policy?
   ...

   @@index([orgId])
   @@index([siteId])
   @@index([status])
+  @@index([maintenanceMode])
 }
```

**Migration command:**
```bash
pnpm --filter @sms-platform/api prisma migrate dev --name add_maintenance_mode
```

Prisma generates SQL:
```sql
ALTER TABLE "Camera" ADD COLUMN "maintenanceMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Camera" ADD COLUMN "maintenanceEnteredAt" TIMESTAMP(3);
ALTER TABLE "Camera" ADD COLUMN "maintenanceEnteredBy" TEXT;
CREATE INDEX "Camera_maintenanceMode_idx" ON "Camera"("maintenanceMode");
```

**Backfill:** trivial — `@default(false)` applies automatically to existing rows via `ADD COLUMN ... NOT NULL DEFAULT false`. No separate backfill script needed.

**RLS impact:** Camera table has Row-Level Security (RLS) based on `orgId`. Adding non-`orgId` columns does not break RLS policies — the policy evaluates `orgId` regardless of other columns. Verified via the existing `retentionDays` and `isRecording` additions that went through without RLS issues. [VERIFIED: schema.prisma:219-220]

**Index sizing concern:** `@@index([maintenanceMode])` on a boolean column with heavy skew (most rows `false`) is borderline — PostgreSQL may prefer a partial index for large tables. At v1.2 scale (cameras per org measured in tens-to-hundreds), a full boolean index is fine and matches existing patterns (`@@index([status])` already indexes a low-cardinality string). Planner should NOT switch to a partial index without measuring.

**No FK on `maintenanceEnteredBy`:** intentional — matches `AuditLog.userId` (line 422) which is also a bare `String?`. Avoids cascade-delete semantics coupling camera lifecycle to user lifecycle.

### 9. Camera table UI composition (D-16, D-17) [HIGH]

**Current state** at `apps/web/src/app/admin/cameras/components/cameras-columns.tsx:40-49`:
```tsx
{
  accessorKey: "status",
  header: ({ column }) => (<DataTableColumnHeader column={column} title="Status" />),
  cell: ({ row }) => <CameraStatusDot status={row.getValue("status")} />,
  size: 48,
  filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
},
```

**Minimal diff — replace `cell`:**

```tsx
cell: ({ row }) => {
  const camera = row.original;
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1" aria-label="Camera status">
        <Tooltip>
          <TooltipTrigger asChild>
            <span><CameraStatusDot status={camera.status} /></span>
          </TooltipTrigger>
          <TooltipContent>{statusTooltip[camera.status]}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Circle
              className={cn(
                "size-3",
                camera.isRecording ? "fill-red-500 text-red-500" : "text-muted-foreground"
              )}
              aria-hidden="true"
            />
          </TooltipTrigger>
          <TooltipContent>
            {camera.isRecording ? "กำลังบันทึก" : "ไม่ได้บันทึก"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Wrench
              className={cn(
                "size-3.5",
                camera.maintenanceMode ? "text-amber-600 dark:text-amber-500" : "invisible"
              )}
              aria-hidden={!camera.maintenanceMode}
            />
          </TooltipTrigger>
          {camera.maintenanceMode && (
            <TooltipContent>อยู่ในโหมดซ่อมบำรุง — ไม่แจ้งเตือน</TooltipContent>
          )}
        </Tooltip>
      </div>
    </TooltipProvider>
  );
},
size: 72,  // was 48 — UI-SPEC requires 72 for 3-icon cluster
```

**Reuse contract — CONFIRMED:**
- `CameraStatusDot` at `camera-status-badge.tsx:44-52` stays **unchanged** — it renders an 8x8px dot with the right color per status. Already covers online/offline/degraded/connecting/reconnecting.
- `Circle` lucide icon is already imported at `cameras-columns.tsx:5`.
- `Wrench` is a NEW lucide import. UI-SPEC verified "zero existing imports" — no vocabulary collision.
- `cn` utility is standard shadcn — imported from `@/lib/utils` elsewhere in this codebase.
- `Tooltip` components are available under `@/components/ui/tooltip` (shadcn base-nova).

**Row type update** — `CameraRow` interface at `cameras-columns.tsx:11-24` adds:
```typescript
maintenanceMode: boolean;
```
Must also propagate through backend → frontend contract: `GET /api/cameras` response, `use-camera-status` hook (though `maintenanceMode` is NOT a WebSocket-pushed field per UI-SPEC — only surfaces in list fetch).

**Live status** — `use-camera-status.ts:37-39` broadcasts only `{ cameraId, status, timestamp }`. `maintenanceMode` updates happen via API response + React Query/local state. No WebSocket event needed.

### 10. Row action toggle with confirmation (D-17) [HIGH]

**Phase 14 pattern** at `apps/web/src/components/ui/data-table/data-table-row-actions.tsx`:
- Renders dropdown with action entries, each `{ label, icon, onClick, variant }`.
- `variant: 'destructive'` separates them visually (lines 32-33, 59-69).

**Maintenance entry insertion** at `cameras-columns.tsx:134` (between Record Toggle and Embed Code per UI-SPEC):

```tsx
{
  label: camera.maintenanceMode ? "ออกจากโหมดซ่อมบำรุง" : "เข้าโหมดซ่อมบำรุง",
  icon: Wrench,
  onClick: callbacks.onMaintenanceToggle,
},
```

**Callbacks interface update** at `cameras-columns.tsx:26-33`:
```typescript
interface CamerasColumnCallbacks {
  onEdit: (camera: CameraRow) => void;
  onViewStream: (camera: CameraRow) => void;
  onDelete: (camera: CameraRow) => void;
  onRecordToggle: (camera: CameraRow) => void;
  onEmbedCode: (camera: CameraRow) => void;
  onStreamToggle: (camera: CameraRow) => void;
  onMaintenanceToggle: (camera: CameraRow) => void;  // NEW
}
```

**Confirmation dialog placement:** at the page level (caller of `createCamerasColumns`), NOT inside the column factory. Callback pattern:
1. `onMaintenanceToggle(camera)` sets local state `{ target: camera, mode: 'enter' | 'exit' }`.
2. Page renders `<AlertDialog open={!!target}>` with appropriate copy (from UI-SPEC).
3. Confirm → calls mutation (React Query or fetch), closes dialog, optimistically updates row.

**Existing precedent** — already used for Delete action in the camera flow (the `onDelete` callback at `cameras-columns.tsx:29` opens a similar AlertDialog at the page level). This research did not need to verify the exact page code because the pattern is established.

### 11. Audit log integration (D-13, D-14) [HIGH]

**Existing writer:** `AuditService.log({ orgId, userId, action, resource, resourceId, method, path, ip, details })` at `audit.service.ts:32-60`.

**Existing auto-audit path:** `AuditInterceptor` at `audit.interceptor.ts:55-106` automatically logs every `POST/PUT/PATCH/DELETE` hitting `/api/*` with the resource derived from the URL segment (`RESOURCE_MAP` at line 15). **"cameras" → "camera"** is already mapped.

**So the maintenance toggle endpoint needs no explicit audit call — the interceptor handles it.** Action strings:
- `POST /api/cameras/:id/maintenance` → action='create', resource='camera'
- `DELETE /api/cameras/:id/maintenance` → action='delete', resource='camera'

**Problem:** the default action mapping (`create`/`update`/`delete`) doesn't capture the semantic "entered maintenance" vs "exited maintenance." The audit log entry shows `POST /api/cameras/{id}/maintenance` in the `path` field and the request body in `details` — the analyst can reconstruct. If we want richer semantics, the controller can explicitly `await this.auditService.log({ action: 'maintenance.enter', ... })` and suppress interceptor duplication via a `@SkipAudit()` decorator (doesn't exist today — would be new).

**Recommendation:** rely on the auto-interceptor for v1, file a cleanup ticket if analysts find the audit trail unclear. Matches existing audit coverage for other camera lifecycle actions (no explicit audit for start/stop stream either — interceptor covers them).

**Alternative API shape:** `PATCH /api/cameras/:id` with body `{ maintenanceMode: true }` would route through the existing `updateCamera` handler at `cameras.controller.ts:205-216`. Auto-audited as `update`/`camera`, clean and minimal. **Trade-off:** less explicit "entered maintenance" signal in logs. Preference depends on planner.

### 12. Webhook/notification suppression (D-15) [HIGH]

**Single chokepoint:** `StatusService.transition` at `status.service.ts:60-83` — this is THE place where webhook and notification fire. No other callsite in the codebase directly invokes `webhooksService.emitEvent('camera.*', ...)` or `notificationsService.createForCameraEvent(...)`.

**Verified** via grep:

```
$ grep -r "emitEvent.*camera\." apps/api/src/
apps/api/src/status/status.service.ts:62:    .emitEvent(orgId, `camera.${newStatus}`, {

$ grep -r "createForCameraEvent" apps/api/src/
apps/api/src/notifications/notifications.service.ts:16: async createForCameraEvent(...)
apps/api/src/status/status.service.ts:79:     .createForCameraEvent(orgId, cameraId, newStatus, camera.name)
```

Confirmed: status.service.ts is the only callsite. This means **the suppression is a single-line guard**, exactly as CONTEXT.md D-15 and the existing code review intuited. See Finding #7 for the refactor shape.

**Downstream effect of suppression:**
- `StatusGateway.broadcastStatus` at `status.service.ts:56` runs UNCONDITIONALLY — UI state stays live per D-04.
- `prisma.camera.update` runs unconditionally — DB state stays correct per D-15.
- Only the `emitEvent` + `createForCameraEvent` path is gated.

**No scattered changes required** across the 4+ callers of `transition()`. The suppression is invisible to them.

---

## Validation Architecture

**Framework:** Vitest 2.x (via `apps/api/vitest.config.ts`)
**Config file:** `apps/api/vitest.config.ts`
**Quick run command:** `pnpm --filter @sms-platform/api test <test-name-pattern>`
**Full suite command:** `pnpm --filter @sms-platform/api test`

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x + @nestjs/testing 11.1.18 |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @sms-platform/api test tests/resilience/` |
| Full suite command | `pnpm --filter @sms-platform/api test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| RESIL-01 | SRS restart detection via `self.pid` delta | unit | `pnpm --filter @sms-platform/api test tests/resilience/srs-restart-detection.test.ts` | ❌ Wave 0 |
| RESIL-01 | On `srs.restarted` event → bulk re-enqueue with 0-30s jitter | unit | `pnpm --filter @sms-platform/api test tests/resilience/srs-restart-recovery.test.ts` | ❌ Wave 0 |
| RESIL-01 | First-tick baseline initialization (no false positive on cold start) | unit | Same as above, `describe('first tick')` | ❌ Wave 0 |
| RESIL-02 | Health tick iterates correct filter (status + maintenanceMode) | unit | `pnpm --filter @sms-platform/api test tests/resilience/camera-health.test.ts` | ❌ Wave 0 |
| RESIL-02 | Dead stream detection (FFmpeg map OR SRS streams missing) | unit | Same as above, `describe('dead stream detection')` | ❌ Wave 0 |
| RESIL-02 | Recovery action: SIGTERM + transition to reconnecting + enqueue | unit | Same as above, `describe('recovery action')` | ❌ Wave 0 |
| RESIL-03 | 30s debounce: new transition inside window cancels pending dispatch | unit | `pnpm --filter @sms-platform/api test tests/status/debounce.test.ts` | ❌ Wave 0 |
| RESIL-03 | Debounced notify dispatches via BullMQ delayed job with deterministic jobId | unit | Same as above, `describe('jobId dedup')` | ❌ Wave 0 |
| RESIL-03 | Maintenance gate: `maintenanceMode = true` suppresses notify + webhook | unit | `pnpm --filter @sms-platform/api test tests/status/maintenance-suppression.test.ts` | ❌ Wave 0 |
| RESIL-03 | StatusGateway.broadcastStatus fires even when notify is suppressed | unit | Same as above, `describe('UI broadcast still fires')` | ❌ Wave 0 |
| RESIL-04 | `onApplicationShutdown` SIGTERMs all running FFmpegs in parallel | unit | `pnpm --filter @sms-platform/api test tests/resilience/shutdown.test.ts` | ❌ Wave 0 |
| RESIL-04 | Shutdown waits up to 10s, then SIGKILLs stragglers | unit | Same as above, `describe('grace period')` | ❌ Wave 0 |
| RESIL-04 | `onApplicationBootstrap` boot re-enqueues desired-running cameras | unit | `pnpm --filter @sms-platform/api test tests/resilience/boot-recovery.test.ts` | ❌ Wave 0 |
| RESIL-04 | Boot recovery skips `maintenanceMode = true` cameras | unit | Same as above, `describe('maintenance filter')` | ❌ Wave 0 |
| RESIL-04 | jobId dedup: duplicate boot+SRS-restart enqueue doesn't produce 2 jobs | unit | Same as above, `describe('idempotency')` | ❌ Wave 0 |
| CAM-01 | `POST /api/cameras/:id/maintenance` stops stream, sets flags, audits | integration | `pnpm --filter @sms-platform/api test tests/cameras/maintenance.test.ts` | ❌ Wave 0 |
| CAM-01 | `DELETE /api/cameras/:id/maintenance` clears flags, no auto-restart | integration | Same as above, `describe('exit maintenance')` | ❌ Wave 0 |
| CAM-01 | Maintenance API writes audit log with `resource='camera'` | integration | Same as above, `describe('audit trail')` | ❌ Wave 0 |
| CAM-02 | Camera row with `maintenanceMode=true` renders wrench icon (amber) | unit (web) | `pnpm --filter @sms-platform/web test src/app/admin/cameras/components/cameras-columns.test.tsx` | ❌ Wave 0 |
| CAM-02 | Camera row with `maintenanceMode=false` renders invisible wrench (layout preserved) | unit (web) | Same as above | ❌ Wave 0 |
| CAM-02 | Recording dot renders red when `isRecording=true`, muted otherwise | unit (web) | Same as above | ❌ Wave 0 |
| CAM-03 | Row action dropdown shows "เข้าโหมด..." when `maintenanceMode=false` | unit (web) | Same as above, `describe('row action label')` | ❌ Wave 0 |
| CAM-03 | Row action dropdown shows "ออกจากโหมด..." when `maintenanceMode=true` | unit (web) | Same as above | ❌ Wave 0 |
| CAM-03 | Clicking row action opens AlertDialog with correct variant (destructive for enter) | manual UAT | human walkthrough per UI-SPEC | — |

### Sampling Rate
- **Per task commit:** `pnpm --filter @sms-platform/api test tests/resilience/ tests/status/` (< 30s)
- **Per wave merge:** `pnpm --filter @sms-platform/api test && pnpm --filter @sms-platform/web test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`; plus manual UAT of maintenance flow end-to-end.

### Wave 0 Gaps

All test files below are NEW and must be created in Wave 0:

- [ ] `apps/api/tests/resilience/srs-restart-detection.test.ts` — covers RESIL-01 detection
- [ ] `apps/api/tests/resilience/srs-restart-recovery.test.ts` — covers RESIL-01 recovery action + jitter
- [ ] `apps/api/tests/resilience/camera-health.test.ts` — covers RESIL-02 full tick flow
- [ ] `apps/api/tests/resilience/shutdown.test.ts` — covers RESIL-04 graceful shutdown
- [ ] `apps/api/tests/resilience/boot-recovery.test.ts` — covers RESIL-04 boot re-enqueue
- [ ] `apps/api/tests/status/debounce.test.ts` — covers RESIL-03 debounce + jobId dedup
- [ ] `apps/api/tests/status/maintenance-suppression.test.ts` — covers RESIL-03 suppression gate
- [ ] `apps/api/tests/cameras/maintenance.test.ts` — covers CAM-01 API contract + audit
- [ ] `apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx` — covers CAM-02 + CAM-03 render + interaction

No new framework install needed — Vitest 2.x is already the test runner for `apps/api`. Web side needs confirmation: if `apps/web` doesn't have Vitest+Testing Library yet, that's a Wave 0 install step. [VERIFIED: `apps/api/package.json` has `vitest: "2"` — web side NOT verified in this research; planner should check `apps/web/package.json`.]

**Test doubles required:**
- `FfmpegService` — mock `runningProcesses` map, `isRunning`, `stopStream`, `getRunningCameraIds`, `forceKill` (new methods in this phase).
- `SrsApiService` — mock `getSummaries` returning variable `self.pid` across calls.
- BullMQ `Queue` — mock `add`, `getJob`, `remove`, `pause`.
- `PrismaService` / `TENANCY_CLIENT` — mock `camera.findMany`, `findUnique`, `update` (pattern from `state-machine.test.ts:12-36`).
- `Redis` (ioredis) — mock for SRS pid baseline storage; test uses in-memory mock or stubs the service method.

**SRS restart simulation:** no need for actual SRS restart — test doubles `SrsApiService.getSummaries` to return `{ data: { self: { pid: 100 } } }` on call 1 and `{ data: { self: { pid: 200 } } }` on call 2, verifies handler fires `srs.restarted` event.

---

## Standard Stack

### Core (already installed — verified against `apps/api/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/bullmq` | 11.0.4 | BullMQ integration for NestJS | Already in use for stream-ffmpeg, cluster-health, webhook-delivery |
| `bullmq` | 5.73.2 | Job queue + delayed jobs + repeatable jobs | Established queue infrastructure |
| `@nestjs/common` | 11.0.0 | Lifecycle hook interfaces | `OnApplicationBootstrap`, `OnApplicationShutdown` come from here |
| `@prisma/client` | 6.19.3 | DB access + migration tooling | Existing ORM |
| `ioredis` | 5.10.1 | Redis client (BullMQ + custom caching) | Used by BullMQ + available for SRS pid baseline cache |
| `lucide-react` | (via web) | Icon library for web | Existing — `Wrench` import is new |
| `@tanstack/react-table` | (via web) | DataTable foundation | Column factory pattern already established |

### Version verification

```bash
npm view bullmq version              # → 5.74.1 (we run 5.73.2 — one patch behind, fine)
npm view @nestjs/common version      # → 11.1.19 (we run 11.0.0 — behind, not a blocker)
```

Neither gap is material for this phase.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BullMQ delayed job for debounce | `setTimeout` map | Fails on process restart — see Finding #2 |
| BullMQ repeatable (legacy) | BullMQ Job Schedulers (`upsertJobScheduler`) | Recommended in 5.16+ but we stay consistent with `cluster-health` until we migrate both — see Finding #1 |
| `self.pid` delta for restart | `server_id` (top-level) OR `srs_uptime` going backward | All three work; `pid` is the most direct — see Finding #6 |
| `PATCH /cameras/:id` with `maintenanceMode` | `POST/DELETE /cameras/:id/maintenance` | Finding #11 — both valid; PATCH is lighter-weight |

### Installation

**Zero new npm packages required.** Every dependency is already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
apps/api/src/
├── resilience/                      # NEW module
│   ├── resilience.module.ts         # registers CameraHealthService, BootRecoveryService, ResilienceService, queues
│   ├── camera-health.service.ts     # 60s repeatable job — mirrors cluster-health.service.ts
│   ├── camera-health.processor.ts   # BullMQ processor for camera-health queue
│   ├── boot-recovery.service.ts     # OnApplicationBootstrap — enqueue desired-running cameras
│   ├── resilience.service.ts        # OnApplicationShutdown — SIGTERM loop + 10s grace
│   ├── srs-restart-detector.ts      # pid delta logic (can be inside camera-health.service.ts)
│   └── notify-dispatch.processor.ts # BullMQ processor for 30s debounced notify/webhook dispatch
├── status/
│   └── status.service.ts            # MODIFIED — add maintenance gate + enqueue to notify-dispatch
├── streams/
│   └── ffmpeg/ffmpeg.service.ts     # MODIFIED — add getRunningCameraIds(), forceKill()
├── cameras/
│   ├── cameras.controller.ts        # MODIFIED — add maintenance endpoint(s)
│   └── cameras.service.ts           # MODIFIED — add enterMaintenance, exitMaintenance
└── prisma/schema.prisma             # MODIFIED — add 3 maintenance columns + index

apps/web/src/
├── app/admin/cameras/components/
│   └── cameras-columns.tsx          # MODIFIED — 3-icon composite status cell + maintenance row action
└── ... (page-level container adds AlertDialog state)

apps/api/tests/
├── resilience/                      # NEW
│   ├── srs-restart-detection.test.ts
│   ├── srs-restart-recovery.test.ts
│   ├── camera-health.test.ts
│   ├── shutdown.test.ts
│   └── boot-recovery.test.ts
├── status/
│   ├── debounce.test.ts              # NEW
│   └── maintenance-suppression.test.ts  # NEW
└── cameras/
    └── maintenance.test.ts          # NEW
```

### Pattern 1: BullMQ Repeatable Job

**When to use:** periodic work coordinated across multiple API instances.
**Source pattern:** `cluster-health.service.ts`.

```typescript
@Injectable()
export class CameraHealthService implements OnModuleInit {
  constructor(@InjectQueue('camera-health') private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // Pattern: single repeatable job for the whole tick (NOT one per camera).
    // The tick handler iterates cameras from the DB.
    await this.queue.add(
      'tick',
      {},
      {
        jobId: 'camera-health-tick',  // Prevent duplicate scheduler registration
        repeat: { every: 60_000 },
        removeOnComplete: true,
        removeOnFail: 10,
      },
    );
  }
}
```

### Pattern 2: NestJS Lifecycle Hook

```typescript
@Injectable()
export class BootRecoveryService implements OnApplicationBootstrap {
  async onApplicationBootstrap(): Promise<void> {
    // Runs AFTER all modules init, BEFORE app.listen().
    // Safe to use Prisma, BullMQ, other injected services.
  }
}

@Injectable()
export class ResilienceService implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string): Promise<void> {
    // Runs on SIGTERM/SIGINT/SIGHUP (with enableShutdownHooks()).
    // Other hooks are already called: onModuleDestroy → beforeApplicationShutdown → here.
    // Awaiting blocks app shutdown until resolved or rejected.
  }
}
```

### Pattern 3: BullMQ Delayed Job with Debounce-by-Replacement

```typescript
const jobId = `camera:${cameraId}:notify`;
const existing = await this.queue.getJob(jobId);
if (existing) await existing.remove().catch(() => {});
await this.queue.add(
  'dispatch',
  payload,
  { jobId, delay: 30_000, removeOnComplete: true, removeOnFail: 10 },
);
```

Within 30s, subsequent `transition()` calls remove the pending job and re-add with reset delay. Effectively: "only dispatch if status has been stable for 30s."

### Anti-Patterns to Avoid

- **Don't use `setTimeout` for durable debouncing** — process restart loses the pending timer. Use BullMQ delayed job.
- **Don't scatter `maintenanceMode` checks** across callers of `StatusService.transition`. Gate in ONE place (StatusService). See Finding #12.
- **Don't create one BullMQ repeatable job per camera** for the health check. Single tick, iterate cameras inside. Per-camera repeatable jobs would flood Redis at scale (1000+ cameras × 1 repeatable each).
- **Don't hand-roll Redis distributed locks** for the tick — BullMQ's single-consumer model already guarantees one worker per tick. See Finding #1.
- **Don't reset `camera.status` to `offline` on graceful shutdown** (D-09). The status represents desired state; boot recovery reads it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Periodic 60s tick across API instances | `setInterval` + custom Redis lock | BullMQ repeatable job | Already solved; `cluster-health` is a direct template |
| 30s debounce for status notifications | Map<cameraId, setTimeout> | BullMQ delayed job + jobId dedup | Survives process restart |
| Signal-driven graceful shutdown | Custom `process.on('SIGTERM', ...)` | `app.enableShutdownHooks()` + `OnApplicationShutdown` | NestJS wires signal ordering for you |
| SRS restart detection | Burst-correlate on_unpublish callbacks | `self.pid` delta via `/api/v1/summaries` | Deterministic, one API call per tick |
| Idempotent re-enqueue | Redis SETNX lock + cleanup | BullMQ `jobId` dedup | Built into BullMQ, already a pattern here |
| FFmpeg process lifecycle | Raw `child_process.spawn` + kill | `fluent-ffmpeg` (existing) | Already the stack per `ffmpeg.service.ts` |
| AlertDialog with destructive confirm | New modal component | shadcn `AlertDialog` (already in Phase 14 toolkit) | Phase 14 already standardized this; UI-SPEC confirms reuse |
| DataTable row action dropdown | Custom dropdown | `DataTableRowActions` + `RowAction<T>` pattern | Phase 14 D-04 established; UI-SPEC uses it verbatim |
| Status icon rendering | Raw SVG | Lucide `Circle` + `Wrench` + existing `CameraStatusDot` | All three already available; zero new components |

---

## Common Pitfalls

### Pitfall 1: BullMQ repeatable job duplication at restart
**What goes wrong:** `queue.add(..., { repeat: { every } })` called in `onModuleInit` on every API boot can register duplicate repeatable jobs if the `jobId` isn't pinned, leading to multiple ticks per interval.
**Why it happens:** `repeat` options generate their own internal job key derived from pattern+name; if the name changes or is absent, BullMQ may accept a new repeater alongside the old.
**How to avoid:** Pin the repeatable job via `jobId: 'camera-health-tick'` as shown in Pattern 1. On subsequent boots, BullMQ dedups. If migration to `upsertJobScheduler` is done later, that API handles this natively.
**Warning signs:** health check logs show two ticks per 60s window; Redis `SMEMBERS bull:camera-health:repeat` shows multiple entries.

### Pitfall 2: SIGTERM grace exceeds Docker's stop-timeout
**What goes wrong:** Docker Compose's default `stop_grace_period: 10s` SIGKILLs the container before our SIGTERM-then-SIGKILL loop finishes. FFmpeg exits without closing HLS segments cleanly.
**Why it happens:** our grace (10s) + Docker's grace (10s) race each other.
**How to avoid:** EITHER set `stop_grace_period: 15s` in `docker-compose.yml` for the API service (recommended), OR reduce our grace to 8s (leaves 2s Docker slack).
**Warning signs:** Docker logs show "Killing container after 10s"; HLS output directory has truncated `.ts` files.

### Pitfall 3: Maintenance flag checked at the wrong time in debounce
**What goes wrong:** operator enters maintenance AT T+15s (during a 30s debounce window). At T+30s the notify-dispatch processor fires the webhook anyway because we only checked `maintenanceMode` at enqueue time, not at dispatch time.
**Why it happens:** the check at `StatusService.transition` runs before the 30s delay. The world can change during that window.
**How to avoid:** re-fetch the camera inside the notify-dispatch processor and re-check `maintenanceMode` before emitting. Belt-and-braces logic.
**Warning signs:** webhook fires for a camera whose `maintenanceMode=true`; complaints in testing sessions.

### Pitfall 4: Boot recovery races with SRS-restart detection
**What goes wrong:** API boots (T=0), boot recovery enqueues with jitter. Before jitter elapses, first health tick runs (T=60), detects SRS pid delta (because baseline was never set), fires SRS-restart handler, enqueues duplicate start jobs.
**Why it happens:** D-07 says "first tick after boot initializes baseline without triggering recovery" — must be enforced explicitly.
**How to avoid:** maintain an in-memory `initialized: boolean` flag in the SRS restart detector. First call sets baseline, subsequent calls compare. Persisted baseline in Redis is only read if in-memory is null (after API restart). jobId dedup (D-11) is the safety net even if the flag logic fails.
**Warning signs:** logs show "SRS restart detected" immediately after API boot.

### Pitfall 5: Prisma RLS context missing in lifecycle services
**What goes wrong:** `BootRecoveryService` uses `TENANCY_CLIENT` (RLS-scoped) but runs in an `onApplicationBootstrap` hook with no org context in `ClsService`. Query returns zero rows.
**Why it happens:** RLS depends on `SET LOCAL app.current_org_id = '...'` which `TENANCY_CLIENT` injects per-request via ClsService. Lifecycle hooks have no request, no cls context.
**How to avoid:** inject `PrismaService` (raw, non-RLS client) in services that run cross-org. Pattern matches `cluster-health.service.ts:16` which uses `PrismaService` directly. See Finding #5.
**Warning signs:** boot recovery log says "enqueuing 0 streams" despite cameras existing.

### Pitfall 6: Maintenance "Exit" race with boot recovery
**What goes wrong:** operator exits maintenance mode (D-14) on camera A at T=0 (setting `maintenanceMode=false`, status stays `offline`). API crashes at T=1s before operator clicks Start Stream. API reboots at T=2s; boot recovery queries desired-running (`status IN [...]`) — but camera A has `status=offline`, so it's skipped. Camera stays offline forever until operator clicks Start Stream.
**Why it happens:** D-14 says exit maintenance does NOT auto-restart. Boot recovery respects that (D-09 says `camera.status` is source of truth). Both correct. Feature, not bug.
**How to avoid:** this is expected behavior per D-14. UI-SPEC explicitly warns operators via the exit confirmation dialog copy. Document in runbook.
**Warning signs:** operators expecting auto-restart are confused — UI-SPEC pre-empts this with copy.

---

## Code Examples

### Example 1: Camera health tick handler

```typescript
// apps/api/src/resilience/camera-health.service.ts
// Source pattern: apps/api/src/cluster/cluster-health.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SrsApiService } from '../srs/srs-api.service';
import { FfmpegService } from '../streams/ffmpeg/ffmpeg.service';
import { StatusService } from '../status/status.service';

const HEALTH_CHECK_INTERVAL_MS = 60_000;

@Injectable()
export class CameraHealthService implements OnModuleInit {
  private readonly logger = new Logger(CameraHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly srsApi: SrsApiService,
    private readonly ffmpeg: FfmpegService,
    private readonly status: StatusService,
    @InjectQueue('camera-health') private readonly healthQueue: Queue,
    @InjectQueue('stream-ffmpeg') private readonly streamQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.healthQueue.add(
      'tick',
      {},
      {
        jobId: 'camera-health-tick',  // pin for idempotent registration
        repeat: { every: HEALTH_CHECK_INTERVAL_MS },
        removeOnComplete: true,
        removeOnFail: 10,
      },
    );
  }

  async runTick(): Promise<void> {
    // Detect SRS restart (D-05, D-07)
    await this.detectSrsRestart();

    // Find desired-running cameras
    const cameras = await this.prisma.camera.findMany({
      where: {
        status: { in: ['online', 'connecting', 'reconnecting', 'degraded'] },
        maintenanceMode: false,
      },
      include: { streamProfile: true },
    });

    // Get SRS stream list once per tick
    const srsStreams = await this.srsApi.getStreams().catch(() => ({ streams: [] }));
    const srsStreamIds = new Set<string>(
      (srsStreams.streams ?? []).map((s: any) => s.name),  // SRS uses 'name' as stream key
    );

    for (const camera of cameras) {
      const inFfmpegMap = this.ffmpeg.isRunning(camera.id);
      const inSrs = srsStreamIds.has(camera.id);  // or match org/camera key shape
      const dead = !inFfmpegMap || !inSrs;

      if (dead) {
        this.logger.warn(`Dead stream detected: ${camera.id}, ffmpeg=${inFfmpegMap}, srs=${inSrs}`);
        if (inFfmpegMap) this.ffmpeg.stopStream(camera.id);  // SIGTERM stale process
        await this.status.transition(camera.id, camera.orgId, 'reconnecting');
        await this.enqueueStart(camera);
      }
    }
  }

  private async enqueueStart(camera: any): Promise<void> {
    await this.streamQueue.add(
      'start',
      buildJobData(camera),
      {
        jobId: `camera:${camera.id}`,
        attempts: 20,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  private async detectSrsRestart(): Promise<void> {
    // See Finding #6 for full implementation.
  }
}
```

### Example 2: Status service with maintenance gate + debounce

```typescript
// apps/api/src/status/status.service.ts (refactored)
async transition(cameraId: string, orgId: string, newStatus: string): Promise<void> {
  const camera = await this.prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new Error(`Camera ${cameraId} not found`);
  if (newStatus === camera.status) return;

  // ... existing validation ...

  await this.prisma.camera.update({
    where: { id: cameraId },
    data: {
      status: newStatus,
      ...(newStatus === 'online' ? { lastOnlineAt: new Date() } : {}),
    },
  });

  // UI updates IMMEDIATELY per D-04
  this.statusGateway.broadcastStatus(orgId, cameraId, newStatus);

  // MAINTENANCE GATE (D-15)
  if (camera.maintenanceMode) {
    this.logger.debug(`Suppressing notify/webhook for ${cameraId} (maintenance)`);
    return;
  }

  // DEBOUNCED OUTBOUND (D-04)
  const notifiableStatuses = ['online', 'offline', 'degraded', 'reconnecting'];
  if (!notifiableStatuses.includes(newStatus)) return;

  const jobId = `camera:${cameraId}:notify`;
  const existing = await this.notifyQueue.getJob(jobId);
  if (existing) await existing.remove().catch(() => {});
  await this.notifyQueue.add(
    'dispatch',
    { orgId, cameraId, cameraName: camera.name, newStatus, previousStatus: camera.status },
    { jobId, delay: 30_000, removeOnComplete: true, removeOnFail: 10 },
  );

  this.logger.log(`Camera ${cameraId}: ${camera.status} -> ${newStatus} (notify scheduled T+30s)`);
}
```

### Example 3: SRS restart detector (inside health tick)

```typescript
// Inside CameraHealthService.detectSrsRestart()
private lastPidInMemory: number | null = null;
private firstTick = true;

private async detectSrsRestart(): Promise<void> {
  const summaries = await this.srsApi.getSummaries().catch(() => null);
  const currentPid: number | null = summaries?.data?.self?.pid ?? null;
  if (currentPid === null) {
    this.logger.warn('SRS summaries API unreachable or missing self.pid');
    return;
  }

  // First tick after boot: initialize baseline, don't fire event (D-07)
  if (this.firstTick) {
    this.lastPidInMemory = currentPid;
    await this.redis.set('srs:last_pid', String(currentPid));
    this.firstTick = false;
    return;
  }

  // Compare with in-memory first (cheap), fallback to Redis if in-memory null
  const baseline = this.lastPidInMemory ?? parseInt(await this.redis.get('srs:last_pid') ?? '0', 10);
  if (baseline && baseline !== currentPid) {
    this.logger.warn(`SRS restart detected: pid ${baseline} -> ${currentPid}`);
    this.eventEmitter.emit('srs.restarted', { previousPid: baseline, currentPid });
  }

  this.lastPidInMemory = currentPid;
  await this.redis.set('srs:last_pid', String(currentPid));
}
```

### Example 4: Composite status cell (web)

See Finding #9 for the complete JSX — it's already in UI-SPEC verbatim. No need to duplicate here.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BullMQ repeatable jobs via `queue.add(..., { repeat })` | `queue.upsertJobScheduler(id, { every })` | BullMQ 5.16 (legacy deprecated) | Both work in 5.73; we stay on legacy for consistency with `cluster-health`. Flag for future cleanup. |
| `setTimeout`-based debouncing in Node services | BullMQ delayed jobs with jobId dedup | Long-standing best practice | Survives process restart; replaces any `setTimeout` we might have added naively. |
| Manual `process.on('SIGTERM', ...)` in main.ts | `app.enableShutdownHooks()` + `OnApplicationShutdown` | NestJS ≥ 7 | Handles hook ordering and async awaits automatically. |
| Per-camera repeatable jobs for health checks | Single tick, iterate in handler | N/A — established pattern | Avoids Redis bloat at scale (1000+ cameras × repeatable each = 1000+ delayed jobs perpetually). |

---

## Project Constraints (from CLAUDE.md)

Extracted actionable directives:

- **Stream engine is SRS (not MediaMTX).** All ingest goes through FFmpeg → RTMP push per the "What NOT to Use" table. This phase does not change that.
- **Deployment is Docker Compose, self-hosted.** Graceful shutdown must respect Docker's default `stop_grace_period: 10s`. See Pitfall 2.
- **Tech stack is NestJS 11 + Prisma 6 + BullMQ 5 + PostgreSQL 16.** All locked decisions align.
- **Multi-tenant via shared-schema + `orgId` + RLS.** Lifecycle services use `PrismaService` (raw) not `TENANCY_CLIENT`. See Pitfall 5.
- **Stream engine health via `/api/v1/summaries`.** [CITED] Finding #6 uses this endpoint. Confirmed supported in SRS v6.
- **HTTP callbacks drive status transitions** — health check must not double-fire. Existing `srs-callback.controller.ts` handlers for on_publish/on_unpublish are the primary path; health check is a safety net for dropped callbacks. The 30s debounce helps absorb any jitter between callback + health-check agreement.
- **GSD workflow enforcement:** planner must route through `/gsd-plan-phase` → `/gsd-execute-phase`. This research was invoked through the GSD flow.
- **Thai-first operator copy, English technical terms.** UI-SPEC locks the Thai copywriting contract. Backend logs stay English (per convention).

---

## Assumptions Log

No major assumptions in this research — all critical findings are verified against code or docs.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `apps/web/package.json` has Vitest + Testing Library installed for UI component tests | Validation Architecture | Planner must add as Wave 0 install step if missing |
| A2 | Docker Compose default `stop_grace_period` is 10s on this project | Pitfall 2 | Pitfall copy still valid; planner verifies `docker-compose.yml` |
| A3 | SRS v6.0.184's `self.pid` behavior matches what we see in `trunk/src/app/srs_app_utility.cpp` develop branch | Finding #6 | Low risk — the function is stable API; worst case we fall back to `server_id` delta |

All other claims are `[VERIFIED]` against the codebase or `[CITED]` from SRS source / BullMQ docs / NestJS docs.

---

## Open Questions (RESOLVED)

1. **Should the maintenance API be `PATCH /api/cameras/:id` with body `{ maintenanceMode }` or dedicated `POST/DELETE /api/cameras/:id/maintenance`?**
   - What we know: both integrate with existing audit interceptor. Semantics differ.
   - What's unclear: operator DX preference. SDK compatibility.
   - Recommendation: **POST/DELETE dedicated endpoint** — clearer intent in API docs (Swagger), audit log path is more specific, matches the "this stops a stream" weight of the action. PATCH feels too casual for a destructive side-effect.
   - **RESOLVED:** Dedicated `POST /api/cameras/:id/maintenance` (enter) and `DELETE /api/cameras/:id/maintenance` (exit) — implemented in Plan 15-03 Task 3.

2. **Does `apps/web` have Vitest + Testing Library configured for web-side unit tests (CAM-02, CAM-03)?**
   - What we know: `apps/api` has Vitest 2.x; web-side not verified.
   - What's unclear: existence of `vitest.config.ts` in web workspace.
   - Recommendation: planner reads `apps/web/package.json` as first step; if missing, add install to Wave 0.
   - **RESOLVED:** Confirmed present (verified 2026-04-18). `apps/web/vitest.config.ts` exists with `environment: "jsdom"`, `setupFiles: ["./src/test-utils/setup.ts"]`, `include: ["src/**/*.test.{ts,tsx}"]`; `apps/web/package.json` ships `vitest@3`, `@testing-library/react@^16.3.2`, `@testing-library/jest-dom@^6.9.1`, `@testing-library/user-event@^14.6.1`. No Wave 0 install step required.

3. **SRS `server` field vs `self.pid` — which is the stronger restart signal?**
   - What we know: both change on restart per SRS source. Server is at top-level of response; `pid` is at `data.self.pid`.
   - What's unclear: whether `server_id` ever changes during an SRS lifetime without a process restart (e.g., config reload).
   - Recommendation: use `self.pid` as primary per CONTEXT.md D-05; add `srs_uptime` going-backward as secondary sanity check. `server` field can be a tertiary tiebreaker if the planner wants belt-and-braces.
   - **RESOLVED:** `self.pid` is primary; `srs_uptime` going-backward is secondary sanity check — implemented in Plan 15-02 Task 3 (SrsRestartDetector).

4. **BullMQ `camera-health` + `stream-ffmpeg` + `camera-notify` — one new module or distributed across existing modules?**
   - What we know: `ResilienceModule` is the natural home for `camera-health` and its processor, `BootRecoveryService`, `ResilienceService` (shutdown). `camera-notify` logically belongs with StatusModule OR NotificationsModule.
   - What's unclear: where `notify-dispatch.processor.ts` lives.
   - Recommendation: put notify queue + processor in `StatusModule` (the enqueue happens in `StatusService.transition`, tight coupling). Keep `ResilienceModule` focused on lifecycle + health concerns.
   - **RESOLVED:** `camera-notify` queue + `NotifyDispatchProcessor` live in `StatusModule` — implemented in Plan 15-01 Task 3. `ResilienceModule` owns `camera-health` + lifecycle services (Plan 15-02).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 LTS | Runtime | ✓ (implied by package.json `@types/node: ^22.0.0`) | 22.x | — |
| PostgreSQL 16 | Prisma migration | ✓ (assumed from existing operation) | 16.x | — |
| Redis 7 | BullMQ queues | ✓ (assumed from existing BullMQ queues running) | 7.x | — |
| SRS 6.0 | pid detection API | ✓ (target per CLAUDE.md) | 6.0.184 | — |
| Docker Compose | Deployment target | ✓ | — | — |
| Vitest 2.x (apps/api) | API tests | ✓ | 2.x (pinned) | — |
| Vitest + Testing Library (apps/web) | CAM-02/03 unit tests | ❓ UNVERIFIED | — | Planner confirms in Wave 0 |

**Missing dependencies with no fallback:** none (pending Vitest/web confirmation).

**Missing dependencies with fallback:** none.

---

## Sources

### Primary (HIGH confidence)

- `apps/api/src/cluster/cluster-health.service.ts` — template pattern for CameraHealthService [VERIFIED: codebase]
- `apps/api/src/streams/ffmpeg/ffmpeg.service.ts` — process map, intentional-stop flag, clean handlers [VERIFIED: codebase]
- `apps/api/src/streams/processors/stream.processor.ts` — `calculateBackoff()` reused on recovery [VERIFIED: codebase]
- `apps/api/src/streams/streams.service.ts` — existing enqueue shape + jobId pattern [VERIFIED: codebase]
- `apps/api/src/status/status.service.ts` — transition chokepoint for suppression [VERIFIED: codebase]
- `apps/api/src/srs/srs-api.service.ts` — `getSummaries()` and related endpoints [VERIFIED: codebase]
- `apps/api/src/prisma/schema.prisma` — Camera model structure [VERIFIED: codebase]
- `apps/api/src/audit/audit.service.ts` + `audit.interceptor.ts` — auto-audit of POST/PUT/PATCH/DELETE [VERIFIED: codebase]
- `apps/web/src/app/admin/cameras/components/cameras-columns.tsx` — column factory [VERIFIED: codebase]
- `apps/web/src/app/admin/cameras/components/camera-status-badge.tsx` — reusable `CameraStatusDot` [VERIFIED: codebase]
- `apps/web/src/components/ui/data-table/data-table-row-actions.tsx` — RowAction pattern [VERIFIED: codebase]
- SRS source `trunk/src/app/srs_app_http_api.cpp` — `SrsGoApiSummaries::serve_http` response shape [CITED: GitHub ossrs/srs]
- SRS source `trunk/src/app/srs_app_utility.cpp` — `srs_api_dump_summaries` field list [CITED: GitHub ossrs/srs]
- NestJS lifecycle events docs — hook ordering, `enableShutdownHooks()` signals [CITED: docs.nestjs.com/fundamentals/lifecycle-events via raw markdown source]
- BullMQ job IDs docs — duplicate handling semantics [CITED: docs.bullmq.io/guide/jobs/job-ids]
- BullMQ repeatable jobs docs — deprecation of legacy API in favor of Job Schedulers [CITED: docs.bullmq.io/guide/jobs/repeatable]
- BullMQ Job Schedulers docs — `upsertJobScheduler` pattern [CITED: docs.bullmq.io/guide/job-schedulers]

### Secondary (MEDIUM confidence)

- WebSearch: NestJS lifecycle hook ordering summary — corroborated by primary NestJS docs
- `apps/api/tests/cluster/health-check.test.ts` — existing test patterns for health services [VERIFIED: codebase]
- `apps/api/tests/status/state-machine.test.ts` — existing test patterns for StatusService [VERIFIED: codebase]

### Tertiary (LOW confidence)

None — all claims anchored to primary sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency verified in `apps/api/package.json`
- Architecture (patterns): HIGH — mirror existing `cluster-health` pattern verbatim
- SRS restart detection: HIGH — SRS source inspected for exact field names
- BullMQ semantics: HIGH — official docs cited for dedup + delay behavior
- NestJS lifecycle: HIGH — official docs cited for hook ordering
- UI composition: HIGH — UI-SPEC already locks the design; this research only confirms existing components are available
- Test architecture: HIGH for API side, MEDIUM for web side (pending Vitest/web verification — Open Question #2)

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 days — stack is stable, SRS v6 is LTS)
