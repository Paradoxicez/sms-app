# Quick Task 260420-oid — TENANCY_CLIENT Misuse Audit

**Researched:** 2026-04-20
**Domain:** RLS / multi-tenant Prisma access — find every service that injects `TENANCY_CLIENT` and gets called from a context where CLS `ORG_ID` is NOT set.
**Confidence:** HIGH (full grep + every controller/processor read end-to-end)

## Summary

The tenancy contract requires that any code path running `this.prisma.*` through `TENANCY_CLIENT` MUST be inside a request that already populated CLS with `ORG_ID` (`AuthGuard` / `AuthOrApiKeyGuard` / `OrgAdminGuard` / `ApiKeyGuard`) or `IS_SUPERUSER` (`SuperAdminGuard` / `OrgAdminGuard` admin path). Without one of those positive signals the tenancy extension skips `set_config(...)` entirely, the connection role is `app_user` (not bypass), and every `tenant_isolation_*` policy evaluates to `'' = "orgId"::text` → false → no rows / RLS denial.

**Audit scope:** 18 services / processors inject `TENANCY_CLIENT` (full grep below). Of those, **5 services have BROKEN call paths** that reach the tenancy client without CLS, and **2 of those are MIXED** (also reachable from properly-guarded HTTP). All other services are reached only from controllers with the right guards.

**Primary recommendation:** For each BROKEN-only service, replace `TENANCY_CLIENT` injection with `SystemPrismaService` and add explicit `where: { ..., orgId }` defense-in-depth. For MIXED services (Playback, Recordings) inject BOTH and route per-method (`this.tenantPrisma` vs `this.systemPrisma`) — this matches the existing precedent in commit 49adac6 and avoids a service split. **Also fix one `OnModuleInit` boot path in SettingsService** that calls TENANCY_CLIENT outside any request.

## User Constraints (from task spec)

### Locked Decisions
- Use `SystemPrismaService` (RLS-bypass via DB superuser role) for any caller without CLS — established pattern from commits 8ea20f7 + 49adac6.
- Keep tenancy extension itself unchanged (out of scope).
- Add explicit `where: { orgId }` defense-in-depth wherever the orgId is already known in the call signature (mirrors the StatusService.transition pattern in 49adac6).

### Claude's Discretion
- Whether MIXED services use the dual-injection approach (recommended) or a service split (more disruptive). Recommendation: dual injection.
- Naming convention for the dual fields: recommend `tenantPrisma` (the existing TENANCY_CLIENT) and `systemPrisma` (the new SystemPrismaService).

### Deferred Ideas (OUT OF SCOPE)
- Don't redesign `prisma-tenancy.extension.ts` or RLS policies.
- Don't refactor unrelated bugs you find while reading the files.
- Don't add or change RLS policies on `Notification`, `WebhookSubscription`, `WebhookDelivery`, `RecordingSchedule`, etc.
- Don't switch `PrismaService` (`app_user` role) to bypass — that role exists specifically for HTTP request paths.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OID-01 | Fix every TENANCY_CLIENT consumer reached without CLS ORG_ID | Inventory + classification table below identifies the 5 BROKEN services and the exact methods + entry points |
| OID-02 | Apply defense-in-depth orgId scoping where SystemPrismaService is introduced | "Fix Pattern" section below specifies the per-call scoping rules |
| OID-03 | Update tests so they mock `SystemPrismaService` instead of `TENANCY_CLIENT` where the swap occurs | "Test Strategy" section names the 4 affected files |

## Inventory — All TENANCY_CLIENT Consumers

`grep -rln "TENANCY_CLIENT" apps/api/src` → 20 hits. Two are infrastructure (`prisma-tenancy.extension.ts` defines the symbol, `tenancy.module.ts` provides it). The remaining 18 are consumers.

