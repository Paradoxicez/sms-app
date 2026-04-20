---
phase: quick-260420-oid
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/playback/playback.service.ts
  - apps/api/src/webhooks/webhooks.service.ts
  - apps/api/src/webhooks/webhook-delivery.processor.ts
  - apps/api/src/notifications/notifications.service.ts
  - apps/api/src/recordings/recordings.service.ts
  - apps/api/src/settings/settings.service.ts
autonomous: false
requirements:
  - OID-01
  - OID-02
  - OID-03
must_haves:
  truths:
    - "GET /api/playback/sessions/:id returns the session JSON for a valid, unexpired session (no longer 404 due to RLS)"
    - "SRS on_play callback returns {code:0} for a valid playback token (live preview + embed page can play)"
    - "Camera status transitions emit WebhookDelivery rows AND user-facing Notifications (no silent zero-write)"
    - "ScheduleProcessor cron successfully starts and stops recordings (Recording row created, camera.isRecording flips)"
    - "WebhookDeliveryProcessor updates WebhookDelivery rows with responseStatus / responseBody after HTTP POST (no longer stuck Pending)"
    - "API boot regenerates srs.conf without the 'Failed to regenerate SRS config on boot (using static config)' warning"
    - "checkAndAlertStorageQuota writes Notification rows when usage crosses 80%/90% (no silent RLS denial)"
  artifacts:
    - path: apps/api/src/playback/playback.service.ts
      provides: "Dual-injection (tenantPrisma + systemPrisma); getSession + verifyToken use systemPrisma; createSession/createBatchSessions/listSessionsByCamera keep tenantPrisma"
      contains: "SystemPrismaService"
    - path: apps/api/src/webhooks/webhooks.service.ts
      provides: "Dual-injection; emitEvent uses systemPrisma with explicit orgId scoping; CRUD methods keep tenantPrisma"
      contains: "SystemPrismaService"
    - path: apps/api/src/webhooks/webhook-delivery.processor.ts
      provides: "Single-injection swap to SystemPrismaService (BullMQ worker, no CLS)"
      contains: "SystemPrismaService"
    - path: apps/api/src/notifications/notifications.service.ts
      provides: "Dual-injection; createForCameraEvent + createSystemAlert use systemPrisma (rawPrisma calls there also swapped); HTTP CRUD keeps tenantPrisma"
      contains: "SystemPrismaService"
    - path: apps/api/src/recordings/recordings.service.ts
      provides: "Triple-injection (tenantPrisma + systemPrisma + rawPrisma kept for non-tenant Organization/package); worker/callback methods (startRecording, stopRecording, getActiveRecording, archiveSegment, archiveInitSegment, checkStorageQuota aggregate, checkAndAlertStorageQuota notification writes) use systemPrisma; HTTP-context methods (incl. getRecording with T-17-V4 mitigation) keep tenantPrisma"
      contains: "SystemPrismaService"
    - path: apps/api/src/settings/settings.service.ts
      provides: "Dual-injection; onModuleInit boot path uses systemPrisma; HTTP-context updateSystemSettings/getSystemSettings keep tenantPrisma"
      contains: "SystemPrismaService"
  key_links:
    - from: apps/api/src/playback/playback.service.ts
      to: apps/api/src/prisma/system-prisma.service.ts
      via: "constructor injection — `private readonly systemPrisma: SystemPrismaService`"
      pattern: "systemPrisma\\.playbackSession\\.findUnique|systemPrisma\\.playbackSession\\.findFirst"
    - from: apps/api/src/webhooks/webhook-delivery.processor.ts
      to: apps/api/src/prisma/system-prisma.service.ts
      via: "single-injection swap — replaces TENANCY_CLIENT entirely"
      pattern: "systemPrisma\\.webhookDelivery\\.update|private readonly prisma: SystemPrismaService"
    - from: apps/api/src/recordings/recordings.service.ts
      to: apps/api/src/prisma/system-prisma.service.ts
      via: "triple-injection; worker paths route through systemPrisma with explicit `where: { ..., orgId }`"
      pattern: "systemPrisma\\.(camera|recording|recordingSegment|notification)\\."
    - from: apps/api/src/recordings/recordings.service.ts
      to: "tenantPrisma (for getRecording)"
      via: "T-17-V4 mitigation preserved — `findFirst({ where: { id, orgId } })` stays on tenantPrisma"
      pattern: "tenantPrisma\\.recording\\.findFirst.*where.*id.*orgId"
    - from: apps/api/src/settings/settings.service.ts
      to: apps/api/src/prisma/system-prisma.service.ts
      via: "onModuleInit -> regenerateAndReloadSrs -> getSystemSettings; boot path reads via systemPrisma"
      pattern: "systemPrisma\\.systemSettings\\.(findFirst|create)"
---

