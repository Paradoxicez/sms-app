# Architecture Research: v1.2 Integration Points

**Domain:** CCTV SaaS Platform -- new capabilities for existing system
**Researched:** 2026-04-18
**Confidence:** HIGH (based on direct codebase analysis)

## System Overview (Current + New Components)

```
                          EXISTING                                    NEW/MODIFIED
                          --------                                    ------------

 +-----------------+                                  +--------------------+
 |   Next.js Web   |  ........NEW PAGES...........>   | Recording Timeline |
 |   (App Router)  |  ........NEW PAGES...........>   | User Self-Service  |
 |                 |  ........NEW PAGES...........>   | Plan/Usage Viewer  |
 +---------+-------+  ........MODIFIED............>   | Camera Status Col  |
           |                                          +--------------------+
           | HTTP / Socket.IO
           |
 +---------v---------------------------------------------------+
 |                      NestJS API                              |
 |  +-------------+  +-------------+  +------------------+     |
 |  | AuthModule  |  | UsersModule |  | CamerasModule    |     |
 |  | (Better Auth)|  | (self-svc) |  | (maint mode)     |     |
 |  +-------------+  +------+------+  +--------+---------+     |
 |                           |                  |               |
 |  +-------------+  +------v------+  +--------v---------+     |
 |  | StatusModule|  | StreamModule|  | RecordingsModule  |     |
 |  | (maint mode)|  | (resilience)|  | (timeline API)    |     |
 |  +------+------+  +------+------+  +--------+---------+     |
 |         |                |                   |               |
 |  +------v------+  +------v------+  +---------v--------+     |
 |  | StatusGW    |  | BullMQ      |  | ManifestService   |     |
 |  | (Socket.IO) |  | stream-ffmpeg| | (timeline query)  |     |
 |  +-------------+  +------+------+  +--------+---------+     |
 |                          |                   |               |
 |  +------NEW------+  +---v---+  +----+  +----v----+         |
 |  | HealthCheck   |  |FFmpeg |  |SRS |  | MinIO   |         |
 |  | Scheduler     |  |Svc    |  |v6  |  | Storage |         |
 |  | (BullMQ cron) |  +-------+  +----+  +---------+         |
 |  +---------------+                                          |
 +-------------------------------------------------------------+
           |
 +---------v-----------+
 | PostgreSQL + Redis   |
 | (Prisma + ioredis)   |
 +-----------------------+
```

## Feature-by-Feature Integration Analysis

### 1. FFmpeg Full Resilience

**Current state:** BullMQ job with 20 retries + exponential backoff (1s, 2s, 4s, ... capped at 5min) handles FFmpeg crashes. `on_unpublish` callback does NOT transition status (comment in code: "Reconnect is handled by BullMQ"). The `intentionalStops` Set in `FfmpegService` distinguishes user-stop from crash. `StreamProcessor` transitions to `connecting` before starting FFmpeg. `SrsCallbackController.onPublish` transitions to `online` when SRS confirms the stream.

**Gap:** No active health monitoring. If FFmpeg process hangs (not crashed -- just frozen), BullMQ never retries because the job is still "active". No detection of SRS restart causing all streams to disconnect simultaneously. No notification to users when streams enter `reconnecting` state (the notification hook exists in StatusService but `reconnecting` transitions are never triggered by the current code path).

#### New Components

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| `HealthCheckProcessor` | BullMQ repeatable job | `streams/processors/health-check.processor.ts` | Periodic health loop checking all cameras with active stream jobs |
| `FfmpegHealthProbe` | Methods on FfmpegService | `streams/ffmpeg/ffmpeg.service.ts` | `getProcessPid()` and `isProcessHealthy()` to verify FFmpeg is alive and producing output |

#### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| `FfmpegService` | Add `getProcessPid(cameraId)` returning PID from ffmpeg command object; add `isProcessHealthy(cameraId)` checking PID alive + optional output byte tracking | Health check needs to verify process is alive, not just "in the Map" |
| `StreamProcessor` | Before running FFmpeg, check camera status; skip if `maintenance`. After BullMQ retry, transition to `reconnecting` (not `connecting`) on attempt > 1 | Currently goes `connecting` on every attempt; should show `reconnecting` after first failure. Must respect maintenance mode. |
| `StatusService.validTransitions` | Add `maintenance` state (see section 4) | Needed for camera maintenance mode |
| `StreamsModule` | Register `stream-health` BullMQ queue, provide `HealthCheckProcessor` | New repeatable job needs queue registration |
| `SrsCallbackController.onUnpublish` | No change needed | BullMQ retry already handles reconnection when FFmpeg errors; `on_unpublish` correctly stays as no-op |

#### Data Flow: Health Check Loop

```
BullMQ cron (every 30s, registered in StreamsModule.onModuleInit)
    |
    v
HealthCheckProcessor.process()
    |
    +---> Query cameras WHERE status IN ('online', 'reconnecting', 'degraded')
    |       AND status != 'maintenance'
    |
    +---> For each camera:
    |       |
    |       +---> FfmpegService.isRunning(cameraId)?
    |       |       |
    |       |       +---> YES: FfmpegService.isProcessHealthy(cameraId)?
    |       |       |       |
    |       |       |       +---> YES: All good, skip
    |       |       |       |
    |       |       |       +---> NO: Process hung (PID exists but no output)
    |       |       |               |
    |       |       |               +---> FfmpegService.stopStream(cameraId)
    |       |       |               +---> StatusService.transition('reconnecting')
    |       |       |               +---> StreamsService.startStream(cameraId) [re-queue]
    |       |       |
    |       |       +---> NO: FFmpeg process gone, but status still 'online'
    |       |               |
    |       |               +---> Check if BullMQ job exists for this camera
    |       |               +---> If no job: process crashed between retries
    |       |               +---> StatusService.transition('reconnecting')
    |       |               +---> StreamsService.startStream(cameraId) [re-queue]
    |       |
    +---> For each camera WHERE status = 'reconnecting':
            |
            +---> Check BullMQ job attempt count
            +---> If attempts >= OrgSettings.maxReconnectAttempts:
                    +---> StatusService.transition('offline')
                    +---> NotificationsService.createForCameraEvent(...)
                    +---> (notification emits to all org admins via existing hook)
```

#### Data Flow: SRS Restart Recovery

```
SRS container restarts
    |
    v
All RTMP connections drop --> FFmpeg processes exit with error
    |
    v
BullMQ retries each job (existing backoff: 1s, 2s, 4s, ... max 5min)
    |
    v
StreamProcessor re-runs
    |--- attempt > 1 --> StatusService.transition('reconnecting')
    |--- attempt == 1 --> StatusService.transition('connecting')
    |
    v
FFmpeg re-pushes RTMP to SRS --> SRS on_publish callback fires
    |
    v
SrsCallbackController.onPublish --> StatusService.transition('online')
```

**Key insight:** SRS restart recovery already works via BullMQ retry. The gap is: (1) health check for **hung** processes, (2) showing `reconnecting` status on retries, and (3) triggering notifications which already exist in StatusService but never fire because `reconnecting` transition never happens.

#### Schema Changes

None required. `OrgSettings.maxReconnectAttempts` already exists (default 10). Camera `status` field is a string, not an enum -- `reconnecting` is already a valid value in `StatusService.validTransitions`.

#### Redis Additions

Optional: `ffmpeg:lastOutput:{cameraId}` key with value = timestamp of last FFmpeg output. Updated by FfmpegService on progress events. Read by HealthCheckProcessor. TTL = 60s (auto-expires if FFmpeg dies). This enables detecting stalled processes that are alive but not producing output.

---

### 2. Recording Playback with Timeline