| # | File | Methods Calling `this.prisma.*` (TENANCY_CLIENT) |
|---|------|--------------------------------------------------|
| 1 | `apps/api/src/notifications/notifications.service.ts` | `createForCameraEvent` (preferences findMany + notification create), `findForUser`, `markAsRead`, `markAllAsRead`, `clearAll`, `getUnreadCount`, `getPreferences`, `updatePreference` |
| 2 | `apps/api/src/users/users.service.ts` | `inviteUser`, `createUser` (member.create), `listMembers`, `updateRole`, `getCallerMembership`, `removeMember` |
| 3 | `apps/api/src/cameras/cameras.service.ts` | All Project / Site / Camera CRUD + `enterMaintenance` / `exitMaintenance` / `bulkImport` |
| 4 | `apps/api/src/streams/streams.service.ts` | `startStream` (camera.findUnique), `stopStream` (camera.findUnique) |
| 5 | `apps/api/src/streams/stream-profile.service.ts` | `create`, `findAll`, `findById`, `update`, `delete` |
| 6 | `apps/api/src/playback/playback.service.ts` | `createSession`, `createBatchSessions`, **`verifyToken`** (playbackSession.findUnique), **`getSession`** (playbackSession.findUnique), `listSessionsByCamera` |
| 7 | `apps/api/src/api-keys/api-keys.service.ts` | `create`, `findAll`, `delete` (others use raw `this.prisma` with explicit `set_config` bypass — those are SAFE) |
| 8 | `apps/api/src/recordings/manifest.service.ts` | `generateManifest`, `getSegmentsForDate`, `getDaysWithRecordings` |
| 9 | `apps/api/src/webhooks/webhooks.service.ts` | `create`, `findAll`, `findById`, `update`, `delete`, `getDeliveries`, **`emitEvent`** (webhookSubscription.findMany + webhookDelivery.create) |
| 10 | `apps/api/src/recordings/recordings.service.ts` | **`startRecording`**, **`stopRecording`**, `getSegment`, `listSchedules`, `createSchedule`, `updateSchedule`, `deleteSchedule`, `updateRetention`, `findAllRecordings`, `bulkDeleteRecordings`, `listRecordings`, `getRecording`, `getRecordingWithSegments`, `deleteRecording` (also uses `rawPrisma`/PrismaService for some — see notes) |
| 11 | `apps/api/src/webhooks/webhook-delivery.processor.ts` | **`process`** (webhookDelivery.update on success and failure paths) |
| 12 | `apps/api/src/admin/admin-audit-log.service.ts` | `findAll` (auditLog/user/organization findMany — SuperAdminGuard sets IS_SUPERUSER) |
| 13 | `apps/api/src/account/plan-usage/plan-usage.service.ts` | `getPlanUsage`, `aggregateApiUsage` |
| 14 | `apps/api/src/account/plan-usage/plan-usage.controller.ts` | Inline `member.findFirst` membership check before delegating |
| 15 | `apps/api/src/policies/policies.service.ts` | `seedSystemDefault` (uses `cls.run` + sets IS_SUPERUSER explicitly), `create`, `findAll`, `findOne`, `update`, `remove`, `resolve` |
| 16 | `apps/api/src/audit/audit.service.ts` | `log` (auditLog.create), `findAll` |
| 17 | `apps/api/src/dashboard/dashboard.service.ts` | `getStats`, `getUsageTimeSeries`, `getCameraStatusList` |
| 18 | `apps/api/src/settings/settings.service.ts` | **`getSystemSettings`**, `updateSystemSettings`, `getOrgSettings`, `updateOrgSettings`, **`regenerateAndReloadSrs`** (called from `onModuleInit`!) |

## Caller Classification

Legend: ✅ SAFE = always reached with CLS ORG_ID or IS_SUPERUSER set | ❌ BROKEN = reached without either | ⚠️ MIXED = both contexts share the same method.