<objective>
Audit and fix every TENANCY_CLIENT consumer that is reachable from a non-HTTP context (BullMQ workers, SRS callbacks, OnModuleInit lifecycle, public embed endpoint) where CLS does not contain ORG_ID. The tenancy extension only writes the RLS `set_config` when CLS has ORG_ID or IS_SUPERUSER set; without those signals, the connection runs as `app_user` and every `tenant_isolation_*` policy denies the row. This is the same regression class fixed in commits 8ea20f7 (six services) and 49adac6 (StatusService) — this plan closes the remaining 6 broken targets identified in 260420-oid-RESEARCH.md.

Purpose: Restore embed playback, SRS on_play verification, webhook deliveries, status notifications, scheduled recordings, segment archival/storage-quota alerts, and boot-time SRS config regeneration — all currently silently failing in production.

Output: 6 service files updated to inject `SystemPrismaService` (single-injection swap for the worker-only file, dual-injection for the MIXED files). Defense-in-depth `where: { ..., orgId }` added wherever orgId is in scope. T-17-V4 mitigation preserved on `getRecording`. Type check passes. Affected vitest suites pass.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260420-oid-audit-tenancy-client-misuse-fix-all-serv/260420-oid-RESEARCH.md
@apps/api/src/prisma/system-prisma.service.ts
@apps/api/src/prisma/prisma.module.ts
@apps/api/src/status/status.service.ts
@apps/api/src/resilience/boot-recovery.service.ts
@apps/api/src/playback/playback.service.ts
@apps/api/src/webhooks/webhooks.service.ts
@apps/api/src/webhooks/webhook-delivery.processor.ts
@apps/api/src/notifications/notifications.service.ts
@apps/api/src/recordings/recordings.service.ts
@apps/api/src/settings/settings.service.ts

<interfaces>
<!-- All ambient — PrismaModule is @Global, so SystemPrismaService is injectable in every module without import changes. -->

From apps/api/src/prisma/system-prisma.service.ts:
```typescript
@Injectable()
export class SystemPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // PrismaClient connected as DB superuser (rolbypassrls=true).
  // Use ONLY from contexts without CLS ORG_ID. ALWAYS pair with explicit
  // `where: { ..., orgId }` when orgId is in the call signature.
}
```

From apps/api/src/prisma/prisma.module.ts:
```typescript
@Global()
@Module({
  providers: [PrismaService, SystemPrismaService],
  exports: [PrismaService, SystemPrismaService],
})
export class PrismaModule {}
```

Established fix pattern (commit 49adac6 — StatusService):
```typescript
constructor(private readonly prisma: SystemPrismaService, /* … */) {}
async transition(cameraId: string, orgId: string, newStatus: string) {
  const camera = await this.prisma.camera.findFirst({ where: { id: cameraId, orgId } }); // explicit org scope
  // ...
  await this.prisma.camera.update({ where: { id: cameraId }, data: { /* … */ } });        // PK update OK after ownership check
}
```

