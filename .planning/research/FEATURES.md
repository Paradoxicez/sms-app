# Feature Research: v1.2 Self-Service, Resilience & UI Polish

**Domain:** Surveillance Management SaaS Platform -- v1.2 milestone features
**Researched:** 2026-04-18
**Confidence:** HIGH

## Feature Landscape

This research covers the four feature clusters in v1.2: FFmpeg process resilience, recording playback with timeline, user self-service accounts, and camera maintenance mode. Existing v1.0/v1.1 features are already shipped; this focuses only on what is new.

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Depends On (Existing) |
|---------|--------------|------------|----------------------|
| **FFmpeg auto-reconnect on camera drop** | Cameras lose connection regularly (network, power, reboot). A VMS that doesn't reconnect is unusable. | MEDIUM | BullMQ stream queue (exists), StatusService state machine (exists) |
| **FFmpeg auto-reconnect on SRS restart** | SRS restart kills all RTMP sessions. Platform must detect and re-push all active streams. | MEDIUM | SRS HTTP callbacks `on_unpublish` (exists), stream queue |
| **Health check loop with status notification** | Operators need to know when cameras go down without watching a dashboard. Silent failures erode trust. | MEDIUM | StatusService (exists), NotificationsService (exists), WebhooksService (exists) |
| **User change own password** | Every SaaS app allows this. Users locked out = support burden. | LOW | Better Auth `emailAndPassword` (exists) -- has built-in `changePassword` API |
| **User change own name** | Basic account management. No SaaS ships without this. | LOW | Better Auth `updateUser` API (exists) |
| **Recording playback with video player** | Recordings exist in DataTable but clicking one should play it. Currently only download/delete. | MEDIUM | ManifestService (exists), MinIO segment proxy (exists), hls.js (exists) |
| **Camera status icons (online/offline, recording, maintenance)** | Operators need at-a-glance status. Current single-badge is insufficient for 3 orthogonal states. | LOW | Camera model `status` + `isRecording` fields (exist) |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Depends On (Existing) |
|---------|-------------------|------------|----------------------|
| **Timeline scrubber for recording playback** | Surveillance-grade UX: visual bar showing which hours have footage, click-to-seek. Separates VMS from basic file downloads. | HIGH | ManifestService `getSegmentsForDate` (exists), new UI component needed |
| **Hour-level availability heatmap** | Shows 24-hour bar colored by recording availability. Operators instantly see gaps. Backend already returns hourly data via `getSegmentsForDate`. | MEDIUM | ManifestService (exists) -- frontend only |
| **Camera maintenance mode** | Suppress alerts/notifications when camera is under planned maintenance. Prevents alert fatigue. Competitors (Milestone, Genetec) all have this. | MEDIUM | StatusService state machine needs new `maintenance` state |
| **Plan/usage viewer** | Org admins see current package limits vs actual usage (cameras, storage, bandwidth). Builds trust, reduces "why is X not working" support tickets. | MEDIUM | Package model (exists), storage quota check (exists) |
| **User avatar upload** | Professional touch for multi-user orgs. Not critical but expected in modern SaaS. | LOW | Need MinIO bucket or Better Auth image field |
| **User change email** | Less common but expected. Better Auth supports it with re-verification flow. | LOW | Better Auth `changeEmail` API |
| **FFmpeg output-based health detection** | Parse FFmpeg stderr for frame drops, bitrate anomalies, decode errors. Transition to `degraded` state proactively before full failure. | HIGH | FfmpegService (exists) -- needs stderr parsing |
| **Cross-camera timeline view** | View multiple cameras' recordings on one timeline. Critical for incident investigation. | HIGH | ManifestService (exists) -- major UI effort |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Infinite FFmpeg retry without backoff cap** | "Camera should always reconnect" | CPU exhaustion, log flooding, obscures permanent failures (wrong URL, decommissioned camera). Current 20-attempt cap with exponential backoff is correct. | Keep current cap (20 attempts, 5-min max backoff). Add manual "retry now" button + notification when max retries exhausted. |
| **Real-time frame-by-frame seeking** | "I need exact frame access" | Requires server-side thumbnail generation, massive storage for sprite sheets, complex seek logic. Over-engineering for v1.2. | Segment-level seeking (2-second granularity from HLS segments). Add frame-level in future if demanded. |
| **User self-registration** | "Let anyone sign up" | Multi-tenant SaaS with org isolation -- uncontrolled signup creates orphan users, billing complexity. Admin-creates-user model is correct for B2B. | Keep admin-creates-user. Add invitation link flow (Better Auth has `invitation` plugin). |
| **Editable plan/billing by org admin** | "Let org admins upgrade their own plan" | Billing is explicitly out of scope (PROJECT.md). Adding self-service billing is a massive scope expansion (Stripe, invoicing, proration). | View-only plan/usage. "Contact admin for upgrade" button. |
| **Live transcoding quality selector per viewer** | "Viewers should pick quality" | ABR (Adaptive Bitrate) requires multi-rendition transcoding per camera. CPU cost scales linearly. SRS does not support dynamic multi-rendition. | Single stream profile per camera (already exists). ABR is a v2+ feature requiring dedicated transcoding infrastructure. |
| **Recording playback with picture-in-picture** | "Drag video while browsing" | Browser PiP API is unreliable with HLS.js, especially for VOD manifests with proxy URLs. Edge cases with segment auth. | Standard embedded player is sufficient. PiP can be added later if browsers improve HLS PiP support. |