| # | Service | Entry Points | Status |
|---|---------|--------------|--------|
| 1 | NotificationsService | `NotificationsController` (AuthGuard ✅) **+ `NotifyDispatchProcessor.process` (BullMQ ❌ — calls `createForCameraEvent`)** | ⚠️ MIXED |
| 2 | UsersService | `UsersController` (OrgAdminGuard ✅ — sets ORG_ID for org admin or IS_SUPERUSER+ORG_ID for super admin) | ✅ SAFE |
| 3 | CamerasService | `CamerasController` (AuthGuard ✅) | ✅ SAFE |
| 4 | StreamsService | `StreamsController` (AuthGuard ✅) + called from `CamerasService.enterMaintenance` (still HTTP via CamerasController ✅) | ✅ SAFE |
| 5 | StreamProfileService | `StreamProfileController` (AuthGuard ✅) | ✅ SAFE |
| 6 | **PlaybackService** | `PlaybackController.createSession` / `createBatchSessions` / `listSessionsByCamera` (AuthOrApiKeyGuard ✅), `PlaybackController.serveHlsKey` / `proxyM3u8` (no auth, but only call `verifyTokenMinimal` — no Prisma ✅), **`PlaybackController.getSession` (no AuthGuard ❌)**, **`SrsCallbackController.onPlay` → `verifyToken` (no auth ❌)** | ⚠️ MIXED |
| 7 | ApiKeysService | `ApiKeysController` (AuthGuard ✅) for tenant methods. `findByHash` / `updateLastUsed` use raw `prisma.$transaction` with explicit `set_config('app.is_superuser','true')` — pattern already correct ✅. `aggregateDaily` runs in BullMQ but writes only to `ApiKeyUsage` which has NO RLS policy — operationally safe ✅ | ✅ SAFE |
| 8 | ManifestService | `RecordingsController.getTimeline` / `getCalendar` / `getManifest` (AuthGuard ✅) | ✅ SAFE |
| 9 | **WebhooksService** | `WebhooksController` (AuthGuard ✅) **+ `WebhooksService.emitEvent` called from `NotifyDispatchProcessor` (BullMQ ❌)** | ⚠️ MIXED |
| 10 | **RecordingsService** | `RecordingsController` (AuthGuard ✅) for HTTP CRUD + **`SrsCallbackController.onHls` → `getActiveRecording` / `checkStorageQuota` / `archiveSegment` (no auth ❌)** + **`ScheduleProcessor.process` → `startRecording` / `stopRecording` (BullMQ cron ❌)** | ⚠️ MIXED |
| 11 | **WebhookDeliveryProcessor** | `@Processor('webhook-delivery')` (BullMQ worker ❌ — no HTTP request, no CLS) | ❌ BROKEN |
| 12 | AdminAuditLogService | `AdminAuditLogController` (SuperAdminGuard ✅ — sets IS_SUPERUSER, superuser_bypass_auditlog matches) | ✅ SAFE |
| 13 | PlanUsageService | `PlanUsageController` (AuthGuard ✅; controller does `member.findFirst` check before delegating) | ✅ SAFE |
| 14 | PlanUsageController | Same controller — also has AuthGuard ✅ | ✅ SAFE |
| 15 | PoliciesService | `PoliciesController` (AuthGuard ✅) + called from `PlaybackService.createSession` (always behind AuthOrApiKeyGuard ✅). `seedSystemDefault` opens its own `cls.run` and sets IS_SUPERUSER ✅ | ✅ SAFE |
| 16 | AuditService | `AuditInterceptor` (only fires when `cls.get('ORG_ID')` is truthy — early-returns otherwise; SKIP_PATHS includes `/api/srs/callbacks`) ✅ | ✅ SAFE |
| 17 | DashboardService | `DashboardController` (AuthGuard ✅) | ✅ SAFE |
| 18 | **SettingsService** | `SettingsController` (AuthGuard or SuperAdminGuard ✅) **+ `SettingsService.onModuleInit` → `regenerateAndReloadSrs` → `getSystemSettings` (boot lifecycle ❌ — no CLS)** | ⚠️ MIXED |

## Verified Break List — Methods That MUST Be Fixed

> Each row gives the entry point that lacks CLS, the broken Prisma call, and the surface the planner will edit.