**Current state:** Backend has comprehensive recording infrastructure:
- `ManifestService.getSegmentsForDate()` returns hourly availability (24 entries)
- `ManifestService.getDaysWithRecordings()` returns calendar data for a month
- `ManifestService.generateManifest()` generates VOD m3u8 per recording
- Segment proxy endpoints exist (`GET /segments/:id/proxy`, `GET /:id/init-segment`)
- `RecordingsController` has timeline and calendar endpoints
- Frontend has recordings DataTable with bulk delete and download, but no timeline playback page

**Gap:** No frontend timeline UI. Backend timeline API returns hour-level granularity only -- need finer granularity for visual scrubbing. No cross-recording playback (user expects continuous timeline across multiple recording sessions in a day, with discontinuity markers between gaps).

#### New Components

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| `RecordingPlayerPage` | Next.js page | `apps/web/src/app/app/recordings/[cameraId]/page.tsx` | Per-camera timeline playback page |
| `TimelineBar` | React component | `apps/web/src/app/app/recordings/components/timeline-bar.tsx` | 24-hour horizontal bar with colored segments showing recording coverage |
| `VideoPlayer` | React component | `apps/web/src/app/app/recordings/components/video-player.tsx` | hls.js player with time display and seek support |
| `RecordingCalendar` | React component | `apps/web/src/app/app/recordings/components/recording-calendar.tsx` | Date picker highlighting days with recordings |

#### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| `ManifestService` | Add `generateTimelineManifest(cameraId, orgId, date, startHour?, endHour?)` -- generates m3u8 spanning multiple Recording rows for same camera+date | Current `generateManifest` is per-recording ID; timeline needs cross-recording VOD playlist |
| `ManifestService` | Add `getSegmentsForDateDetailed(cameraId, orgId, date)` returning 5-minute or 1-minute granularity bins | Hour-level granularity is too coarse for a visual timeline bar |
| `RecordingsController` | Add `GET /api/recordings/camera/:cameraId/timeline-manifest?date=&startHour=&endHour=` | New endpoint serving cross-recording VOD playlist for hls.js |
| `RecordingsController` | Modify `GET /api/recordings/camera/:cameraId/timeline` to accept `granularity` param | Support minute-level detail for timeline bar rendering |

#### Data Flow: Timeline Playback

```
User navigates to /recordings/{cameraId}
    |
    v
Page loads --> GET /api/recordings/camera/{cameraId}/calendar?year=2026&month=4
    |                Returns: { days: [1, 3, 5, 12, 18] }
    v
User picks date (default: today)
    |
    v
GET /api/recordings/camera/{cameraId}/timeline?date=2026-04-18&granularity=5min
    |   Returns: { bins: [{ minute: 0, hasData: true, durationSec: 300 }, ...] }
    |   (288 entries for 5-minute bins across 24 hours)
    v
Render TimelineBar -- 24h horizontal bar, colored where hasData=true
    |
    v
User clicks on a segment in the bar (e.g., clicks at 08:30)
    |
    v
GET /api/recordings/camera/{cameraId}/timeline-manifest?date=2026-04-18&startHour=8&endHour=9
    |   Returns: VOD m3u8 with #EXT-X-DISCONTINUITY between recording sessions
    |   Uses proxy URLs: /api/recordings/segments/:id/proxy
    v
hls.js loads m3u8 --> Streams segments via existing proxy endpoints
    |
    v
User scrubs to different hour --> New manifest request, hls.js reloads
```

#### Cross-Recording Manifest Generation