Established fix pattern (commit 8ea20f7 — BootRecoveryService):
```typescript
constructor(private readonly prisma: SystemPrismaService, /* … */) {}
// Cross-org boot scan — no orgId scoping, intentional system-wide read.
const desiredRunning = await this.prisma.camera.findMany({ where: { /* status filters only */ } });
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Swap TENANCY_CLIENT to SystemPrismaService for all 6 broken-context fix targets</name>
  <files>
    apps/api/src/playback/playback.service.ts,
    apps/api/src/webhooks/webhooks.service.ts,
    apps/api/src/webhooks/webhook-delivery.processor.ts,
    apps/api/src/notifications/notifications.service.ts,
    apps/api/src/recordings/recordings.service.ts,
    apps/api/src/settings/settings.service.ts
  </files>
  <behavior>
    Existing test files exercise these flows end-to-end against a real DB (testPrisma on DATABASE_URL_MIGRATE) — they ALL must continue to pass after the swap. Behaviorally:
    - `tests/playback/playback.test.ts`: createSession + verifyToken paths still resolve sessions. After fix, verifyToken finds the session via systemPrisma instead of returning null due to RLS denial.
    - `tests/srs/on-play-verification.test.ts`: SRS on_play callback returns `{ code: 0 }` for valid token (was returning 403 because verifyToken silently returned null).
    - `tests/notifications/notifications.test.ts`: createForCameraEvent writes notifications for matching preferences / org members; HTTP CRUD methods (findForUser, markAsRead, etc.) still scoped by userId via tenantPrisma.
    - `tests/webhooks/webhooks.test.ts`: emitEvent creates WebhookDelivery rows for active subscriptions matching event type; CRUD methods (create/findAll/findById/update/delete) still scoped by orgId via tenantPrisma.
    - `tests/recordings/storage-quota.test.ts`: checkStorageQuota aggregates segment sizes correctly; checkAndAlertStorageQuota writes notification rows at 80%/90% thresholds.
    - `tests/recordings/recording-lifecycle.test.ts` + `tests/recordings/schedule.test.ts`: startRecording / stopRecording succeed when called from the schedule processor path.
    - `tests/recordings/get-recording.test.ts`: getRecording continues to enforce `findFirst({ where: { id, orgId } })` (T-17-V4 mitigation preserved on tenantPrisma).
    - `tests/recordings/archive-segment.test.ts`: archiveSegment + archiveInitSegment write segment rows and update recording totals via systemPrisma.
  </behavior>
  <action>
    Apply the per-service edits below. All edits are in a single atomic commit since they are one logical regression-class fix. Do NOT touch unrelated services or refactor anything outside the scope listed in 260420-oid-RESEARCH.md.

    **General pattern for ALL six files:**
    - When swapping a method from tenantPrisma to systemPrisma AND `orgId` is in the method signature → add explicit `orgId` to the `where:` clause as defense-in-depth (canonical example: 49adac6 StatusService.transition).
    - When the swap forces a previously-`findUnique` lookup to also include `orgId`, switch to `findFirst({ where: { id, orgId } })` (Prisma `findUnique` only accepts unique-index fields).
    - Mutations on a unique key (`update`, `delete` by `{ id }`) STAY as-is AFTER an upstream ownership check (`findFirst` with orgId) — same shape as 49adac6.
    - Keep all imports tidy: drop the `TENANCY_CLIENT` and `Inject` imports only when the file no longer needs them.

    ---

    **1. `apps/api/src/playback/playback.service.ts` (MIXED — dual injection)**

    Add `SystemPrismaService` import:
    ```typescript
    import { SystemPrismaService } from '../prisma/system-prisma.service';
    ```

    Update constructor — rename existing `prisma` to `tenantPrisma`, add `systemPrisma`:
    ```typescript
    constructor(
      @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
      private readonly systemPrisma: SystemPrismaService,
      private readonly policiesService: PoliciesService,
      private readonly statusService: StatusService,
      @Inject(forwardRef(() => ClusterService)) private readonly clusterService: ClusterService,
    ) { /* unchanged body */ }
    ```

    Methods that KEEP tenantPrisma (HTTP-only via AuthOrApiKeyGuard):
    - `createSession` — replace `this.prisma.` with `this.tenantPrisma.` (4 call sites: camera.findUnique, playbackSession.create, playbackSession.update, no other DB calls)
    - `createBatchSessions` — calls `this.createSession(...)`, no direct prisma calls; no change beyond the rename above
    - `listSessionsByCamera` — replace `this.prisma.` with `this.tenantPrisma.` (camera.findUnique + playbackSession.findMany)

    Methods that SWITCH to systemPrisma (no CLS context):
    - `getSession(sessionId)` — public embed endpoint, no auth guard. Change:
      ```typescript
      const session = await this.systemPrisma.playbackSession.findUnique({
        where: { id: sessionId },
      });
      // existing expiry check + return shape unchanged. No orgId in scope here —
      // session id is unguessable cuid; access control is via the JWT signature
      // checked separately for HLS playback (verifyToken).
      ```
    - `verifyToken(token, cameraId, orgId)` — SRS callback path. The orgId is asserted from the JWT payload before lookup, so add it to the where clause:
      ```typescript
      const session = await this.systemPrisma.playbackSession.findFirst({
        where: { id: payload.sub as string, orgId, cameraId }, // defense-in-depth
      });
      ```
    - `verifyTokenMinimal` — no DB calls; no change.

    ---

    **2. `apps/api/src/webhooks/webhooks.service.ts` (MIXED — dual injection)**

    Add import + dual-inject (constructor pattern identical to Playback). Rename existing `prisma` field to `tenantPrisma`. Replace `this.prisma.` with `this.tenantPrisma.` in: `create`, `findAll`, `findById`, `update`, `delete`, `getDeliveries` (all CRUD via AuthGuard).

    `emitEvent(orgId, eventType, payload)` switches to systemPrisma — orgId already in where clause for findMany; webhookDelivery.create has no orgId column (RLS cascades via FK), no extra scoping possible there:
    ```typescript
    async emitEvent(orgId: string, eventType: string, payload: Record<string, any>) {
      const subscriptions = await this.systemPrisma.webhookSubscription.findMany({
        where: { orgId, isActive: true, events: { has: eventType } },
      });
      for (const sub of subscriptions) {
        const delivery = await this.systemPrisma.webhookDelivery.create({
          data: { subscriptionId: sub.id, eventType, payload },
        });
        await this.webhookQueue.add('deliver', { /* unchanged */ }, { /* unchanged */ });
      }
      this.logger.log(/* unchanged */);
    }
    ```

    ---

    **3. `apps/api/src/webhooks/webhook-delivery.processor.ts` (BROKEN-only — single-injection swap)**

    Drop TENANCY_CLIENT entirely. Replace constructor:
    ```typescript
    import { Processor, WorkerHost } from '@nestjs/bullmq';
    import { Logger } from '@nestjs/common';
    import { Job } from 'bullmq';
    import { createHmac } from 'crypto';
    import { SystemPrismaService } from '../prisma/system-prisma.service';

    // ... @Processor decorator unchanged ...
    export class WebhookDeliveryProcessor extends WorkerHost {
      private readonly logger = new Logger(WebhookDeliveryProcessor.name);

      constructor(private readonly prisma: SystemPrismaService) {
        super();
      }

      async process(job: Job) {
        // body unchanged — `this.prisma.webhookDelivery.update(...)` calls now hit systemPrisma.
        // NOTE: WebhookDelivery has no orgId column; RLS cascades via subscriptionId FK.
        // No explicit orgId scoping is possible here — the `where: { id: deliveryId }` lookups
        // are by primary key, which is sufficient.
      }
    }
    ```

    Remove the `Inject` import if no longer used after the swap.

    ---

    **4. `apps/api/src/notifications/notifications.service.ts` (MIXED — dual injection + rawPrisma cleanup)**

    Add import. Update constructor — rename existing `prisma` to `tenantPrisma`, REPLACE the existing `rawPrisma: PrismaService` slot with `systemPrisma: SystemPrismaService` (the rawPrisma calls in this file are all in worker-context methods, so they have the same RLS bug — research §"Critical insight"):
    ```typescript
    import { SystemPrismaService } from '../prisma/system-prisma.service';
    // remove: import { PrismaService } from '../prisma/prisma.service';

    constructor(
      @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
      private readonly systemPrisma: SystemPrismaService,
      private readonly gateway: NotificationsGateway,
    ) {}
    ```

    Methods that SWITCH to systemPrisma (worker context — NotifyDispatchProcessor):
    - `createForCameraEvent(orgId, cameraId, status, cameraName)`:
      - `notificationPreference.findMany` → `this.systemPrisma.notificationPreference.findMany({ where: { orgId, eventType, enabled: true } })` (orgId already in where)
      - The existing fallback `this.rawPrisma.member.findMany` → `this.systemPrisma.member.findMany({ where: { organizationId: orgId }, select: { userId: true } })`
      - The per-user `this.prisma.notification.create` → `this.systemPrisma.notification.create({ data: { orgId, userId, /* … */ } })` (orgId already in `data`)
    - `createSystemAlert(orgId, title, body, data?)`:
      - `this.rawPrisma.member.findMany` → `this.systemPrisma.member.findMany(/* same */)`
      - `this.rawPrisma.notification.create` → `this.systemPrisma.notification.create(/* same */)`

    Methods that KEEP tenantPrisma (HTTP-only via AuthGuard NotificationsController, scoped by userId):
    - `findForUser`, `markAsRead`, `markAllAsRead`, `clearAll`, `getUnreadCount`, `getPreferences`, `updatePreference` — replace `this.prisma.` with `this.tenantPrisma.` (no behavioral change; tenancy extension still scopes via CLS).

    ---

    **5. `apps/api/src/recordings/recordings.service.ts` (MIXED — TRIPLE injection: tenantPrisma + systemPrisma + KEEP rawPrisma for non-tenant Organization/package reads)**

    Add import. Update constructor — rename existing `prisma` to `tenantPrisma`, ADD `systemPrisma`, KEEP `rawPrisma` (used for `Organization` lookup which has no RLS):
    ```typescript
    import { SystemPrismaService } from '../prisma/system-prisma.service';

    constructor(
      @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
      private readonly systemPrisma: SystemPrismaService,
      private readonly rawPrisma: PrismaService,
      private readonly minioService: MinioService,
    ) {}
    ```

    Methods that SWITCH to systemPrisma (worker / SRS callback / cron context):
    - `startRecording(cameraId, orgId)` — called from BOTH HTTP and ScheduleProcessor; route through systemPrisma with org scoping:
      ```typescript
      const camera = await this.systemPrisma.camera.findFirst({ where: { id: cameraId, orgId } });
      // ...existing checks unchanged...
      const recording = await this.systemPrisma.recording.create({ data: { orgId, cameraId, status: 'recording' } });
      await this.systemPrisma.camera.update({ where: { id: cameraId }, data: { isRecording: true } });
      ```
    - `stopRecording(cameraId, orgId)`:
      ```typescript
      const recording = await this.systemPrisma.recording.findFirst({
        where: { cameraId, orgId, status: 'recording' },
      });
      // ...existing 404 check...
      const updated = await this.systemPrisma.recording.update({
        where: { id: recording.id },
        data: { status: 'complete', stoppedAt: new Date() },
      });
      await this.systemPrisma.camera.update({ where: { id: cameraId }, data: { isRecording: false } });
      ```
    - `getActiveRecording(cameraId, orgId)` — currently uses `this.rawPrisma`, switch to systemPrisma (orgId already in where):
      ```typescript
      return this.systemPrisma.recording.findFirst({ where: { cameraId, orgId, status: 'recording' } });
      ```
    - `archiveSegment(recordingId, orgId, cameraId, data)` — currently uses `this.rawPrisma` for all DB ops, switch to systemPrisma. Add orgId to existingSegments count:
      ```typescript
      const existingSegments = await this.systemPrisma.recordingSegment.count({ where: { recordingId, orgId } });
      // ...
      await this.systemPrisma.recordingSegment.create({ data: { orgId, recordingId, cameraId, /* ... */ } });
      await this.systemPrisma.recording.update({
        where: { id: recordingId },
        data: { totalSize: { increment: BigInt(size) }, totalDuration: { increment: data.duration } },
      });
      ```
    - `archiveInitSegment(recordingId, orgId, cameraId, m3u8Path)` — switch the `this.rawPrisma.recording.update({ where: { id: recordingId }, data: { initSegment: initObjectPath } })` call to `this.systemPrisma.recording.update(...)` (same shape).
    - `checkStorageQuota(orgId)` — switch the segment aggregation to systemPrisma; KEEP the Organization+package read on `rawPrisma` (Organization has no RLS, called from both HTTP and worker contexts):
      ```typescript
      const org = await this.rawPrisma.organization.findUnique({
        where: { id: orgId },
        include: { package: true },
      }); // unchanged — Organization has no RLS policy
      // ...
      const result = await this.systemPrisma.recordingSegment.aggregate({
        where: { orgId },
        _sum: { size: true },
      });
      ```
    - `checkAndAlertStorageQuota(orgId)` — switch ALL `this.rawPrisma.notification.*` and `this.rawPrisma.member.*` calls to `this.systemPrisma.*` (same shape, orgId already in where/data). KEEP the `this.rawPrisma.organization.findUnique` for the package lookup.

    Methods that KEEP tenantPrisma (HTTP-context via RecordingsController under AuthGuard) — replace `this.prisma.` with `this.tenantPrisma.`:
    - `getSegment` (already filters by `{ id: segmentId, orgId }` — preserve)
    - `listSchedules`, `createSchedule`, `updateSchedule`, `deleteSchedule` (already filter by `{ orgId }`)
    - `updateRetention` (already does ownership check via `findFirst({ where: { id: cameraId, orgId } })`)
    - `findAllRecordings`, `bulkDeleteRecordings` (HTTP only)
    - `listRecordings` (already filters by `{ cameraId, orgId }`)
    - **`getRecording(id, orgId)` — CRITICAL: PRESERVE T-17-V4 mitigation as-is. Stay on tenantPrisma. The `findFirst({ where: { id, orgId } })` shape MUST NOT change. Comment near it should reference T-17-V4.**
    - `getRecordingWithSegments` (HTTP only)
    - `deleteRecording` (HTTP only) — note this currently uses `findUnique({ where: { id } })` then `delete({ where: { id } })`. Tenancy extension scopes the findUnique by orgId via RLS. KEEP tenantPrisma; do NOT alter the lookup shape (out of scope per research §"Out of Scope").

    ---

    **6. `apps/api/src/settings/settings.service.ts` (MIXED — dual injection)**

    Add import. Update constructor — rename existing `prisma` to `tenantPrisma`, add `systemPrisma`:
    ```typescript
    import { SystemPrismaService } from '../prisma/system-prisma.service';

    constructor(
      @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
      private readonly systemPrisma: SystemPrismaService,
      private readonly srsApiService: SrsApiService,
      private readonly clusterService: ClusterService,
    ) {}
    ```

    Simplest fix per research §6 alternative: the table has only one row in practice and no `orgId` column. Extract a private helper for boot-only reads, leave the public HTTP-facing methods unchanged on tenantPrisma:
    ```typescript
    async onModuleInit(): Promise<void> {
      try {
        await this.regenerateAndReloadSrsAtBoot();
        this.logger.log('SRS config regenerated from DB settings on boot');
      } catch (error) {
        this.logger.warn('Failed to regenerate SRS config on boot (using static config)', error);
      }
    }

    /** Boot-only path. SystemSettings has no orgId; bypass RLS via systemPrisma. */
    private async regenerateAndReloadSrsAtBoot(): Promise<void> {
      let settings = await this.systemPrisma.systemSettings.findFirst();
      if (!settings) {
        settings = await this.systemPrisma.systemSettings.create({ data: {} });
        this.logger.log('Created default system settings (boot)');
      }
      const config = this.generateSrsConfig({
        hlsFragment: settings.hlsFragment,
        hlsWindow: settings.hlsWindow,
        hlsEncryption: settings.hlsEncryption,
        rtmpPort: settings.rtmpPort,
        httpPort: settings.httpPort,
        apiPort: settings.apiPort,
      });
      const configPath = process.env.SRS_CONFIG_PATH || join(process.cwd(), '..', '..', 'config', 'srs.conf');
      writeFileSync(configPath, config, 'utf-8');
      this.logger.log(`srs.conf regenerated at ${configPath} (boot)`);
      // Reload + edge propagation — same as regenerateAndReloadSrs body. Wrap each in try/catch.
      try {
        await this.srsApiService.reloadConfig();
        this.logger.log('SRS origin configuration reloaded successfully (boot)');
      } catch (error) {
        this.logger.warn('Failed to reload SRS origin config on boot (SRS may not be running)', error);
      }
      try {
        const edges = await this.clusterService.getOnlineEdges();
        for (const edge of edges) {
          this.logger.log(`Edge node ${edge.name} will pick up config changes via origin (boot)`);
        }
        await this.clusterService.incrementConfigVersion();
      } catch (error) {
        this.logger.warn('Failed to propagate config to edges on boot', error);
      }
    }
    ```

    Then update HTTP methods (`getSystemSettings`, `updateSystemSettings`, `getOrgSettings`, `updateOrgSettings`, `regenerateAndReloadSrs`) to replace `this.prisma.` with `this.tenantPrisma.`. The HTTP `regenerateAndReloadSrs` still works because SettingsController is behind SuperAdminGuard which sets IS_SUPERUSER → superuser_bypass policy matches.

    Alternative if the duplication bothers the executor: keep `regenerateAndReloadSrs` as the single implementation but have it call a `loadSettings()` helper that picks `systemPrisma` when CLS is empty and `tenantPrisma` otherwise. The duplication-avoiding version is fine but DO NOT change the HTTP-path behavior — `updateSystemSettings → regenerateAndReloadSrs` MUST continue to use the same path it does today.

    ---

    **After all 6 edits:**

    Run type check:
    ```bash
    cd apps/api && pnpm tsc --noEmit
    ```

    Run targeted tests:
    ```bash
    cd apps/api && pnpm vitest run tests/playback tests/notifications tests/webhooks tests/recordings tests/srs
    ```

    If any test fails because it injected `PrismaService` as `rawPrisma` for `NotificationsService`, swap that mock to `SystemPrismaService` (per research §"Test Strategy" — only `tests/notifications/notifications.test.ts` and possibly `tests/recordings/storage-quota.test.ts` are at risk). All other tests use `testPrisma` directly against the DB and should pass without change.

    If targeted suites are green, run the full suite:
    ```bash
    cd apps/api && pnpm vitest run
    ```

    Commit pattern (single atomic commit):
    ```
    fix(api): close TENANCY_CLIENT misuse for non-HTTP contexts (260420-oid)

    Six services were silently failing because TENANCY_CLIENT skips set_config
    when CLS lacks ORG_ID, causing tenant_isolation RLS policies to deny rows.
    Swap to SystemPrismaService for the broken paths; preserve tenantPrisma for
    HTTP-context CRUD; preserve T-17-V4 mitigation on getRecording.

    Fixes (per 260420-oid-RESEARCH.md):
    - PlaybackService: getSession + verifyToken → systemPrisma
    - WebhooksService.emitEvent → systemPrisma (called from BullMQ NotifyDispatch)
    - WebhookDeliveryProcessor → systemPrisma (BullMQ worker, no CLS)
    - NotificationsService: createForCameraEvent + createSystemAlert → systemPrisma
      (also swaps rawPrisma calls — same RLS denial as TENANCY_CLIENT for app_user)
    - RecordingsService: startRecording, stopRecording, getActiveRecording,
      archiveSegment, archiveInitSegment, checkStorageQuota aggregate,
      checkAndAlertStorageQuota → systemPrisma. HTTP CRUD + getRecording stay
      on tenantPrisma (preserves T-17-V4 mitigation).
    - SettingsService.onModuleInit → systemPrisma via regenerateAndReloadSrsAtBoot
      helper. HTTP methods stay on tenantPrisma.

    Defense-in-depth: explicit `where: { ..., orgId }` added wherever orgId is
    in scope, mirroring 49adac6 (StatusService.transition) pattern.
    ```
  </action>
  <verify>
    <automated>cd apps/api && pnpm tsc --noEmit && pnpm vitest run tests/playback tests/notifications tests/webhooks tests/recordings tests/srs</automated>
  </verify>
  <done>
    - All 6 service files updated per the per-service edit blocks above
    - `pnpm tsc --noEmit` passes (no type errors introduced by the dual-injection rename)
    - Targeted vitest suites (playback, notifications, webhooks, recordings, srs) all pass
    - `getRecording` still uses tenantPrisma + `findFirst({ where: { id, orgId } })` (T-17-V4 preserved)
    - WebhookDeliveryProcessor no longer imports `TENANCY_CLIENT` or `Inject`
    - NotificationsService no longer injects `PrismaService` (replaced by `SystemPrismaService`)
    - RecordingsService still injects `PrismaService` as `rawPrisma` (only for Organization/package reads)
    - All changes committed as a single atomic commit
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: End-to-end verification of fixed contexts</name>
  <what-built>
    Six service files now route their non-HTTP-context Prisma calls through SystemPrismaService (RLS-bypass via DB superuser role), restoring:
    1. Public embed session lookup (GET /api/playback/sessions/:id)
    2. SRS on_play token verification (camera previews + embed page playback)
    3. Webhook delivery records being updated after HTTP POST (no longer stuck Pending)
    4. Camera-status webhook deliveries being created (NotifyDispatchProcessor → WebhooksService.emitEvent)
    5. Camera-status notifications being created (NotifyDispatchProcessor → NotificationsService.createForCameraEvent)
    6. Scheduled recordings starting/stopping (ScheduleProcessor cron → RecordingsService.startRecording/stopRecording)
    7. Segment archival on SRS on_hls callback (RecordingsService.archiveSegment)
    8. Storage-quota alerts firing at 80%/90% (RecordingsService.checkAndAlertStorageQuota)
    9. SRS config regeneration on API boot (SettingsService.onModuleInit)
  </what-built>
  <how-to-verify>
    Run the API in dev mode (`pnpm dev` from repo root or however the project boots api+web together) and verify the following manually:

    **1. SRS boot regeneration (Settings)** — Tail API logs at startup:
    - SHOULD see: `srs.conf regenerated at /…/srs.conf (boot)` and `SRS origin configuration reloaded successfully (boot)`
    - SHOULD NOT see: `Failed to regenerate SRS config on boot (using static config)`
    - If SRS isn't running locally, the "Failed to reload SRS origin config on boot (SRS may not be running)" warning is expected and acceptable — the regenerate step itself must succeed.

    **2. Embed session lookup (Playback.getSession)** — Pick an existing playback session id from the DB (or create one via the cameras UI). Then:
    ```bash
    curl -i http://localhost:3003/api/playback/sessions/<session-id>
    ```
    SHOULD return `200 OK` with JSON `{ id, hlsUrl, expiresAt, cameraId }`. SHOULD NOT return 404 (which was the symptom before fix).

    **3. SRS on_play (Playback.verifyToken)** — In the web UI at `/app/cameras`:
    - Open a camera preview (clicks the camera card or play button)
    - Verify the live stream actually plays (not stuck on a spinner / "Failed to load")
    - Tail SRS logs: `docker compose logs srs --tail=50 -f` while clicking play
    - SHOULD NOT see `on_play.*403` or `verifyToken: session ... not found in DB` warnings in the API log
    - Open `http://localhost:3000/embed/<session-id>` in a fresh tab — live stream SHOULD play

    **4. Status callbacks still work (Camera.lastOnlineAt)** — Watch a camera that's actively streaming:
    - Note its current `lastOnlineAt` timestamp in the DB or UI
    - Wait ~30s
    - Verify `lastOnlineAt` advances (this exercises the StatusService → SRS callback path which was already fixed in 49adac6 but we want to confirm no regression)

    **5. Webhook deliveries (Webhooks.emitEvent + WebhookDeliveryProcessor)** — Optional but high-value:
    - Create a webhook subscription in the UI pointing at `https://webhook.site/<your-id>` for event `camera.offline`
    - Stop a camera (or simulate an offline transition)
    - Wait ~30s for the debounced dispatch
    - Check `WebhookDelivery` table — there SHOULD be a new row with `responseStatus: 200` (or whatever webhook.site returns) and a populated `responseBody`. Previously this row would either not exist (emitEvent denied) or stay Pending forever (processor.update denied).
    - Cross-check at webhook.site that the POST actually arrived.

    **6. Notification creation (Notifications.createForCameraEvent)** — Same camera offline trigger as #5:
    - Open the notifications dropdown in the UI
    - SHOULD see a new "Camera <name> is offline" notification

    **7. Recording schedule (Recordings.startRecording via ScheduleProcessor)** — Optional, requires existing schedule:
    - If a recording schedule exists with a cron that fires soon, wait for it to fire
    - Verify a new `Recording` row is created and `Camera.isRecording=true`

    **8. Storage quota alerts** — Hard to trigger manually unless you stage data; the unit tests cover this. Skip if no easy data.

    Reply with one of:
    - "approved" — all checks passed (or only optional ones skipped)
    - "issues: <description>" — describe what's still broken
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| BullMQ worker → DB | Background jobs (NotifyDispatchProcessor, WebhookDeliveryProcessor, ScheduleProcessor) execute outside any HTTP request — no CLS context, no AuthGuard-set ORG_ID |
| SRS callback → API → DB | SRS posts unauthenticated callbacks (on_play, on_hls, on_publish, on_unpublish, on_stop, on_dvr) to internal API endpoints — no client auth, no CLS |
| OnModuleInit lifecycle → DB | App bootstrap (SettingsService.onModuleInit) runs before any request — no CLS |
| Public embed page → API → DB | `/embed/<session-id>` is intentionally unauthenticated (developers embed it on third-party sites) — `getSession` endpoint has no @UseGuards |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-RLS-AUDIT-01 | Information Disclosure (silent failure mode that hides functionality, NOT cross-tenant leakage) | All 6 fix targets in this plan | mitigate | Swap to SystemPrismaService (RLS-bypass via DB superuser, established pattern from 8ea20f7 + 49adac6). Defense-in-depth: explicit `where: { ..., orgId }` wherever orgId is in scope, mirroring 49adac6 StatusService.transition pattern. |
| T-RLS-AUDIT-02 | Tampering (cross-tenant write/read via SystemPrismaService misuse) | RecordingsService.startRecording, stopRecording, getActiveRecording, archiveSegment, checkStorageQuota; PlaybackService.verifyToken; WebhooksService.emitEvent; NotificationsService.createForCameraEvent + createSystemAlert | mitigate | All swapped methods that have orgId in their signature are required to add `orgId` to the `where:` clause and `data:` clause. Code review must catch any systemPrisma call missing org scoping. The `findFirst({ where: { id, orgId } })` pattern from 49adac6 is the canonical shape. |
| T-RLS-AUDIT-03 | Information Disclosure (cross-tenant via PlaybackService.getSession) | PlaybackService.getSession (public embed endpoint) | accept | Session id is unguessable cuid (cryptographic identifier, not enumerable); the embed page only needs the hlsUrl which itself contains a JWT-signed token. The token's signature is the actual access control gate (verifyToken on SRS callback enforces orgId+cameraId from the JWT payload). No org scoping is possible at getSession because the caller is a third-party embed with no org context. Pre-existing trust model. |
| T-RLS-AUDIT-04 | Information Disclosure (WebhookDeliveryProcessor RLS bypass) | WebhookDeliveryProcessor | accept | WebhookDelivery has no orgId column; RLS on it cascades through subscriptionId FK. Lookups are by primary key (deliveryId, supplied by the BullMQ job that was created by an org-scoped emitEvent call earlier). No org-scoping is possible or needed at this layer. Documented in code comment. |
| T-RLS-AUDIT-05 | Denial of Service (regression — accidentally swap an HTTP-context method to systemPrisma without scoping) | All 6 files | mitigate | Per-method explicit guidance in Task 1 action lists EXACTLY which methods stay on tenantPrisma vs switch to systemPrisma. Reviewer must check the table against research §"Verified Break List". `getRecording` is the highest-risk of accidental migration — explicitly preserved on tenantPrisma to keep T-17-V4. |
| T-RLS-AUDIT-06 | Tampering (regression on T-17-V4 — IDOR on getRecording) | RecordingsService.getRecording | mitigate | Task 1 action explicitly mandates: "PRESERVE T-17-V4 mitigation as-is. Stay on tenantPrisma. The `findFirst({ where: { id, orgId } })` shape MUST NOT change." Verification step in Task 2 includes manual check that getRecording still works for owner and 404s for non-owner (covered by tests/recordings/get-recording.test.ts which must remain green). |
</threat_model>