| Service | Method | Entry Point Without CLS | Why Broken |
|---------|--------|--------------------------|------------|
| **PlaybackService** | `getSession(sessionId)` | `GET /api/playback/sessions/:id` — `PlaybackController.getSession` declared with NO `@UseGuards()` (the comment block says "public endpoint for embed page") | `playbackSession.findUnique` runs through TENANCY_CLIENT but no orgId in CLS → tenancy extension skips set_config → `tenant_isolation_playbacksession` evaluates `"orgId" = ''` → returns null → embed page shows "Session not found or expired" |
| **PlaybackService** | `verifyToken(token, cameraId, orgId)` | `POST /api/srs/callbacks/on-play` — `SrsCallbackController.onPlay` (no client auth; SRS posts directly) | `playbackSession.findUnique({where:{id:payload.sub}})` returns null → on_play returns 403 → SRS rejects every viewer. The orgId IS in the JWT payload but never written to CLS |
| **WebhooksService** | `emitEvent(orgId, eventType, payload)` | `NotifyDispatchProcessor.process` (BullMQ, queue `camera-notify`) — fires after a 30s debounce from `StatusService.transition` | `webhookSubscription.findMany` + `webhookDelivery.create` both run via TENANCY_CLIENT → no rows / INSERT denied → no webhooks ever delivered for camera status changes |
| **NotificationsService** | `createForCameraEvent(orgId, cameraId, status, cameraName)` | Same `NotifyDispatchProcessor.process` | `notificationPreference.findMany` + `notification.create` via TENANCY_CLIENT → silent zero notifications. NB: `createSystemAlert` and the storage-quota alerts in `RecordingsService.checkAndAlertStorageQuota` use `this.rawPrisma` (PrismaService) which is the `app_user` role — same RLS denial because no set_config fired |
| **RecordingsService** | `getActiveRecording(cameraId, orgId)` | `SrsCallbackController.onHls` (no auth — SRS callback) | Method already uses `this.rawPrisma` (PrismaService / `app_user`). No CLS, no set_config, RLS blocks. **Same issue, different injection.** Fix is to switch this and the other on_hls-reachable methods to SystemPrismaService too |
| **RecordingsService** | `checkStorageQuota(orgId)` | Same on_hls path + `archiveSegment` calls it | Uses `rawPrisma` — same RLS denial |
| **RecordingsService** | `archiveSegment(...)` | Same on_hls path | All writes via `rawPrisma` (`recordingSegment.create`, `recording.update`) → blocked. `checkAndAlertStorageQuota` triggered as fire-and-forget from here also fails (rawPrisma notification.create) |
| **RecordingsService** | `startRecording(cameraId, orgId)` | `ScheduleProcessor.process` (BullMQ cron — schedule.processor.ts line 58) | `camera.findUnique` + `recording.create` + `camera.update` via TENANCY_CLIENT → schedule starts silently fail |
| **RecordingsService** | `stopRecording(cameraId, orgId)` | Same ScheduleProcessor (line 61) | Same — schedule stop silently fails |
| **WebhookDeliveryProcessor** | `process(job)` | `@Processor('webhook-delivery')` (BullMQ worker) | `webhookDelivery.update` (success path) and the same in catch block both via TENANCY_CLIENT → delivery records never updated even if HTTP POST succeeds; from operator's perspective every webhook stays "Pending" forever |
| **SettingsService** | `getSystemSettings()` (called from `regenerateAndReloadSrs` from `onApplicationBootstrap`) | `SettingsService.onModuleInit` lifecycle — runs once at API boot, no request | `systemSettings.findFirst` + (first-run) `systemSettings.create` via TENANCY_CLIENT → returns null / write denied → SRS config regen at boot silently no-ops with `'Failed to regenerate SRS config on boot (using static config)'` warning. Boot continues, but the warning hides the real RLS denial root cause |

**Total BROKEN services to fix: 5** (Playback, Webhooks, Notifications, Recordings, WebhookDeliveryProcessor) **plus the SettingsService boot path = 6 fix targets.**

> The 6 services already migrated in commit `8ea20f7` (RetentionProcessor, ScheduleProcessor, BootRecoveryService, CameraHealthService, SrsRestartDetector, NotifyDispatchProcessor) and the 1 in `49adac6` (StatusService) are the established correct pattern. This audit's fixes follow the same shape.

## Fix Pattern

