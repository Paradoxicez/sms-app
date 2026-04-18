# Stack Research: v1.2 Self-Service, Resilience & UI Polish

**Domain:** SaaS CCTV streaming platform -- new capabilities for existing stack
**Researched:** 2026-04-18
**Confidence:** HIGH

## Existing Stack (DO NOT change)

Already installed and validated through v1.1:

| Technology | Version | Purpose |
|------------|---------|---------|
| NestJS | 11.x | Backend framework |
| Next.js | 15.x | Frontend (App Router) |
| PostgreSQL | 16 | Primary database |
| Prisma | 6.x | ORM |
| Redis | 7.x | Cache/sessions/BullMQ backend |
| SRS | v6.0 | Stream engine |
| FFmpeg | 7.x | RTSP pull, transcoding |
| MinIO | 8.x | Object storage (recordings) |
| Better Auth | 1.6.x | Auth (orgs, RBAC, sessions) |
| BullMQ | 5.x | Job queues |
| Socket.IO | 4.8.x | Real-time updates |
| hls.js | 1.6.x | HLS playback |
| fluent-ffmpeg | 2.1.x | FFmpeg process wrapper |
| @tanstack/react-table | 8.21.x | DataTable logic |
| shadcn/ui | 4.2.0 | Component library |
| recharts | 3.8.x | Charts |
| react-hook-form + zod | 7.72 / 4.3 | Forms + validation |

---

## New Dependencies Required: ZERO npm packages

Every feature in v1.2 can be built with the existing stack. No new npm dependencies needed.

### Feature-by-Feature Analysis

---

### 1. FFmpeg Full Resilience (Auto-Reconnect, Health Check, Notification)

**What exists:** `StreamProcessor` with BullMQ exponential backoff (20 attempts), `FfmpegService` with process tracking, `StatusService` with state machine (offline -> connecting -> online -> reconnecting -> degraded -> offline).

**What's missing:** Active health check loop, SRS restart detection, proactive reconnection (not just retry-on-failure).

**Stack needed:** Nothing new.

| Capability | How to Build | Uses |
|-----------|-------------|------|
| Health check loop | BullMQ repeatable job (every 30s) polling FFmpeg process liveness + SRS `/api/v1/streams` API | `@nestjs/bullmq` (installed), `@nestjs/schedule` (installed) |
| SRS restart detection | SRS `on_publish`/`on_unpublish` HTTP callbacks already configured; add startup scan of `/api/v1/streams` to detect missing streams after SRS restart | Built-in HTTP fetch |
| Auto-reconnect on camera drop | FFmpeg `error` event already triggers BullMQ retry; enhance with immediate re-queue instead of waiting for backoff when stream was previously healthy | `bullmq` (installed) |
| Auto-reconnect on SRS restart | When health check detects SRS is back but streams are missing, re-queue all previously-online cameras | `bullmq` (installed) |
| Notification on status change | `StatusService.transition()` already calls `NotificationsService.createForCameraEvent()` and `WebhooksService.emitEvent()` | Already wired |

**Implementation pattern:**
```
Health Check Processor (BullMQ repeatable job, 30s interval):
  1. For each camera with status 'online' or 'reconnecting':
     a. Check if FFmpeg process is alive (FfmpegService.isRunning)
     b. Check if SRS has the stream (GET /api/v1/streams, match stream key)
     c. If FFmpeg dead but camera should be online -> re-queue stream job
     d. If SRS has no stream but FFmpeg running -> restart FFmpeg
  2. For SRS health: GET /api/v1/versions (if fails, SRS is down)
     a. When SRS comes back, scan all 'online' cameras, restart missing streams
```

**Why no new library:** BullMQ repeatable jobs + `@nestjs/schedule` Cron already handle periodic tasks. The health check is a simple HTTP poll to SRS API + process liveness check. No circuit breaker library needed -- the exponential backoff in BullMQ IS the circuit breaker.

---

### 2. Recording Playback Page with Timeline

**What exists:** `TimelineBar` component (24-hour drag-to-select, seek), `Recording` + `RecordingSegment` models in Prisma (with timestamps, durations, MinIO paths), `MinioService` for presigned URLs, `hls.js` for playback.