```typescript
// Key logic for timeline manifest
async generateTimelineManifest(cameraId, orgId, date, startHour, endHour) {
  const start = new Date(`${date}T${startHour}:00:00Z`);
  const end = new Date(`${date}T${endHour}:59:59.999Z`);
  
  // Get ALL segments for this camera in the time range, across recordings
  const segments = await this.prisma.recordingSegment.findMany({
    where: { cameraId, orgId, timestamp: { gte: start, lte: end } },
    orderBy: { timestamp: 'asc' },
    include: { recording: { select: { id: true, initSegment: true } } },
  });
  
  // Group segments by recording ID to detect session boundaries
  // Insert #EXT-X-DISCONTINUITY between different recording sessions
  // Each recording may have its own init segment
  let m3u8 = '#EXTM3U\n#EXT-X-VERSION:7\n...';
  let currentRecordingId = null;
  
  for (const seg of segments) {
    if (seg.recordingId !== currentRecordingId) {
      if (currentRecordingId !== null) {
        m3u8 += '#EXT-X-DISCONTINUITY\n';
      }
      // Add EXT-X-MAP for new recording's init segment
      if (seg.recording.initSegment) {
        m3u8 += `#EXT-X-MAP:URI="/api/recordings/${seg.recordingId}/init-segment"\n`;
      }
      currentRecordingId = seg.recordingId;
    }
    m3u8 += `#EXTINF:${seg.duration.toFixed(6)},\n`;
    m3u8 += `/api/recordings/segments/${seg.id}/proxy\n`;
  }
  m3u8 += '#EXT-X-ENDLIST\n';
  return m3u8;
}
```

#### Schema Changes

None required. `RecordingSegment.timestamp` is already indexed with `@@index([cameraId, timestamp])` and `@@index([orgId, cameraId, timestamp])` -- perfect for cross-recording time-range queries.

#### Performance Consideration

A camera recording 24/7 at 2-second segments produces ~43,200 segments/day. Loading 1 hour = ~1,800 segments. The m3u8 manifest for 1 hour would be ~50KB -- acceptable for hls.js. Limit manifest requests to 1-hour windows to keep response size manageable. The timeline bar loads summary data (5-minute bins = 288 entries), not individual segments.

---

### 3. User Account Self-Service

**Current state:** Better Auth handles all authentication via `auth.config.ts`. The `User` model has `name`, `email`, `image` fields managed by Better Auth. No self-service endpoints exist -- all user management is through admin/org-admin flows via `UsersController` and `MembersController`.

**Gap:** Need UI for users to update their own name, avatar, email, and password. Better Auth's client SDK provides `updateUser`, `changeEmail`, `changePassword` natively -- these should be leveraged rather than building custom NestJS endpoints.

#### New Components

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| `AccountPage` | Next.js page | `apps/web/src/app/app/account/page.tsx` | User self-service form |
| `ProfileForm` | React component | `apps/web/src/app/app/account/components/profile-form.tsx` | Name + avatar edit |
| `EmailChangeForm` | React component | `apps/web/src/app/app/account/components/email-change-form.tsx` | Email update (triggers Better Auth verification) |
| `PasswordChangeForm` | React component | `apps/web/src/app/app/account/components/password-change-form.tsx` | Current + new password |
| `AvatarUpload` | React component | `apps/web/src/app/app/account/components/avatar-upload.tsx` | Image upload, crop, preview |

#### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| Sidebar navigation (both portals) | Add "Account" or "Profile" link | User needs to find the self-service page |
| `MinioService` (or new `AvatarService`) | Add `uploadAvatar(userId, buffer): string` | Store avatar images in MinIO `avatars` bucket, return public URL |
| `RecordingsController` or new `UploadController` | Add `POST /api/account/avatar` multipart upload | File upload needs backend endpoint; Better Auth handles the rest |

#### Integration Pattern: Better Auth Client SDK

```
Frontend (Next.js)                           Backend (NestJS / Better Auth)
-----------------------                      --------------------------------
authClient.updateUser({                      Better Auth middleware handles
  name: "New Name",           ------->       directly -- updates User table,
  image: "https://minio/..."                 no custom endpoint needed
})

authClient.changeEmail({                     Better Auth sends verification
  newEmail: "new@mail.com"    ------->       email, updates on confirm
})