<verification>
- `pnpm tsc --noEmit` from `apps/api/` passes
- `pnpm vitest run tests/playback tests/notifications tests/webhooks tests/recordings tests/srs` from `apps/api/` passes
- (If targeted runs green) `pnpm vitest run` from `apps/api/` passes
- Manual verification matrix from Task 2 has at least items #1, #2, #3, #4, #5, #6 confirmed
- No `TENANCY_CLIENT` import remains in `apps/api/src/webhooks/webhook-delivery.processor.ts`
- No `PrismaService` import as `rawPrisma` remains in `apps/api/src/notifications/notifications.service.ts`
- `getRecording` in `apps/api/src/recordings/recordings.service.ts` still uses `tenantPrisma.recording.findFirst({ where: { id, orgId } })`
</verification>

<success_criteria>
1. Six service files swapped per the per-service action blocks (atomic commit)
2. Type check + targeted test suites green
3. Embed session lookup returns JSON instead of 404 (manual)
4. SRS on_play returns code:0 — live stream plays in cameras UI and embed page (manual)
5. WebhookDelivery rows are populated with responseStatus after a real webhook send (manual or test-covered)
6. Camera offline → notification appears in UI dropdown (manual or test-covered)
7. API boot logs no longer show "Failed to regenerate SRS config on boot" (manual)
8. T-17-V4 mitigation on getRecording preserved (verified by tests/recordings/get-recording.test.ts staying green)
</success_criteria>

<output>
After completion, create `.planning/quick/260420-oid-audit-tenancy-client-misuse-fix-all-serv/260420-oid-SUMMARY.md` summarizing:
- Files modified (6) with one-line description of each change
- Verification results (tsc, vitest, manual checks)
- Commit SHA
- Updates `.planning/STATE.md` Quick Tasks Completed table with row `260420-oid | Audit TENANCY_CLIENT misuse — fix all 6 broken services (Playback, Webhooks, WebhookDeliveryProcessor, Notifications, Recordings, Settings) | 2026-04-20 | <commit> | [260420-oid-audit-tenancy-client-misuse-fix-all-serv](./quick/260420-oid-audit-tenancy-client-misuse-fix-all-serv/)`
</output>