**What's missing:** A playback page that combines timeline + video player + segment-level seeking.

**Stack needed:** Nothing new.

| Capability | How to Build | Uses |
|-----------|-------------|------|
| Timeline with segment-level granularity | Enhance existing `TimelineBar` -- query `RecordingSegment` timestamps to show exact coverage (not just hour-level) | Existing component |
| Video playback of recording segments | Generate presigned URLs for fMP4 init segment + media segments from MinIO, construct an HLS manifest on-the-fly (or serve pre-built manifest) | `hls.js` (installed), `minio` (installed) |
| Seek to specific time | Map timeline click position to segment `seqNo`/`timestamp`, load corresponding segment via HLS | `hls.js` currentTime API |
| Date picker for selecting day | Existing `Calendar` + `Popover` composition (shadcn) | Already available |
| Multi-camera recording comparison | DataTable of recordings with play action | `@tanstack/react-table` (installed) |

**Recording playback architecture:**
```
Backend endpoint: GET /recordings/:id/manifest
  1. Fetch Recording + segments from DB
  2. Generate HLS manifest (#EXTM3U with #EXT-X-MAP for init segment)
  3. Each segment gets a presigned MinIO URL (short TTL, e.g., 15 min)
  4. Return manifest as application/vnd.apple.mpegurl

Frontend:
  1. TimelineBar shows segment coverage for selected date
  2. Click/drag on timeline -> seek to time
  3. hls.js loads manifest from backend
  4. Seeking = hls.js.currentTime = targetSeconds
```

**Why no video.js:** hls.js is already installed and working for live streams. Recording playback uses the same HLS protocol -- just point hls.js at a recording manifest instead of a live manifest. Adding video.js (240KB+ gzipped) for a seek bar would be absurd when the custom `TimelineBar` already exists with drag-select and keyboard navigation.

---

### 3. User Account Self-Service (Avatar Upload, Password Change, Name Update)

**What exists:** Better Auth with `emailAndPassword` enabled, `authClient` on frontend with `signIn`/`signOut`/`useSession`.

**What's already available in Better Auth (no new dependencies):**

| Feature | Better Auth API | Client Method |
|---------|----------------|---------------|
| Change password | Built-in | `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions })` |
| Update name | Built-in | `authClient.updateUser({ name })` |
| Update avatar URL | Built-in | `authClient.updateUser({ image: "url" })` |

**Avatar upload approach:**
```
1. Frontend: File input -> upload to MinIO via backend endpoint
2. Backend: POST /users/avatar
   - Accept multipart/form-data
   - Validate file type (image/jpeg, image/png, image/webp) + size (max 2MB)
   - Upload to MinIO bucket (e.g., avatars/{userId}/{filename})
   - Generate permanent or long-lived presigned URL
   - Call Better Auth updateUser({ image: url }) server-side
3. Frontend: After upload success, refresh session to get new image URL
```

**Why upload to MinIO instead of base64:** Better Auth can store avatar as base64 in the `image` column, but this bloats the database and slows down every session fetch. Store in MinIO (already running), save URL in Better Auth.

**File upload handling:** NestJS `@nestjs/platform-express` (already installed) includes Multer for multipart file uploads. No additional package needed.

| Capability | Uses |
|-----------|------|
| File upload parsing | `@nestjs/platform-express` Multer (installed) |
| File storage | `minio` client (installed) |
| Image URL in user record | `better-auth` updateUser (installed) |
| Password change | `better-auth` changePassword (installed) |

---

### 4. Camera Maintenance Mode

**What exists:** Camera status state machine in `StatusService` with transitions: offline -> connecting -> online -> reconnecting -> degraded -> offline.

**What's needed:** Add `maintenance` as a new status value.

**Stack needed:** Nothing new. This is a schema + business logic change.