authClient.changePassword({                  Better Auth validates current
  currentPassword: "old",     ------->       password, hashes new, updates
  newPassword: "new"                         Account table
})
```

**Key insight:** The only custom backend work is avatar file upload. Everything else uses Better Auth's client SDK which communicates directly with the Better Auth middleware mounted in NestJS. No new NestJS controllers needed for name/email/password changes.

#### Avatar Storage

Upload to MinIO `avatars` bucket via `POST /api/account/avatar` (multipart form). Backend stores file as `avatars/{userId}/{timestamp}.{ext}`, returns URL. Frontend then calls `authClient.updateUser({ image: returnedUrl })`. This is consistent with existing MinIO usage for recordings.

#### Schema Changes

None. Better Auth manages the `User.image` field directly.

---

### 4. Camera Maintenance Mode

**Current state:** Camera `status` supports: `offline`, `connecting`, `online`, `reconnecting`, `degraded`. `StatusService.validTransitions` map defines allowed state transitions. The status field is a plain string (not a Prisma enum), so no migration needed to add new values.

**Gap:** Need a `maintenance` status that: (a) stops the active stream, (b) prevents stream restart and BullMQ retry, (c) shows a distinct icon in UI, (d) can be toggled by operators/admins.

#### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| `StatusService.validTransitions` | Add: any state can transition to `maintenance`; `maintenance` can only transition to `offline` | Maintenance is an explicit operator action, entering from any state |
| `CamerasService` | Add `setMaintenanceMode(cameraId: string, enabled: boolean)` | Orchestrates: stop stream (if running) -> transition to maintenance, or maintenance -> offline |
| `CamerasController` | Add `POST /api/cameras/:id/maintenance` with body `{ enabled: boolean }` | REST endpoint for toggling |
| `StreamsService.startStream` | Add guard: if camera.status === 'maintenance', throw BadRequestException | Prevent streaming while in maintenance |
| `StreamProcessor.process` | Before FFmpeg start, re-fetch camera status; if `maintenance`, resolve job without starting | Stop BullMQ retry loop if maintenance was enabled during reconnection |
| `HealthCheckProcessor` (new) | Skip cameras where status === 'maintenance' | Don't flag maintenance cameras as unhealthy |
| Camera DataTable columns | Add 3-icon status column: live indicator (green/gray circle), recording indicator (red dot), maintenance indicator (wrench icon) | Visual indicator per requirements |

#### State Machine Update

```
Current valid transitions:
  offline      -> connecting
  connecting   -> online | offline
  online       -> reconnecting | degraded | offline
  reconnecting -> online | offline
  degraded     -> online | offline

New transitions (add maintenance):
  ANY state    -> maintenance    (operator explicitly enables)
  maintenance  -> offline        (operator disables maintenance)