### Rule of thumb
- **Service reached only from contexts WITHOUT CLS** → swap injection: drop `TENANCY_CLIENT`, inject `SystemPrismaService` only. (WebhookDeliveryProcessor is the clean case here.)
- **Service reached from BOTH contexts (MIXED)** → inject BOTH. Name them `tenantPrisma` (the existing extension client) and `systemPrisma` (the bypass client). Per-method, choose the one that matches the entry point. Add explicit `orgId` in `where:` when using systemPrisma. (Playback, Notifications, Webhooks, Recordings, Settings.)

### Concrete recipes

**1. PlaybackService (MIXED)** — `getSession` and `verifyToken` are reached without CLS. `createSession`, `createBatchSessions`, `listSessionsByCamera` are reached only via AuthOrApiKeyGuard.

```ts
constructor(
  @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
  private readonly systemPrisma: SystemPrismaService,
  // ...other deps
) {}

// Public embed lookup — no CLS context, use systemPrisma. Session id is unguessable (cuid),
// no need to scope by org here; the JWT signature in verifyToken does that work elsewhere.
async getSession(sessionId: string) {
  const session = await this.systemPrisma.playbackSession.findUnique({
    where: { id: sessionId },
  });
  // existing expiry check ...
}

// SRS callback — orgId is in the JWT payload (already verified before lookup)
async verifyToken(token: string, cameraId: string, orgId: string) {
  const payload = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;
  if (payload.cam !== cameraId || payload.org !== orgId) return null;
  const session = await this.systemPrisma.playbackSession.findFirst({
    where: { id: payload.sub as string, orgId, cameraId }, // defense-in-depth
  });
  // ... existing return shape
}

// HTTP-only methods keep tenantPrisma — no change needed.
// createSession uses tenantPrisma (existing AuthOrApiKeyGuard sets ORG_ID).
// listSessionsByCamera uses tenantPrisma.
```

**2. WebhooksService (MIXED)** — only `emitEvent` is reached from a worker. CRUD methods stay on tenantPrisma.

```ts
constructor(
  @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
  private readonly systemPrisma: SystemPrismaService,
  @InjectQueue('webhook-delivery') private readonly webhookQueue: Queue,
) {}

async emitEvent(orgId: string, eventType: string, payload: Record<string, any>) {
  const subscriptions = await this.systemPrisma.webhookSubscription.findMany({
    where: { orgId, isActive: true, events: { has: eventType } }, // orgId already in where clause
  });
  for (const sub of subscriptions) {
    const delivery = await this.systemPrisma.webhookDelivery.create({
      data: { subscriptionId: sub.id, eventType, payload },
    });
    await this.webhookQueue.add(/* unchanged */);
  }
}
// All other methods continue using this.tenantPrisma.*
```

**3. WebhookDeliveryProcessor (BROKEN-only)** — straight swap.

```ts
constructor(private readonly prisma: SystemPrismaService) { super(); }
// All this.prisma.webhookDelivery.update calls already key by id (the delivery row's PK),
// no orgId is in scope here. WebhookDelivery has no orgId column — RLS on it is via the
// subscription FK chain — so explicit scoping is N/A. Document this in code comment.
```

**4. NotificationsService (MIXED)** — `createForCameraEvent` is the only worker-reachable method; HTTP methods stay on tenantPrisma. Already injects PrismaService as `rawPrisma` for some flows — those `rawPrisma.notification.create` / `.member.findMany` calls also need to be swapped to `systemPrisma` because `app_user` is RLS-subject too. (`createSystemAlert` is the same problem.)

```ts
constructor(
  @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
  private readonly systemPrisma: SystemPrismaService,           // was: PrismaService rawPrisma
  private readonly gateway: NotificationsGateway,
) {}

async createForCameraEvent(orgId, cameraId, status, cameraName) {
  const preferences = await this.systemPrisma.notificationPreference.findMany({
    where: { orgId, eventType: `camera.${status}`, enabled: true },
  });
  // ... fall back to systemPrisma.member.findMany when no preferences
  for (const userId of userIds) {
    const notification = await this.systemPrisma.notification.create({
      data: { orgId, userId, /* ... */ },
    });
    this.gateway.sendToUser(userId, notification);
  }
}

async createSystemAlert(orgId, title, body, data?) {
  const members = await this.systemPrisma.member.findMany({
    where: { organizationId: orgId, role: { in: ['owner', 'admin'] } },
  });
  // ... systemPrisma.notification.create per member
}

// HTTP methods (findForUser, markAsRead, etc.) keep this.tenantPrisma.*
```

