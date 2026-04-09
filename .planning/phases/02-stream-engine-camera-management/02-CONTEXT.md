# Phase 2: Stream Engine & Camera Management - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

FFmpeg process manager, RTSP-to-HLS pipeline via SRS, camera CRUD with Project > Site > Camera hierarchy, camera status monitoring with auto-reconnect, stream profiles, and Stream Engine settings UI. No playback security (JWT tokens, domain allowlist) or developer API — those are Phase 3 and Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Camera Hierarchy & CRUD
- **D-01:** Strict hierarchy enforced: Project > Site > Camera — must create Project and Site before adding a camera
- **D-02:** Camera fields — Required: name, stream URL (RTSP/SRT). Optional: location (lat/lng), tags, description, thumbnail (per CAM-01)
- **D-03:** Test connection (ffprobe) is optional — separate "Test Connection" button, not required before save
- **D-04:** Bulk import supports CSV + JSON upload with a medium-sized dialog showing camera table with status, editable inline for corrections before confirm
- **D-05:** Bulk import flow: Upload file → preview dialog (table with validation + inline edit) → confirm import (all cameras saved with status `offline`) → BullMQ background job runs ffprobe per camera → updates status + codec info

### Camera Status
- **D-06:** 5-state machine per CAM-04: online, offline, degraded, connecting, reconnecting
- **D-07:** Status updates pushed to UI via WebSocket (Socket.IO) in real-time

### FFmpeg Process Management
- **D-08:** BullMQ job queue for FFmpeg process lifecycle — each camera stream is a job in Redis queue, persists across restart, supports retry and status tracking
- **D-09:** Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s... up to 5min max) then stop and mark camera as offline (per CAM-05)
- **D-10:** H.265 auto-detection via ffprobe at registration — stores `needsTranscode` flag. On stream start, H.265 cameras use `-c:v libx264` instead of `-c:v copy` automatically (per STREAM-06)

### SRS Integration & HLS Delivery
- **D-11:** Stream profiles are fully custom — user creates any combination of codec, resolution, FPS, bitrate, audio mode. System validates settings and warns if incompatible (e.g., unsupported codec, resolution higher than source)
- **D-12:** All 6 SRS HTTP callbacks registered from day 1: on_publish, on_unpublish, on_play, on_stop, on_hls, on_dvr. Phase 2 actively uses on_publish/on_unpublish for camera status. on_play/on_stop tracks viewer count. on_hls/on_dvr log only (used in Phase 7)
- **D-13:** WebRTC (WHEP) output implemented in Phase 2 — open port 8000/udp in Docker Compose + expose WHEP endpoint URL. SRS handles RTMP → WebRTC conversion natively
- **D-14:** Internal platform preview uses direct HLS URL from SRS via backend proxy with session check (logged-in user + org_id + role permission). No JWT playback token needed — that's Phase 3 for external API consumers

### Stream Engine UI Settings
- **D-15:** UI labels use "Stream Engine" — never mention "SRS" directly to users
- **D-16:** Two-tier settings model:
  - **System-level (Super admin only):** HLS fragment/window size, RTMP/SRT ports, timeout values, HLS encryption toggle — form-based settings page that generates srs.conf + triggers reload
  - **Per-org (Org admin):** Default stream profile, max reconnect attempts, auto-start on boot, default recording mode, webhook preferences — stored in DB as org settings, used by backend when spawning FFmpeg or making behavior decisions

### Claude's Discretion
- Exact Prisma schema design for Project, Site, Camera, StreamProfile, OrgSettings tables
- BullMQ queue naming and job structure
- FFmpeg command construction and argument patterns
- Socket.IO room strategy for camera status broadcasts
- SRS srs.conf template structure and reload mechanism
- Backend proxy implementation for internal HLS preview
- Error handling patterns for FFmpeg process failures

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Camera Management
- `.planning/REQUIREMENTS.md` §Camera Management — CAM-01 through CAM-07 requirements
- `.planning/REQUIREMENTS.md` §Stream Engine — STREAM-01 through STREAM-08 requirements

### SRS Integration
- `CLAUDE.md` §SRS Deep Dive — Full SRS API surface, callback events, HLS config, codec support, Docker ports
- `CLAUDE.md` §SRS HTTP Callbacks — All callback events with data fields and auth pattern (return code 0 to allow)
- `CLAUDE.md` §FFmpeg + SRS Pipeline — RTSP pull to RTMP push pattern with recommended flags
- `CLAUDE.md` §HLS Configuration — Fragment size, window, encryption, fMP4 settings
- `CLAUDE.md` §Edge Clustering — Origin/edge architecture (informational for Phase 6)

### Tech Stack
- `CLAUDE.md` §Recommended Web App Stack — BullMQ, Socket.IO, node-fluent-ffmpeg, ioredis versions
- `.planning/PROJECT.md` §Constraints — Tech stack decisions (NestJS, PostgreSQL, Prisma, Redis)

### Phase 1 Foundation
- `.planning/phases/01-foundation-multi-tenant/01-CONTEXT.md` — RLS pattern, tenancy module, package limits, role model

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/src/prisma/prisma.module.ts` — Global PrismaModule for DB access
- `apps/api/src/tenancy/tenancy.module.ts` — Tenancy extension with CLS-based org_id injection (all new tables must use this)
- `apps/api/src/features/features.module.ts` — Global FeaturesModule for feature toggle checks
- `apps/api/src/admin/admin.module.ts` — AdminModule umbrella pattern for super admin endpoints

### Established Patterns
- NestJS modular architecture with @Global() for cross-cutting concerns
- nestjs-cls for request-scoped org context (org_id auto-injected)
- Prisma as ORM with explicit schema models
- Zod safeParse in controllers for request validation
- Docker Compose with remapped ports (5434:5432, 6380:6379) — SRS ports need similar treatment if conflicts exist

### Integration Points
- `apps/api/src/app.module.ts` — New modules (CameraModule, StreamModule, SrsModule) register here
- `docker-compose.yml` — SRS container, MinIO (for future recordings) need to be added
- Package.maxCameras — Must be checked when registering cameras (limit enforcement)
- Organization.packageId → Package.features — Feature toggle checks for camera-related features

</code_context>

<specifics>
## Specific Ideas

- Bulk import dialog: medium-sized modal with editable table showing camera rows, status column, and validation errors inline — user can fix issues before confirming
- Stream profile validation: warn users when settings are incompatible (e.g., codec SRS doesn't support, resolution higher than source) rather than silently failing
- Internal preview vs external API: keep them separate — internal uses session auth + backend proxy, external (Phase 3) uses JWT tokens. Clean separation of concerns
- "Stream Engine" branding in UI abstracts away SRS — future-proofs against engine replacement

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-stream-engine-camera-management*
*Context gathered: 2026-04-09*