## Feature Dependencies

```
[FFmpeg SRS restart recovery]
    |-- requires --> [SRS on_unpublish callback handling]
    |-- requires --> [Stream queue re-enqueue logic]
    |-- enhances --> [Health check loop]

[Health check loop]
    |-- requires --> [FFmpeg process state tracking]
    |-- requires --> [StatusService transitions] (exists)
    |-- enhances --> [Camera status icons]

[Camera maintenance mode]
    |-- requires --> [StatusService: add 'maintenance' state]
    |-- requires --> [Notification suppression logic]
    |-- enhances --> [Camera status icons]

[Camera status icons (3-state)]
    |-- requires --> [Camera model: status + isRecording + maintenance flag]
    |-- independent of --> [Recording playback timeline]

[Recording playback page]
    |-- requires --> [ManifestService] (exists)
    |-- requires --> [HLS player component] (exists -- hls-player.tsx)
    |-- requires --> [Segment proxy endpoint] (exists)

[Timeline scrubber]
    |-- requires --> [Recording playback page]
    |-- requires --> [getSegmentsForDate API] (exists)
    |-- enhances --> [Hour-level availability heatmap]

[User self-service (password/name/email)]
    |-- requires --> [Better Auth client API] (exists)
    |-- independent of --> [FFmpeg features]
    |-- independent of --> [Recording features]

[User avatar upload]
    |-- requires --> [MinIO or static file upload endpoint]
    |-- enhances --> [User self-service]

[Plan/usage viewer]
    |-- requires --> [Package model + limits] (exists)
    |-- requires --> [Storage quota API] (exists)
    |-- requires --> [Camera count per org query]
    |-- independent of --> [all other features]
```

### Dependency Notes

- **FFmpeg resilience features** are tightly coupled and should be built together in one phase. SRS restart recovery depends on callback handling; health check loop depends on process state tracking.
- **User self-service** is fully independent -- can be built in parallel with any other feature group.
- **Recording playback and timeline** build on each other sequentially: player first, then timeline scrubber on top.
- **Camera maintenance mode** touches StatusService (shared with FFmpeg resilience). Build after or alongside FFmpeg resilience to avoid state machine conflicts.
- **Plan/usage viewer** is independent and read-only. Lowest risk, can slot into any phase.

## Implementation Details

### FFmpeg Full Resilience

**Current state:** BullMQ job with 20 retries, exponential backoff (1s to 5min cap). FfmpegService tracks running processes in-memory Map. StatusService has state machine: offline -> connecting -> online -> reconnecting/degraded -> offline.

**What is missing for full resilience:**

1. **SRS restart detection:** When SRS restarts, all RTMP connections drop. SRS fires `on_unpublish` for each stream. Backend must catch these callbacks and re-enqueue all affected cameras. Currently, `on_unpublish` likely does not distinguish between intentional stop vs SRS crash.