**5. RecordingsService (MIXED, biggest surface)** — three call surfaces:
   - HTTP CRUD via RecordingsController (AuthGuard) — keep tenantPrisma
   - SRS on-hls callback (`getActiveRecording`, `checkStorageQuota`, `archiveSegment`, the storage-quota alerts triggered from archive) — needs systemPrisma
   - ScheduleProcessor cron (`startRecording`, `stopRecording`) — needs systemPrisma

   Inject both. The methods already accept `orgId` as an argument so add explicit `where: { ..., orgId }`.

```ts
constructor(
  @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
  private readonly systemPrisma: SystemPrismaService,        // new
  private readonly rawPrisma: PrismaService,                  // KEEP — used for non-tenant tables (Organization, package)
  private readonly minioService: MinioService,
) {}

// Worker / callback path — switch to systemPrisma + scope by orgId
async getActiveRecording(cameraId: string, orgId: string) {
  return this.systemPrisma.recording.findFirst({
    where: { cameraId, orgId, status: 'recording' },
  });
}

async checkStorageQuota(orgId: string) {
  // org/package lookup stays on rawPrisma (Organization has no RLS, also called from HTTP)
  const org = await this.rawPrisma.organization.findUnique({ where: { id: orgId }, include: { package: true } });
  if (!org?.package) return { allowed: true, usageBytes: 0n, limitBytes: 0n, usagePercent: 0 };
  const result = await this.systemPrisma.recordingSegment.aggregate({
    where: { orgId },
    _sum: { size: true },
  });
  // ...
}

async archiveSegment(recordingId, orgId, cameraId, data) {
  // ...validation
  const existingSegments = await this.systemPrisma.recordingSegment.count({ where: { recordingId, orgId } });
  if (existingSegments === 0 && data.m3u8Path) {
    await this.archiveInitSegment(recordingId, orgId, cameraId, data.m3u8Path); // also use systemPrisma inside
  }
  // ...minio upload
  await this.systemPrisma.recordingSegment.create({ data: { orgId, recordingId, cameraId, /* ... */ } });
  await this.systemPrisma.recording.update({
    where: { id: recordingId },
    data: { totalSize: { increment: BigInt(size) }, totalDuration: { increment: data.duration } },
  });
  // checkAndAlertStorageQuota — also needs systemPrisma for its rawPrisma.notification.create
}

async startRecording(cameraId: string, orgId: string) {
  // Called from BOTH HTTP and ScheduleProcessor. Scope-defensive systemPrisma path.
  const camera = await this.systemPrisma.camera.findFirst({ where: { id: cameraId, orgId } });
  // ...quota check unchanged (already via systemPrisma after fix)
  const recording = await this.systemPrisma.recording.create({ data: { orgId, cameraId, status: 'recording' } });
  await this.systemPrisma.camera.update({ where: { id: cameraId }, data: { isRecording: true } });
  await this.minioService.ensureBucket(orgId);
  return recording;
}

async stopRecording(cameraId: string, orgId: string) {
  const recording = await this.systemPrisma.recording.findFirst({ where: { cameraId, orgId, status: 'recording' } });
  // ...rest using systemPrisma
}

// HTTP-only methods (findAllRecordings, listRecordings, getRecording, deleteRecording, listSchedules,
//   createSchedule, updateSchedule, deleteSchedule, updateRetention, getSegment, bulkDeleteRecordings,
//   getRecordingWithSegments) keep this.tenantPrisma — they already enforce orgId via where: { ..., orgId }.
```

   Note: `checkAndAlertStorageQuota` uses `rawPrisma.notification.create` — same RLS denial. Switch those to `systemPrisma` too (orgId is in scope).