| Change | Detail |
|--------|--------|
| Prisma schema | Add `maintenance` to Camera status (it's a string field, no enum change needed) |
| StatusService | Add valid transitions: any status -> maintenance, maintenance -> offline/connecting |
| StreamsService | When entering maintenance: stop FFmpeg process, prevent auto-reconnect |
| Frontend | New status badge variant, maintenance toggle action in camera actions dropdown |

**State machine update:**
```
Add to validTransitions:
  maintenance: ['offline', 'connecting']  // can only exit to offline or connecting
  online: ['reconnecting', 'degraded', 'offline', 'maintenance']  // add maintenance
  offline: ['connecting', 'maintenance']  // add maintenance
  connecting: ['online', 'offline', 'maintenance']
  reconnecting: ['online', 'offline', 'maintenance']
  degraded: ['online', 'offline', 'maintenance']
```

**Health check integration:** When camera is in `maintenance` status, the health check loop MUST skip it -- do not attempt reconnection.

---

### 5. DataTable Migrations (Team, Organizations, Cluster Nodes, Platform Audit)

**Stack needed:** Nothing new. Reuse the existing `DataTable` component pattern with `@tanstack/react-table` already installed.

---

### 6. Dashboard Improvements + Map UI Improvements

**Stack needed:** Nothing new. Uses existing `recharts`, `leaflet`/`react-leaflet`, shadcn components.

---

## shadcn Components to Add via CLI

These are copy-pasted source files, NOT npm dependencies:

```bash
cd apps/web

# Avatar component for user self-service page (if not already added)
npx shadcn@latest add avatar

# Slider for timeline zoom control (optional, nice-to-have)
# Already installed per existing stack list
```

**Note:** The `avatar` component is already listed in the existing shadcn components. No new shadcn components needed.

---

## Installation Summary

```bash
# === NO NEW npm DEPENDENCIES ===
# Every v1.2 feature uses existing packages.

# Verify existing packages are current:
cd apps/api && npm ls better-auth bullmq @nestjs/bullmq minio fluent-ffmpeg
cd apps/web && npm ls better-auth hls.js
```

**Total new npm dependencies: 0**

---

## Alternatives Considered

| Approach | Rejected | Why |
|----------|----------|-----|
| video.js for recording playback | YES | 240KB+ bundle, already have hls.js + custom TimelineBar. Adding video.js just for a seek bar is wasteful when TimelineBar already handles drag-select + keyboard seek. |
| sharp for avatar image processing | MAYBE LATER | Server-side image resize/crop. Currently overkill -- accept standard sizes (max 2MB), let the browser handle display sizing. Add sharp only if avatar images cause performance issues. |
| piscina/workerpool for FFmpeg health checks | NO | BullMQ repeatable jobs already run in worker threads. Adding another worker pool creates coordination complexity. |
| node-cron instead of @nestjs/schedule | NO | @nestjs/schedule is already installed and integrates with NestJS DI. node-cron would be redundant. |
| circuit-breaker library (opossum, cockatiel) | NO | BullMQ's exponential backoff with max attempts IS a circuit breaker. Adding a separate library would duplicate existing behavior. |
| better-auth-ui package for self-service | NO | Pre-built React components but tightly coupled to their styling. Our shadcn-based UI needs custom forms that match the green theme. Use Better Auth's API methods directly. |
| Multer S3 adapter for direct MinIO upload | NO | Adds unnecessary dependency. Upload to NestJS first (Multer memory storage), then push to MinIO via existing `minio` client. Simpler, more control over validation. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| video.js or plyr | Massive bundle, HLS already working with hls.js | hls.js + custom TimelineBar |
| better-auth-ui | Opinionated React components that won't match shadcn theme | Better Auth API methods + custom shadcn forms |
| sharp (for now) | Premature optimization for avatar processing | Accept size-limited uploads, resize via CSS |
| @aws-sdk/client-s3 | MinIO client already handles S3-compatible API | Existing `minio` package |
| Agenda/cron libraries | @nestjs/schedule + BullMQ repeatable jobs already cover periodic tasks | Existing BullMQ repeatable jobs |
| WebSocket health check library | Simple HTTP polling to SRS API is sufficient | Built-in fetch/axios |
| react-player | Wrapper around hls.js/video.js, adds abstraction for no benefit | Direct hls.js usage |

---

## Architecture Notes for Implementation

### FFmpeg Health Check Architecture

```
BullMQ Repeatable Job: "ffmpeg-health-check" (every 30s)
  |
  +-> Check SRS status: GET http://srs:1985/api/v1/versions
  |     |-> If SRS down: mark all online cameras as 'reconnecting'
  |     |-> If SRS up: continue
  |
  +-> For each camera where status IN ('online', 'reconnecting'):
  |     |-> Is FFmpeg running? (FfmpegService.isRunning)
  |     |-> Is stream in SRS? (GET /api/v1/streams, match key)
  |     |
  |     |-> FFmpeg running + SRS stream exists = healthy (no action)
  |     |-> FFmpeg dead + SRS no stream = re-queue stream job
  |     |-> FFmpeg running + SRS no stream = kill FFmpeg, re-queue
  |     |-> Camera in 'maintenance' = SKIP entirely
  |
  +-> Notification: StatusService.transition() already handles
        webhook + in-app notification on status change
```

### Recording Manifest Generation

```
GET /api/recordings/:recordingId/playback

Response: HLS manifest (application/vnd.apple.mpegurl)

#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-MAP:URI="<presigned-url-to-init-segment>"
#EXTINF:2.0,
<presigned-url-to-segment-0>
#EXTINF:2.0,
<presigned-url-to-segment-1>
...
#EXT-X-ENDLIST

Key: Use EXT-X-PROGRAM-DATE-TIME for each segment so hls.js can map
     real-world timestamps to playback position, enabling timeline seek.
```

### Avatar Upload Flow

```
Frontend:
  1. <input type="file" accept="image/*"> with 2MB limit check
  2. POST /api/users/avatar (multipart/form-data)
  3. On success: authClient.useSession().refetch()

Backend (NestJS):
  1. @UseInterceptors(FileInterceptor('avatar'))
  2. Validate: mimetype in ['image/jpeg','image/png','image/webp'], size <= 2MB
  3. Upload to MinIO: bucket=avatars, key={userId}/{uuid}.{ext}
  4. Generate presigned URL (long TTL or public bucket)
  5. Update user image via Better Auth admin API or direct Prisma update
  6. Return { imageUrl }
```

---

## Version Compatibility

| Existing Package | Used For (v1.2) | Verified |
|-----------------|----------------|----------|
| better-auth 1.6.x | changePassword, updateUser (name, image) | YES -- v1.6.5 fixed session refresh after password change |
| bullmq 5.x | Repeatable health check jobs, stream retry | YES -- repeatable jobs API stable |
| @nestjs/schedule 6.x | Cron decorator alternative (if needed) | YES -- works with NestJS 11 |
| minio 8.x | Avatar storage, recording segment storage | YES -- S3-compatible, presigned URLs |
| hls.js 1.6.x | Recording playback (fMP4 manifest) | YES -- supports EXT-X-PROGRAM-DATE-TIME for seek |
| fluent-ffmpeg 2.1.x | Process management, error events | YES -- stable API |
| @nestjs/platform-express | Multer file upload for avatars | YES -- built-in, no additional package |

---

## Sources

- [Better Auth User & Accounts docs](https://better-auth.com/docs/concepts/users-accounts) -- changePassword, updateUser API (HIGH confidence)
- [Better Auth Changelog](https://better-auth.com/changelog) -- v1.6.5 session refresh fix April 2026 (HIGH confidence)
- [SRS HTTP API v6 docs](https://ossrs.net/lts/en-us/docs/v6/doc/http-api) -- /api/v1/streams, /api/v1/versions endpoints (HIGH confidence)
- [hls.js API docs](https://github.com/video-dev/hls.js/blob/master/docs/API.md) -- EXT-X-PROGRAM-DATE-TIME, currentTime seeking (HIGH confidence)
- [NestJS File Upload docs](https://docs.nestjs.com/techniques/file-upload) -- Multer integration via @nestjs/platform-express (HIGH confidence)
- [BullMQ Repeatable Jobs docs](https://docs.bullmq.io/guide/jobs/repeatable) -- every/cron pattern for health checks (HIGH confidence)
- Existing codebase analysis: `ffmpeg.service.ts`, `stream.processor.ts`, `status.service.ts`, `timeline-bar.tsx`, `schema.prisma` (HIGH confidence)

---
*Stack research for: SMS Platform v1.2 Self-Service, Resilience & UI Polish*
*Researched: 2026-04-18*