2. **Health check loop:** A periodic BullMQ repeatable job (every 30-60s) that:
   - Checks all cameras with status `online` -- verifies FFmpeg process is still alive
   - Checks all cameras with status `connecting` or `reconnecting` -- verifies BullMQ job exists
   - Detects orphaned states (camera says `online` but no FFmpeg process) and corrects them
   - Calls SRS `/api/v1/streams` to verify streams are actually being delivered

3. **FFmpeg stderr monitoring:** Parse FFmpeg output for:
   - `Connection refused` / `Connection timed out` -- camera unreachable
   - `frame=0` after N seconds -- stream stalled
   - `dropping frame` / `overread` -- degraded quality
   Transition to appropriate status based on pattern.

4. **Notification on status change:** Already exists via NotificationsService + WebhooksService. Just needs to be wired to new transitions (maintenance mode suppression is the new part).

5. **Graceful shutdown:** On API server shutdown, SIGTERM all FFmpeg processes cleanly. On restart, re-enqueue all cameras that were `online` or `connecting` before shutdown.

**FFmpeg watchdog pattern (industry standard):**
- Monitor process exit code and stderr
- Respawn with backoff on unexpected exit
- Cap retries, then notify and mark offline
- Periodic liveness check independent of process events

### Recording Playback with Timeline

**Current state:** ManifestService generates VOD m3u8 from stored segments. `getSegmentsForDate` returns hourly availability. `getDaysWithRecordings` returns calendar data. Recordings page is DataTable with download/delete. HLS player component exists (`hls-player.tsx`).

**What needs to be built:**

1. **Recording playback page** (`/app/recordings/[id]` or modal):
   - Camera selector (or navigate from camera detail)
   - Date picker (calendar with dots on days that have recordings -- API exists)
   - HLS.js player loading VOD manifest from ManifestService
   - Basic play/pause/seek controls

2. **Timeline scrubber component:**
   - 24-hour horizontal bar divided into segments
   - Colored blocks where recording data exists (from `getSegmentsForDate`)
   - Click on a time block to seek the player to that position
   - Current playback position indicator (needle/cursor)
   - Zoom levels: full day / 6 hours / 1 hour
   - Reference: react-video-timelines-slider -- React component specifically for CCTV timeline scrubbing

3. **Segment-to-time mapping:** The manifest has segments with duration. To seek to a specific time, calculate cumulative duration and use hls.js `player.currentTime = targetSeconds`. hls.js supports accurate seeking on VOD streams (not limited to fragment boundaries).

4. **Gap handling:** When no recording exists for a time range, the timeline shows empty space. Seeking into a gap should snap to the nearest available segment.

### User Self-Service

**Current state:** Better Auth handles auth with `emailAndPassword` plugin. Users are created by org admin. Auth client in frontend uses `createAuthClient` with `organizationClient` and `adminClient` plugins.

**Better Auth built-in capabilities (HIGH confidence -- from auth config):**
- `authClient.updateUser({ name, image })` -- change name and avatar URL
- `authClient.changePassword({ currentPassword, newPassword })` -- change password
- `authClient.changeEmail({ newEmail })` -- change email (may require verification)
- Session is already handled (30-day expiry, daily refresh)

**What needs to be built:**
1. **Account settings page** (`/app/settings/account`):
   - Profile section: name, avatar, email (with change flow)
   - Security section: change password form (current + new + confirm)
   - Session info: last login, active sessions (Better Auth tracks these)

2. **Avatar upload:**
   - Option A: Upload to MinIO, store URL in user record via `updateUser({ image: url })`
   - Option B: Use a simple base64 data URL for small avatars (simpler, no MinIO dependency)
   - Recommendation: Option A (MinIO already in stack, consistent with other file storage)

3. **Plan/usage viewer** (`/app/settings/plan`):
   - Read-only display of current package: name, limits (max cameras, max storage, max bandwidth)
   - Current usage: active cameras count, storage used, bandwidth used (this month)
   - Usage bars with percentage
   - "Contact administrator for upgrade" button (mailto or in-app message)

### Camera Maintenance Mode