Maintenance blocks:
  - StreamsService.startStream() --> 400 Bad Request
  - StreamProcessor.process()    --> resolve immediately (no FFmpeg start)
  - HealthCheckProcessor         --> skip (don't report as unhealthy)
```

#### Maintenance Mode Workflow

```
Operator clicks "Enable Maintenance" on camera
    |
    v
POST /api/cameras/:id/maintenance { enabled: true }
    |
    v
CamerasService.setMaintenanceMode(cameraId, true)
    |
    +---> If camera has active stream:
    |       StreamsService.stopStream(cameraId)  [kills FFmpeg, removes BullMQ job]
    |
    +---> StatusService.transition(cameraId, orgId, 'maintenance')
    |       [broadcasts via Socket.IO, fires webhook, creates notification]
    |
    v
Camera shows wrench icon in UI, stream controls disabled
    ...
Operator clicks "Disable Maintenance"
    |
    v
POST /api/cameras/:id/maintenance { enabled: false }
    |
    v
CamerasService.setMaintenanceMode(cameraId, false)
    +---> StatusService.transition(cameraId, orgId, 'offline')
    |
    v
Camera shows gray circle, stream controls re-enabled
```

#### Schema Changes

None needed. Camera `status` is stored as `String` in Prisma (not enum). Adding `'maintenance'` as a value only requires updating `StatusService.validTransitions` map.

---

### 5. Plan/Usage Viewer

**Current state:** `Package` model has limits: `maxCameras`, `maxViewers`, `maxBandwidthMbps`, `maxStorageGb`. `Organization.packageId` links to assigned package. `RecordingsService.checkStorageQuota()` already aggregates storage usage vs limit. `DashboardService` and `DashboardController` exist for dashboard data.

**Gap:** No frontend page showing plan limits vs actual usage. No single endpoint aggregating all usage metrics.

#### New Components

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| `PlanUsagePage` | Next.js page | `apps/web/src/app/app/plan/page.tsx` | View-only plan and usage display |
| `UsageCard` | React component | Inline in page | Progress bar showing used/limit with percentage |
| `PlanController` or extend `DashboardController` | NestJS endpoint | `dashboard/` or new `plan/` | `GET /api/plan/usage` aggregating all metrics |

#### API Response Shape

```typescript
// GET /api/plan/usage
{
  plan: {
    name: "Pro",
    maxCameras: 50,
    maxViewers: 200,
    maxBandwidthMbps: 100,
    maxStorageGb: 500,
    features: { ... }
  },
  usage: {
    cameras: {
      used: 23,              // COUNT(Camera WHERE orgId=X)
      limit: 50,
      percent: 46
    },
    storage: {
      usedBytes: "53687091200", // SUM(RecordingSegment.size WHERE orgId=X) -- BigInt as string
      limitBytes: "536870912000",
      percent: 10
    },
    activeStreams: 15,          // COUNT(Camera WHERE orgId=X AND status='online')
    activeViewers: 12,         // From StatusService viewer counts (in-memory Map)
  },
  canUpgrade: false,           // true if org is not on highest tier
  contactAdmin: "Contact your organization admin to change your plan"
}
```

#### Data Aggregation Queries

```typescript
// All queries use existing Prisma models, no new tables
const cameraCount = await prisma.camera.count({ where: { orgId } });
const storageQuota = await recordingsService.checkStorageQuota(orgId); // Already exists
const activeStreams = await prisma.camera.count({ where: { orgId, status: 'online' } });
const org = await prisma.organization.findUnique({
  where: { id: orgId },
  include: { package: true }
});
```

#### Schema Changes

None. All data already exists in current models.

---

### 6. Dashboard Improvements

No new modules or architectural changes needed. Additive data to existing `DashboardService` endpoints:

| Addition | Where | Why |
|----------|-------|-----|
| Recording stats (active recordings, storage %) | `DashboardService` | Currently missing from dashboard |
| Maintenance camera count | `DashboardService` | New status to surface |
| Super admin cross-org metrics | Admin dashboard endpoint | System-wide view of all orgs |

---

## Recommended Build Order

Build order driven by dependency analysis and risk:

```
Phase 1: Camera Maintenance Mode
   Scope: StatusService + CamerasService + CamerasController + UI column
   Deps: None
   Rationale: Small, self-contained. Unblocks FFmpeg resilience (health check
   needs to skip maintenance cameras). Unblocks camera status column UI.

Phase 2: FFmpeg Full Resilience
   Scope: HealthCheckProcessor + FfmpegService health probe + StreamProcessor changes
   Deps: Maintenance mode (Phase 1)
   Rationale: Highest-risk feature, benefits from maintenance mode being done.
   BullMQ health check scheduler is the main new component.

Phase 3: User Account Self-Service
   Scope: Account page + avatar upload + Better Auth client SDK calls
   Deps: None (independent of other phases)
   Rationale: Better Auth does the heavy lifting. Low risk, isolated scope.
   Only custom work is avatar upload endpoint.

Phase 4: Plan/Usage Viewer
   Scope: Plan page + usage aggregation endpoint
   Deps: None
   Rationale: Read-only data, very contained, reuses existing query logic.

Phase 5: Recording Timeline Playback
   Scope: Timeline page + TimelineBar + VideoPlayer + cross-recording manifest
   Deps: None (backend APIs mostly exist)
   Rationale: Largest frontend scope. Backend needs cross-recording manifest
   and finer-grained timeline API, but segment proxy infrastructure is ready.

Phase 6: Dashboard + Map UI + DataTable Migrations + Bug Fixes
   Scope: Polish and fixes across multiple areas
   Deps: Phases 1-5 complete
   Rationale: Independent tasks, can parallelize. Lowest risk.
```

**Phase ordering rationale:**
- Maintenance mode first because it's tiny (< 1 day) and FFmpeg resilience needs it.
- FFmpeg resilience second because it's the highest-value backend feature and highest risk.
- Self-service and plan viewer are independent, low-risk -- order is flexible.
- Timeline playback is the most complex frontend feature but backend is 80% built.
- Polish last because it's all independent tasks.

## Architectural Patterns

### Pattern 1: BullMQ Repeatable Health Check

**What:** A repeatable BullMQ job running every 30 seconds that checks all cameras with active stream expectations.
**When to use:** For any periodic background task that must survive API restarts and be idempotent.
**Trade-offs:** BullMQ repeatable jobs are stored in Redis and survive restarts. 30-second interval balances responsiveness vs query overhead (~50 cameras per check). If multiple API instances run, BullMQ distributes jobs -- only one instance picks up each job (built-in).

```typescript
// In StreamsModule.onModuleInit
await this.healthQueue.upsertJobScheduler(
  'ffmpeg-health-check',
  { every: 30_000 }, // 30 seconds
  { name: 'health-check' },
);
```

### Pattern 2: Better Auth Client Delegation

**What:** Use Better Auth's client SDK for user account operations instead of building custom NestJS endpoints.
**When to use:** For updateUser, changeEmail, changePassword -- any operation Better Auth handles natively.
**Trade-offs:** Less control over the flow, but battle-tested auth operations. Email change requires verification flow that Better Auth manages. Password change validates current password automatically. Only build custom endpoints for operations Better Auth doesn't cover (avatar file upload).

### Pattern 3: Windowed Timeline Manifests

**What:** Generate VOD m3u8 manifests for 1-hour windows, not entire days. When user scrubs to a different hour, load a new manifest.
**When to use:** Recording timeline playback where segments can number in thousands per day.
**Trade-offs:** Multiple manifest requests as user scrubs, but each response is small (~50KB for 1 hour). Prevents hls.js from choking on 40,000+ entry playlists. The timeline bar shows availability from the summary API; the player only loads the window being watched.

### Pattern 4: Status Machine Gatekeeper

**What:** All camera status changes go through `StatusService.transition()`, never direct DB updates.
**When to use:** Every place that changes camera status -- maintenance toggle, FFmpeg lifecycle, health check, SRS callbacks.
**Trade-offs:** Single point of control ensures webhooks fire, notifications create, Socket.IO broadcasts. Slightly more code for simple cases, but prevents bugs where status changes bypass side effects.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Polling SRS API for Health Checks

**What people do:** Call `/api/v1/streams` every N seconds to check if streams exist.
**Why it's wrong:** SRS API has no auth, pagination defaults to 10 results, and adds network overhead for something checkable locally.
**Do this instead:** Check FFmpeg process health locally (PID alive + output bytes increasing). Only use SRS API as secondary fallback if needed.

### Anti-Pattern 2: Building Custom Auth Endpoints for Self-Service

**What people do:** Create `PATCH /api/users/me` with custom password hashing, email verification logic.
**Why it's wrong:** Reinventing flows Better Auth already provides. Risk of security bugs (timing attacks, missing rate limiting).
**Do this instead:** Use Better Auth client SDK. Only build custom endpoint for avatar upload.

### Anti-Pattern 3: Loading Full-Day Segments into One Manifest

**What people do:** Query all segments for 24 hours into a single m3u8.
**Why it's wrong:** 43,200 segments at 2s each. The m3u8 file would be ~1.5MB. hls.js would struggle to parse and seek.
**Do this instead:** Use 1-hour windowed manifests. Timeline bar uses summary API for visual, player loads only the active window.

### Anti-Pattern 4: Direct Database Status Updates

**What people do:** `prisma.camera.update({ data: { status: 'maintenance' } })` directly.
**Why it's wrong:** Skips webhook emission, notification creation, Socket.IO broadcast, and state machine validation.
**Do this instead:** Always go through `StatusService.transition()` for any status change.

## Integration Points Summary

### New vs Modified (Explicit)

| What | New or Modified | Scope |
|------|----------------|-------|
| `HealthCheckProcessor` | NEW file | `streams/processors/health-check.processor.ts` |
| `FfmpegService.isProcessHealthy()` | MODIFIED (add method) | `streams/ffmpeg/ffmpeg.service.ts` |
| `StreamProcessor.process()` | MODIFIED (maintenance check, reconnecting status) | `streams/processors/stream.processor.ts` |
| `StreamsModule` | MODIFIED (register health queue) | `streams/streams.module.ts` |
| `StatusService.validTransitions` | MODIFIED (add maintenance state) | `status/status.service.ts` |
| `CamerasService.setMaintenanceMode()` | MODIFIED (add method) | `cameras/cameras.service.ts` |
| `CamerasController` maintenance endpoint | MODIFIED (add endpoint) | `cameras/cameras.controller.ts` |
| `StreamsService.startStream()` | MODIFIED (maintenance guard) | `streams/streams.service.ts` |
| `ManifestService.generateTimelineManifest()` | MODIFIED (add method) | `recordings/manifest.service.ts` |
| `ManifestService.getSegmentsForDateDetailed()` | MODIFIED (add method) | `recordings/manifest.service.ts` |
| `RecordingsController` timeline-manifest endpoint | MODIFIED (add endpoint) | `recordings/recordings.controller.ts` |
| Avatar upload endpoint | NEW endpoint | New controller or extend existing |
| Plan/usage endpoint | NEW endpoint | `dashboard/` or new `plan/` directory |
| Account page | NEW page | `apps/web/src/app/app/account/page.tsx` |
| Plan page | NEW page | `apps/web/src/app/app/plan/page.tsx` |
| Recording player page | NEW page | `apps/web/src/app/app/recordings/[cameraId]/page.tsx` |
| TimelineBar component | NEW component | `apps/web/src/app/app/recordings/components/` |
| VideoPlayer component | NEW component | `apps/web/src/app/app/recordings/components/` |

### External Services

| Service | Integration Pattern | Changes Needed |
|---------|---------------------|----------------|
| SRS v6 | HTTP callbacks (unchanged), HTTP API (health check fallback only) | No changes to SRS |
| MinIO | Segment storage (unchanged), add `avatars` bucket | New bucket for avatar uploads |
| Redis | BullMQ queues (add `stream-health`), optional FFmpeg health TTL keys | Add health check queue |
| Better Auth | Client SDK for user self-service (new frontend usage) | No backend changes |
| PostgreSQL | New queries for timeline + usage aggregation | No schema changes |

## Sources

- Direct codebase analysis of all referenced files (HIGH confidence)
- `streams/processors/stream.processor.ts` -- BullMQ retry with 20 attempts, exponential backoff (HIGH confidence)
- `streams/ffmpeg/ffmpeg.service.ts` -- intentionalStops Set, runningProcesses Map (HIGH confidence)
- `status/status.service.ts` -- validTransitions map, webhook+notification hooks (HIGH confidence)
- `srs/srs-callback.controller.ts` -- on_publish/on_unpublish/on_play/on_stop/on_hls handlers (HIGH confidence)
- `recordings/manifest.service.ts` -- getSegmentsForDate, getDaysWithRecordings, generateManifest (HIGH confidence)
- `recordings/recordings.controller.ts` -- all recording endpoints including timeline/calendar (HIGH confidence)
- `auth/auth.config.ts` -- Better Auth with organization + admin plugins (HIGH confidence)
- `prisma/schema.prisma` -- Camera status as String, RecordingSegment indexes (HIGH confidence)

---
*Architecture research for: SMS Platform v1.2 integration*
*Researched: 2026-04-18*