**6. SettingsService (MIXED)** — `onModuleInit` boot path needs systemPrisma; HTTP-reached methods stay on tenantPrisma.

   Cleanest fix: extract the bootstrap-only read into a separate helper that uses systemPrisma; keep `getSystemSettings` HTTP-facing method on tenantPrisma (it's reached via AuthGuard / SuperAdminGuard).

```ts
constructor(
  @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
  private readonly systemPrisma: SystemPrismaService,
  private readonly srsApiService: SrsApiService,
  private readonly clusterService: ClusterService,
) {}

async onModuleInit() {
  try {
    await this.regenerateAndReloadSrsAtBoot();
  } catch (err) {
    this.logger.warn('Failed to regenerate SRS config on boot', err);
  }
}

// Boot-only path — uses systemPrisma. SystemSettings has no orgId column, so no scoping arg.
private async regenerateAndReloadSrsAtBoot(): Promise<void> {
  let settings = await this.systemPrisma.systemSettings.findFirst();
  if (!settings) settings = await this.systemPrisma.systemSettings.create({ data: {} });
  const config = this.generateSrsConfig({ /* ... */ });
  // writeFileSync + reloadConfig + edge propagation (unchanged) ...
}

// HTTP path — unchanged, uses tenantPrisma + IS_SUPERUSER from SuperAdminGuard
async getSystemSettings() { /* this.tenantPrisma.systemSettings.findFirst */ }
async updateSystemSettings(dto) { /* this.tenantPrisma + call regenerateAndReloadSrs() if you want
   the HTTP path to also bypass — or refactor regenerateAndReloadSrs to delegate to the boot helper */ }
```

   Simpler alternative: just swap `regenerateAndReloadSrs` to use `systemPrisma` for the read. SystemSettings has no `orgId` so no scoping concerns; the table has only one row in practice.

## Test Strategy

The repo's test pattern uses `testPrisma` (a real PrismaClient on `DATABASE_URL_MIGRATE`) directly in integration tests rather than mocking the service's Prisma injection. So the swap surface is small.

| Test file | What changes |
|-----------|--------------|
| `apps/api/tests/playback/playback.test.ts` | Tests already use `testPrisma` directly (no PlaybackService instance). After the swap they continue to work because both clients hit the same DB. Verify `verifyToken` and `getSession` test cases still pass once the service is wired. |
| `apps/api/tests/srs/on-play-verification.test.ts` | Integration test — driven through the controller. Confirm the SRS-callback path returns 200 + `{ code: 0 }` end-to-end after fix. |
| `apps/api/tests/notifications/notifications.test.ts` | Likely instantiates `NotificationsService` with mocks. If it mocks `TENANCY_CLIENT` for `createForCameraEvent`, swap mock to `SystemPrismaService`. Otherwise no change. |
| `apps/api/tests/webhooks/webhooks.test.ts` | Same — if it mocks `TENANCY_CLIENT` for `emitEvent`, swap to `SystemPrismaService` mock. |
| `apps/api/tests/recordings/storage-quota.test.ts` | Same review for `checkStorageQuota` / `checkAndAlertStorageQuota`. |
| `apps/api/tests/recordings/manifest.test.ts` | ManifestService is SAFE — no change. |

**Smoke commands the executor should run after the swap:**

```bash
# Type check (fast, no DB needed)
cd apps/api && pnpm tsc --noEmit

# Run the directly affected suites
cd apps/api && pnpm vitest run tests/playback tests/notifications tests/webhooks tests/recordings tests/srs

# Full test suite if the targeted runs are green
cd apps/api && pnpm vitest run
```

**Manual verification for hard-to-test paths:**
1. Embed page session lookup: `curl http://localhost:3003/api/playback/sessions/{id}` should return the session JSON, not 404.
2. SRS on-play: trigger a webhook by playing a stream, check API logs — should NOT see "session ... not found in DB".
3. Status webhook delivery: stop a camera, wait 30s, check `WebhookDelivery` table — `responseStatus` should be populated.
4. Schedule recording: enable a recording schedule, wait for a tick, confirm `Recording` row was created and camera `isRecording=true`.
5. Boot SRS regeneration: restart API, check logs — should NOT see "Failed to regenerate SRS config on boot".

## Pitfalls

1. **`SystemPrismaService` connects as DB superuser (`rolbypassrls=true`)** — every query bypasses RLS entirely. Always pair it with explicit `where: { orgId }` when the orgId is in the call signature. The pattern from commit 49adac6 is the canonical example: `findFirst({ where: { id, orgId } })` instead of `findUnique({ where: { id } })`.

2. **`findUnique` vs `findFirst`** — `findUnique` only accepts a unique index. `findFirst` accepts any WHERE clause. When adding the defensive `orgId` you usually have to switch from `findUnique({where:{id}})` to `findFirst({where:{id, orgId}})`. Code that mutates (`update`, `delete`) on a unique key still uses `where:{id}` — guard those with a prior `findFirst` ownership check (StatusService.transition pattern).

3. **PrismaService (`app_user`) is also RLS-subject** — it is NOT a workaround for missing CLS. Several services (NotificationsService, RecordingsService) inject it as `rawPrisma` and use it from worker contexts. Those calls are JUST as broken as TENANCY_CLIENT calls. The fix isn't "use rawPrisma" — it's "use systemPrisma".

4. **WebhookDelivery has no `orgId` column** — RLS on `WebhookDelivery` (if any) cascades through the `WebhookSubscription` FK. When swapping WebhookDeliveryProcessor to systemPrisma there is no orgId to add to the where clause. Document this in a comment so future readers don't think the defense-in-depth was forgotten.

5. **`SettingsService.onModuleInit` failure is masked** by the `try/catch` block that logs a `warn`. After the fix, watch for the warn disappearing — that's the success signal. Don't be fooled by a green boot if the warn is still there.

6. **NotifyDispatchProcessor already uses `SystemPrismaService` for its own queries** (commit 8ea20f7) but still calls into `WebhooksService.emitEvent` and `NotificationsService.createForCameraEvent`, both of which run TENANCY_CLIENT internally. The fix is in those downstream services, not in the processor. Easy mistake: thinking 8ea20f7 already covered this.

7. **`PlaybackService.createSession` is not broken** — it's reached via AuthOrApiKeyGuard which always sets ORG_ID. Only `getSession` and `verifyToken` need to move. Don't over-migrate.

8. **`updateSchedule` / `deleteSchedule` already filter by orgId in tenantPrisma calls** (`findFirst({ where: { id, orgId } })`) — those are HTTP-reached only and stay on tenantPrisma. No defense-in-depth gap.

## Out of Scope (Confirmation)

- Tenancy extension untouched.
- No new RLS policies, no migrations.
- No refactor of unrelated bugs spotted along the way (e.g., `policies.service.ts` `seedSystemDefault` already does the right thing; `api-keys.service.ts` `findByHash`/`updateLastUsed` already use explicit set_config bypass — both correct, no change).
- Don't switch the public embed `getSession` to require auth — that contradicts its purpose.

## Sources

### Primary (HIGH confidence — read in this session)
- `apps/api/src/tenancy/prisma-tenancy.extension.ts` — confirms positive-signal contract (no signals → skip set_config)
- `apps/api/src/tenancy/tenancy.module.ts` — confirms PrismaService is the underlying client (so role is `app_user`)
- `apps/api/src/prisma/system-prisma.service.ts` — confirms RLS-bypass via DB superuser
- `apps/api/src/prisma/rls.policies.sql`, `apps/api/src/prisma/migrations/rls_apply_all/migration.sql`, `apps/api/src/prisma/migrations/rls_superuser_bypass_positive_signal/migration.sql` — RLS policy semantics
- `apps/api/src/auth/guards/auth.guard.ts`, `org-admin.guard.ts`, `super-admin.guard.ts`, `api-keys/api-key.guard.ts`, `api-keys/auth-or-apikey.guard.ts` — what each guard sets in CLS
- `apps/api/src/srs/srs-callback.controller.ts` — confirms NO guard
- `apps/api/src/playback/playback.controller.ts` — confirms `getSession` has no `@UseGuards()`
- All 18 service files listed in the inventory + their controllers / processor entry points
- Commits `8ea20f7` and `49adac6` — established pattern