**Current state:** Camera status is a string field: `offline`, `connecting`, `online`, `reconnecting`, `degraded`. StatusService validates transitions. Webhooks and notifications fire on status changes.

**What needs to be built:**

1. **Schema change:** Add `maintenance` to valid camera statuses. Add `maintenanceNote` optional field to Camera model for reason text.

2. **StatusService update:** Add valid transitions:
   - Any state -> `maintenance` (operator puts camera in maintenance)
   - `maintenance` -> `offline` (maintenance complete, ready to reconnect)
   - `maintenance` suppresses all notifications and webhooks for this camera

3. **API endpoint:** `PATCH /cameras/:id/maintenance` with `{ enabled: boolean, note?: string }`

4. **UI:** Maintenance toggle button on camera detail page. When in maintenance:
   - Status badge shows wrench icon + "Maintenance" label
   - Stream controls disabled (cannot start stream while in maintenance)
   - Recording controls disabled
   - Alert/notification suppression active
   - Optional: scheduled maintenance with start/end time (v2 feature)

5. **Camera status column (3-icon design):**
   - Icon 1: Connection status (green circle = online, red = offline, yellow = connecting/reconnecting, gray = maintenance)
   - Icon 2: Recording status (red dot = recording, empty = not recording)
   - Icon 3: Maintenance status (wrench icon when in maintenance, hidden otherwise)
   - These are orthogonal indicators, not mutually exclusive

## MVP Definition

### Build in v1.2 (This Milestone)

- [ ] FFmpeg auto-reconnect on camera drop -- enhance existing retry with health check
- [ ] FFmpeg auto-reconnect on SRS restart -- handle `on_unpublish` callback for crash recovery
- [ ] Health check loop -- BullMQ repeatable job, 60s interval
- [ ] Notification on FFmpeg status change -- wire to existing NotificationsService (mostly exists)
- [ ] User change name -- Better Auth `updateUser` + settings page
- [ ] User change password -- Better Auth `changePassword` + settings page
- [ ] Recording playback page with HLS player -- click recording row to play
- [ ] Timeline scrubber with hourly availability -- 24-hour bar, click to seek
- [ ] Plan/usage viewer (read-only) -- package limits vs current usage
- [ ] Camera maintenance mode -- status + notification suppression
- [ ] Camera status column (3-icon) -- online/offline + recording + maintenance
- [ ] DataTable migration for missed pages (Team, Organizations, Cluster Nodes, Platform Audit)
- [ ] Bug fixes (system org user creation, API key copy/delete)
- [ ] Dashboard improvements (org admin + super admin)
- [ ] Map UI improvements (thumbnail popup, pin design)

### Add After v1.2 (v1.3+)

- [ ] User avatar upload -- lower priority, cosmetic
- [ ] User change email -- requires verification flow, edge cases
- [ ] FFmpeg stderr parsing for proactive degradation detection -- complex, needs tuning
- [ ] Timeline zoom levels (6h, 1h views) -- nice UX, not critical
- [ ] Cross-camera timeline view -- major UI effort, incident investigation use case
- [ ] Scheduled maintenance windows (auto-enter/exit maintenance) -- useful for large deployments

### Future Consideration (v2+)

- [ ] Frame-level seeking with thumbnail sprite sheets -- significant infrastructure
- [ ] ABR multi-rendition streaming -- requires transcoding pipeline redesign
- [ ] Recording clips/export (select time range, download as single file) -- needs FFmpeg concat on server
- [ ] User self-registration with invitation links -- scope change for auth model

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Notes |
|---------|------------|---------------------|----------|-------|
| FFmpeg SRS restart recovery | HIGH | MEDIUM | P1 | Core reliability -- silent stream death is unacceptable |
| FFmpeg health check loop | HIGH | MEDIUM | P1 | Catches orphaned states, complements restart recovery |
| Recording playback page | HIGH | MEDIUM | P1 | Recordings without playback is useless |
| Timeline scrubber | HIGH | HIGH | P1 | Defines surveillance-grade UX |
| Camera maintenance mode | MEDIUM | MEDIUM | P1 | Prevents alert fatigue, common VMS feature |
| Camera status icons (3-state) | MEDIUM | LOW | P1 | At-a-glance operational awareness |
| User change name/password | MEDIUM | LOW | P1 | Basic self-service, reduces admin burden |
| DataTable migration (4 pages) | MEDIUM | MEDIUM | P1 | Consistency with v1.1 DataTable system |
| Bug fixes (3 items) | HIGH | LOW | P1 | Broken features must be fixed |
| Dashboard improvements | MEDIUM | MEDIUM | P1 | Remove noise, add actionable data |
| Map UI improvements | LOW | MEDIUM | P2 | Cosmetic, not blocking workflows |
| Plan/usage viewer | MEDIUM | MEDIUM | P2 | Useful but not blocking core workflows |
| User avatar upload | LOW | LOW | P2 | Cosmetic, nice to have |
| User change email | LOW | LOW | P3 | Rarely needed, complex verification flow |
| FFmpeg stderr health parsing | MEDIUM | HIGH | P3 | Needs real-world tuning, can be iterative |
| Cross-camera timeline | HIGH | HIGH | P3 | Major effort, defer to dedicated milestone |

**Priority key:**
- P1: Must have for v1.2 milestone
- P2: Should have, include if time permits
- P3: Defer to later milestone

## Competitor Feature Analysis

| Feature | Frigate NVR | Milestone XProtect | Nx Witness | Our Approach |
|---------|-------------|-------------------|------------|--------------|
| FFmpeg process management | Built-in watchdog, auto-respawn, stderr monitoring, frame drop detection | N/A (native SDK) | N/A (native SDK) | BullMQ-based watchdog with health check loop. Simpler than Frigate (no ML pipeline) but same resilience pattern. |
| Recording timeline | Scrollable timeline bar, motion event markers, seek-to-time | Full timeline scrubber with motion/analytics markers, multi-camera sync | Timeline with bookmarks, cross-camera sync | 24-hour bar with hourly availability, click-to-seek. Motion markers are v2 (no analytics engine yet). |
| Maintenance mode | Not applicable (home NVR) | Camera maintenance status, suppresses alarms, shows in system monitor | "Diagnostics mode" with alert suppression | Status field + notification suppression. No scheduled windows in v1.2. |
| User self-service | Single user (home use) | Active Directory integration, full self-service | LDAP/AD, self-service profile | Better Auth built-in APIs for name/password/email. Simpler than enterprise LDAP but sufficient for SaaS. |
| Plan/usage view | N/A (self-hosted) | License management dashboard | License server dashboard | Read-only package viewer with usage bars. No self-service billing (out of scope). |

## Sources

- [ffmpeg-watchdog GitHub](https://github.com/rrymm/ffmpeg-watchdog) -- FFmpeg process monitor and auto-respawn pattern
- [Frigate NVR camera configuration](https://docs.frigate.video/configuration/camera_specific/) -- Real-world FFmpeg management in surveillance
- [Node.js watchdog timer pattern](https://dev.to/gajus/ensuring-healthy-node-js-program-using-watchdog-timer-4pjd) -- Health check loop design
- [react-video-timelines-slider](https://github.com/prakhars144/react-video-timelines-slider) -- React component for CCTV timeline scrubbing
- [hls.js API documentation](https://github.com/video-dev/hls.js/blob/master/docs/API.md) -- Accurate seeking on VOD streams
- [Mux timeline hover previews](https://docs.mux.com/guides/video/create-timeline-hover-previews) -- Thumbnail preview design pattern
- [Baymard accounts self-service UX](https://baymard.com/blog/current-state-accounts-selfservice) -- Self-service best practices 2025
- [March Networks VMS features](https://marchnetworks.com/intelligent-ip-video-blog/find-video-surveillance-evidence-faster-with-these-5-must-have-vms-features) -- Surveillance timeline UI patterns
- [rtsp-relay npm](https://www.npmjs.com/rtsp-relay) -- RTSP reconnection handling pattern
- Existing codebase: FfmpegService, StreamProcessor, StatusService, ManifestService, Better Auth config

---
*Feature research for: SMS Platform v1.2 -- Self-Service, Resilience & UI Polish*
*Researched: 2026-04-18*
