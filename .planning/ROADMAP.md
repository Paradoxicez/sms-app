# Roadmap: SMS Platform

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 + 999.1 (shipped 2026-04-16) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 UI Overhaul** — Phases 8-13 (shipped 2026-04-18) — [archive](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Self-Service, Resilience & UI Polish** — Phases 14-18 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-7 + 999.1) — SHIPPED 2026-04-16</summary>

- [x] Phase 1: Foundation & Multi-Tenant (6/6 plans)
- [x] Phase 2: Stream Engine & Camera Management (6/6 plans)
- [x] Phase 3: Playback & Security (3/3 plans)
- [x] Phase 4: Developer Experience (5/5 plans)
- [x] Phase 5: Dashboard & Monitoring (6/6 plans)
- [x] Phase 6: SRS Cluster & Scaling (3/3 plans)
- [x] Phase 7: Recordings (5/5 plans)
- [x] Phase 999.1: Role-based Sidebar Navigation (5/5 plans)

</details>

<details>
<summary>✅ v1.1 UI Overhaul (Phases 8-13) — SHIPPED 2026-04-18</summary>

- [x] Phase 8: Foundation Components (2/2 plans)
- [x] Phase 9: Layout & Login (3/3 plans)
- [x] Phase 10: Admin Table Migrations (3/3 plans)
- [x] Phase 11: Camera Management (3/3 plans)
- [x] Phase 12: Recordings (2/2 plans)
- [x] Phase 13: Hierarchy & Map (2/2 plans)

</details>

### v1.2 Self-Service, Resilience & UI Polish

- [x] **Phase 14: Bug Fixes & DataTable Migrations** - Fix broken features and migrate remaining pages to DataTable (completed 2026-04-18)
- [x] **Phase 15: FFmpeg Resilience & Camera Maintenance** - Auto-reconnect, health checks, notifications, and maintenance mode (completed 2026-04-19)
- [x] **Phase 16: User Self-Service** - Account management and plan/usage viewer (completed 2026-04-19)
- [x] **Phase 17: Recording Playback & Timeline** - HLS playback page with timeline scrubber and availability heatmap (completed 2026-04-19)
- [x] **Phase 18: Dashboard & Map Polish** - Dashboard data improvements and map UI enhancements (completed 2026-04-21)

## Phase Details

### Phase 14: Bug Fixes & DataTable Migrations
**Goal**: All known bugs are fixed and remaining admin pages use the unified DataTable component
**Depends on**: Phase 13 (v1.1 complete)
**Requirements**: FIX-01, FIX-02, FIX-03, UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. Super admin can create users for the system organization without errors
  2. Copying an API key returns the actual key value, not the masked version
  3. Deleting an API key removes it successfully and updates the table
  4. Admin org Team page uses DataTable with sorting, filtering, and quick actions
  5. Super admin Organizations, Cluster Nodes, and Platform Audit pages all use DataTable with consistent UX
**Plans**: 3 plans
Plans:
- [x] 14-01-PLAN.md — Fix backend bugs (system org user creation RLS, API key hard delete) and API key copy UX
- [x] 14-02-PLAN.md — Migrate Team and Organizations pages to DataTable
- [x] 14-03-PLAN.md — Migrate Cluster Nodes and Platform Audit pages to DataTable
**UI hint**: yes

### Phase 15: FFmpeg Resilience & Camera Maintenance
**Goal**: Camera streams recover automatically from failures and operators can put cameras in maintenance mode
**Depends on**: Phase 14
**Requirements**: RESIL-01, RESIL-02, RESIL-03, RESIL-04, CAM-01, CAM-02, CAM-03
**Success Criteria** (what must be TRUE):
  1. When SRS container restarts, all previously-active FFmpeg streams reconnect automatically without manual intervention
  2. Health check loop detects and recovers dead FFmpeg processes within 60 seconds
  3. User receives in-app notification and webhook fires when a camera status changes (online/offline/degraded)
  4. FFmpeg processes shut down gracefully on server restart and re-enqueue on boot -- no orphaned processes
  5. User can toggle a camera into maintenance mode, which suppresses notifications/webhooks and shows a maintenance icon in the camera table alongside online/offline and recording status icons
**Plans**: 4 plans (Wave 1: 1 plan, Wave 2: 2 plans parallel, Wave 3: 1 plan)
Plans:
- [x] 15-01-PLAN.md — Data + status suppression core: Camera schema maintenance columns + StatusService maintenance gate + 30s BullMQ debounce (RESIL-03, CAM-02)
- [x] 15-02-PLAN.md — FFmpeg resilience services: camera-health tick + SRS-restart detection + boot recovery + graceful shutdown + jobId unification (RESIL-01/02/03/04)
- [x] 15-03-PLAN.md — Maintenance API + audit trail: POST/DELETE /cameras/:id/maintenance with org scoping and interceptor-audited writes (CAM-01, CAM-02)
- [x] 15-04-PLAN.md — Camera table UI: composite 3-icon Status column + maintenance row-action + Thai confirmation dialogs (CAM-03)
**UI hint**: yes

### Phase 16: User Self-Service
**Goal**: Users can manage their own account and view their organization's plan and usage
**Depends on**: Phase 14
**Requirements**: USER-01, USER-02, USER-03
**Success Criteria** (what must be TRUE):
  1. User can change their display name and password from an Account settings page
  2. User can upload and change their avatar image
  3. User can view their current plan name, usage counts against limits (cameras, storage, API calls), on a read-only Plan page
**Plans**: 3 plans (Wave 0 inside Plan 01/02, Wave 1 backend + tests, Wave 3 tenant UI, Wave 4 admin UI)
Plans:
- [x] 16-01-PLAN.md — Backend: sharp install, avatar fixtures, stub tests, MinIO avatars bucket, POST/DELETE /api/users/me/avatar, GET /api/organizations/:orgId/plan-usage, AccountModule (USER-01 verification, USER-02 backend, USER-03 backend)
- [x] 16-02-PLAN.md — Frontend shared + tenant: zxcvbn-ts install, Account composites (Profile, Security, Plan, PasswordStrengthBar, UsageProgressRow, FeatureFlagRow), sidebar-footer "Account settings" entry in both portals, /app/account page with all 3 sections (USER-01/02/03 tenant UI)
- [x] 16-03-PLAN.md — Frontend super admin: /admin/account page (Profile + Security only, no Plan & Usage per D-02) reusing composites from 16-02 (USER-01/02 super admin UI)
**UI hint**: yes

### Phase 17: Recording Playback & Timeline
**Goal**: Users can play back recorded footage with a visual timeline for navigation
**Depends on**: Phase 14
**Requirements**: REC-01, REC-02, REC-03
**Success Criteria** (what must be TRUE):
  1. User can click a recording and play it back via an HLS player on a dedicated playback page
  2. Playback page has a 24-hour timeline scrubber bar that user can click to seek to any point in time
  3. Timeline displays an availability heatmap showing which hours have recorded footage and which do not
**Plans**: 5 plans (1 Wave 0, 2 in Wave 1, 1 in Wave 2, 1 in Wave 3)
Plans:
- [x] 17-00-PLAN.md — Wave 0 test scaffolds (it.todo stubs for REC-01/02/03 + FOUND-01f)
- [x] 17-01-PLAN.md — DataTable onRowClick + cell stopPropagation + recordings-data-table row navigation (D-02)
- [x] 17-02-PLAN.md — API getRecording: camera include + cross-org 404 (T-17-V4); useRecording hook with 3-state error
- [x] 17-03-PLAN.md — Move HlsPlayer + TimelineBar to @/components/recordings/ (D-13); REC-03 heatmap tests GREEN
- [x] 17-04-PLAN.md — /app/recordings/[id] playback page + header + bottom list; REC-01/02 tests GREEN
**UI hint**: yes

### Phase 18: Dashboard & Map Polish
**Goal**: Dashboard shows relevant data for each role and map markers/popups look polished
**Depends on**: Phase 14
**Requirements**: UI-05, UI-06
**Success Criteria** (what must be TRUE):
  1. Org admin dashboard shows data relevant to their organization -- unnecessary widgets removed, missing data added
  2. Super admin dashboard shows platform-wide metrics appropriate for system operations
  3. Map camera markers have improved pin design and thumbnail popups display correctly with camera preview
**Plans**: 7 plans (Wave 0: test scaffolds · Wave 1: backend endpoints · Wave 2: tenant dashboard + map marker + super admin widgets parallel · Wave 3: map popup + super admin page composition)
Plans:
- [x] 18-00-PLAN.md — Wave 0 test scaffolds: 14 test files + shared camera fixtures, 79 it.todo stubs for UI-05/UI-06 + all T-18-XX threats
- [x] 18-01-PLAN.md — Backend admin endpoints + DashboardService enrichment: 7 new /api/admin/dashboard/* methods + Phase 15 field enrichment on tenant stats/cameras (UI-05 backend)
- [x] 18-02-PLAN.md — Tenant dashboard refactor: remove SystemMetrics + CameraStatusTable, add 6 stat cards + IssuesPanel reward signal (UI-05 tenant D-01..D-04)
- [x] 18-03-PLAN.md — Map marker refactor: teardrop SVG pin + recording/maintenance badges + escapeHtml XSS mitigation + cluster worst-status bubble + MapCamera type extension (UI-06 marker D-13..D-16, T-18-XSS-MARKER)
- [x] 18-04-PLAN.md — Map popup refactor: 16:9 preview + status overlay + badges + restructured actions + Thai-EN maintenance dialog + PreviewVideo memoization regression guard (UI-06 popup D-17..D-22, T-18-MEMO-REGRESSION)
- [x] 18-05-PLAN.md — Super admin widgets + platform hook: PlatformIssuesPanel + ClusterNodesPanel + StorageForecastCard + RecentAuditHighlights + shadcn toggle-group install (UI-05 admin D-08, D-09, D-10, D-11)
- [x] 18-06-PLAN.md — Super admin page composition + OrgHealthDataTable: 7 stat cards + vertical priority stack + DataTable migration of Organization Summary (UI-05 admin D-05, D-06, D-07, D-12)
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 14 -> 15 -> 16 -> 17 -> 18
Note: Phases 16, 17, 18 can execute in parallel after Phase 14 (independent of each other).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Multi-Tenant | v1.0 | 6/6 | Complete | 2026-04-11 |
| 2. Stream Engine & Camera Management | v1.0 | 6/6 | Complete | 2026-04-12 |
| 3. Playback & Security | v1.0 | 3/3 | Complete | 2026-04-12 |
| 4. Developer Experience | v1.0 | 5/5 | Complete | 2026-04-13 |
| 5. Dashboard & Monitoring | v1.0 | 6/6 | Complete | 2026-04-13 |
| 6. SRS Cluster & Scaling | v1.0 | 3/3 | Complete | 2026-04-14 |
| 7. Recordings | v1.0 | 5/5 | Complete | 2026-04-14 |
| 999.1. Role-based Sidebar Navigation | v1.0 | 5/5 | Complete | 2026-04-15 |
| 8. Foundation Components | v1.1 | 2/2 | Complete | 2026-04-17 |
| 9. Layout & Login | v1.1 | 3/3 | Complete | 2026-04-17 |
| 10. Admin Table Migrations | v1.1 | 3/3 | Complete | 2026-04-17 |
| 11. Camera Management | v1.1 | 3/3 | Complete | 2026-04-17 |
| 12. Recordings | v1.1 | 2/2 | Complete | 2026-04-17 |
| 13. Hierarchy & Map | v1.1 | 2/2 | Complete | 2026-04-17 |
| 14. Bug Fixes & DataTable Migrations | v1.2 | 3/3 | Complete    | 2026-04-18 |
| 15. FFmpeg Resilience & Camera Maintenance | v1.2 | 4/4 | Complete    | 2026-04-19 |
| 16. User Self-Service | v1.2 | 3/3 | Complete    | 2026-04-19 |
| 17. Recording Playback & Timeline | v1.2 | 5/5 | Complete    | 2026-04-21 |
| 18. Dashboard & Map Polish | v1.2 | 7/7 | Complete    | 2026-04-22 |

### Phase 19: Camera input validation and multi-protocol support (RTMP/RTMPS)

**Goal:** Camera `streamUrl` is trustworthy end-to-end — DTO rejects non-allowlisted protocols (T-19-01), FFmpeg/ffprobe branch on protocol (D-13), every Camera has an authoritative `codecInfo` tagged-union (D-07) populated via async probe on create (D-01) + on-publish refresh (D-02), duplicate URLs are detected at 3 layers (D-10 client within-file + server pre-check + Prisma `@@unique`), the Camera table renders 4 codec states (pending / failed+retry / success / no-data) per D-05, and RTMP/RTMPS/SRT URLs work end-to-end via the existing FFmpeg wrapper (no zero-transcode direct-ingest path — deferred).
**Depends on:** Phase 18
**Requirements**: (no new REQ-IDs — closes 5 audit gaps via decisions D-01..D-18)
**Plans:** 9/9 plans complete

Plans:
- [x] 19-00-PLAN.md — Wave 0 test scaffolds (10 test files, shared CodecInfo type, duplicate fixtures — 80+ it.todo stubs)
- [x] 19-01-PLAN.md — DTO 4-protocol allowlist for create/update/bulk-import + D-17 bulk-import `.url()` parity (D-12, D-17, T-19-01)
- [x] 19-02-PLAN.md — Protocol-branch `-rtsp_transport tcp` in ffprobe + ffmpeg-command builder (D-13)
- [x] 19-03-PLAN.md — Backend probe wiring: extended StreamProbeProcessor (pending→success|failed, normalizeError, guard, srs-api source), createCamera enqueue, SrsApiService.getStream, on-publish refresh, POST /cameras/:id/probe retry (D-01, D-02, D-04, D-07)
- [x] 19-04-PLAN.md — [BLOCKING] Prisma `@@unique([orgId, streamUrl])` + dedup SQL migration (keep-oldest) + db:push script update + DuplicateStreamUrlError + P2002 translation + bulkImport pre-insert dedup (D-08, D-09, D-10, D-11)
- [x] 19-05-PLAN.md — UI: normalizeCodecInfo legacy reader + CodecStatusCell 4-state component + useProbeRetry hook + cameras-columns wire-up (D-05, D-06, D-07)
- [x] 19-06-PLAN.md — UI: camera-form-dialog live prefix validation + shared validateStreamUrl helper + 409 DuplicateStreamUrl error surfacing (D-11 consumption, D-15)
- [x] 19-07-PLAN.md — UI: bulk-import-dialog validateRow + annotateDuplicates + 3rd Copy amber status icon + 3rd counter + post-import toast cascade (D-08, D-09, D-10a, D-16)
- [x] 19-08-PLAN.md — Mechanical rename `rtspUrl → inputUrl` across stream.processor / streams.service / job-data.helper + D-03 audit document (D-03, D-14)
**UI hint**: yes

### Phase 19.1: RTMP push ingest with platform-generated stream keys (INSERTED)

**Goal:** Cameras / NVRs / encoders publish RTMP directly to SRS on port 1935 using a platform-generated stream key. Developer registers a push camera, copies the generated `rtmp://{host}:1935/push/<key>` URL, pastes it into their encoder, and playback works end-to-end without FFmpeg pulling from an external source. SRS `forward` backend hook remaps `push/<key>` → `live/{orgId}/{cameraId}` so the playback URL contract is preserved. Stream Profile still drives the transcode vs passthrough decision (Phase 19 model), and a per-camera codec-mismatch consent flow handles Passthrough + non-H.264/AAC cases. Stream-key generation, rotation, masking, audit, delete-while-publishing, and maintenance-mode semantics all covered.
**Depends on:** Phase 19
**Requirements**: (no new REQ-IDs — extends Phase 19 camera-ingest pipeline via 26 locked decisions D-01..D-26)
**Plans:** 8/8 plans complete

Plans:
- [x] 19.1-00-PLAN.md — Wave 0 test scaffolds: nanoid@3.3.11 install + idempotent migration SQL + shared push-camera fixture stub + 14 test files with it.todo stubs covering all 26 decisions
- [x] 19.1-01-PLAN.md — [BLOCKING] Prisma schema extension (ingestMode + streamKey + firstPublishAt + @@unique([streamKey])) + db:push + stream-key.util (generateStreamKey/maskStreamKey/streamKeyPrefix/buildPushUrl) + DuplicateStreamKeyError + CodecInfo 'mismatch' status + DTO per-mode refine + OnForwardDto + SrsApiService.kickPublisher/findPublisherClientId (D-02, D-04, D-06, D-07, D-12, D-13, D-16, D-18, D-20, D-22)
- [x] 19.1-02-PLAN.md — SRS callback push branch + on_forward endpoint + srs.conf forward directive + 4 push audit events (D-15, D-18, D-21, D-23, D-24)
- [x] 19.1-03-PLAN.md — CamerasService push (createCamera/bulkImport/deleteCamera) + rotateStreamKey + rotate-key controller endpoint + serializeCamera util + push fixture impl (D-01, D-05, D-07, D-12, D-14, D-19, D-20, D-21, D-22)
- [x] 19.1-04-PLAN.md — StreamsService push routing (loopback for transcode, no-op for passthrough) + StreamProbeProcessor codec-mismatch detection + kick + audit (D-16, D-17, D-21)
- [x] 19.1-05-PLAN.md — Frontend foundation: codec-info mismatch extension + CodecStatusCell 5th state + stream-key-mask util + IngestModeToggle + CreatedUrlReveal composites (D-05, D-07, D-08, D-09, D-16, D-20)
- [x] 19.1-06-PLAN.md — camera-form-dialog push mode (IngestModeToggle + hint + CreatedUrlReveal post-save) + bulk-import-dialog (ingestMode column + per-row validation + PushUrlsDownloadButton) (D-08, D-09, D-10, D-11, D-12, D-13, D-14)
- [x] 19.1-07-PLAN.md — view-stream-sheet push composites: PushUrlSection + CodecMismatchBanner + WaitingForFirstPublish + RotateKeyDialog (D-07, D-11, D-16, D-19, D-20, D-26)
**UI hint**: yes

### Phase 20: Cameras UX: bulk actions, maintenance toggle, copy ID, expressive status and stream controls

**Goal:** Polish the tenant Cameras page with 5 UX improvements: (1) multi-select + bulk toolbar for Start Stream / Start Recording / Maintenance / Delete; (2) asymmetric row-menu maintenance (Enter opens reason dialog, Exit runs directly); (3) Copy Camera ID + Copy cURL example row-menu items; (4) monospace ID chip + copy affordance in View Stream sheet header; (5) expressive LIVE / REC / MAINT / OFFLINE status pills replacing the three-icon Status column plus expandable pill buttons for Start Stream / Start Record in the sheet. Client-side fan-out via `Promise.allSettled` with pre-filter (Research A6/A7) against existing per-camera endpoints; one thin backend change adds optional `{ reason?: string }` body to `POST /api/cameras/:id/maintenance` so audit trail captures the reason.
**Depends on:** Phase 19.1
**Requirements**: (no new REQ-IDs — implements 22 locked decisions D-01..D-22 from CONTEXT.md)
**Plans:** 4/4 plans complete

Plans:
- [x] 20-01-PLAN.md — Wave 0 scaffolding: MaintenanceReasonDialog component (single + bulk modes) + backend `{ reason?: string }` DTO + controller/service extension + AuditInterceptor verification + 7 test scaffold files with 100+ it.todo stubs covering D-01..D-22 (D-02 A2)
- [x] 20-02-PLAN.md — StatusPills component (byte-for-byte token reuse from camera-popup.tsx:201-214) + Status cell rewrite + row action menu reorder to 10 items + Copy Camera ID + Copy cURL example with literal `<YOUR_API_KEY>` placeholder (D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16)
- [x] 20-03-PLAN.md — Bulk flow end-to-end: `bulk-actions.ts` lib (chunkedAllSettled + bulkAction + VERB_COPY + 4 pre-filter helpers for A6/A7) + BulkToolbar sticky component + select column + `rowSelection` wiring into hand-rolled useReactTable (NO shared DataTable migration) + MaintenanceReasonDialog single+bulk + Delete AlertDialog + partial-failure AlertTriangle error badges (D-01, D-02, D-03, D-04, D-05, D-06a, D-06b)
- [x] 20-04-PLAN.md — ViewStreamSheet header 3rd line with ID chip + copy icon + full-UUID tooltip; Start Stream / Start Record icon-squares → expandable 160px pill buttons with aria-pressed + motion-reduce pulse pair (D-17, D-18, D-19, D-20, D-21)
**UI hint**: yes

### Phase 21: Hot-reload Stream Profile changes to running cameras

**Goal:** When a `StreamProfile` is edited (PATCH `/stream-profiles/:id`) or a `Camera.streamProfileId` is changed (PATCH `/cameras/:id`) while affected cameras are live, the running FFmpeg processes are automatically killed and respawned with the new settings within 30 seconds — eliminating the audit-found gap where stale profile values persist on running streams until manual restart or 60s health-check failure. DELETE on a stream profile still in use returns HTTP 409 with the camera list. Edit dialogs surface info-level toasts when restarts fire. New audit action `camera.profile_hot_reload` records each downstream restart per affected camera.
**Depends on:** Phase 20
**Requirements**: (no new REQ-IDs — closes audit-found gap discovered 2026-04-25; implements 11 locked decisions D-01..D-11 from CONTEXT.md)
**Plans:** 6/6 plans complete

Plans:
- [x] 21-01-PLAN.md — Wave 0 test scaffolds: 8 backend + 1 frontend test files with it.todo stubs covering D-01..D-11; fill 21-VALIDATION.md per-task map
- [x] 21-02-PLAN.md — Profile-side trigger (D-01, D-07): profile-fingerprint.util.ts (SHA-256 over 7 FFmpeg-affecting fields) + StreamsService.enqueueProfileRestart orchestration + StreamProfileService.update fingerprint diff + audit-then-enqueue ordering + PATCH response.affectedCameras
- [x] 21-03-PLAN.md — Camera-side trigger (D-02): CamerasService.updateCamera profile-reassign detection + single-camera enqueueProfileRestart variant + PATCH response.restartTriggered
- [x] 21-04-PLAN.md — Restart execution (D-03/D-04/D-05/D-08/D-09): FfmpegService.gracefulRestart helper (5s grace per RESEARCH §6) + StreamProcessor branch on job.name='restart' (gracefulRestart → transition('reconnecting') → spawn) + remove-then-add dedup + jittered delay + fallthrough to existing exponential backoff
- [x] 21-05-PLAN.md — DELETE protection (D-10) + UI toasts (D-06): service-layer 409 with `usedBy[]` (Option B per RESEARCH §4 — no schema change) + ProfileFormDialog toast variant + CameraFormDialog toast on restartTriggered + tenant-stream-profiles-page 409 handler with camera list rendering
- [x] 21-06-PLAN.md — Verification gate: full vitest suites (apps/api + apps/web) + apps/web build + 21-VALIDATION.md per-task map flip to ✅ green + manual UAT (D-08 recording gap, D-11 webhook coalescing, Activity tab visibility, T-21-01/02/03 threats) + STATE.md finalize
**UI hint**: yes

### Phase 21.1: Active-job collision fix for hot-reload restart (gap closure)

**Goal:** Make profile changes actually restart cameras whose BullMQ `start` job is currently in active+locked state. Phase 21 left audit-log-correct but runtime-broken behavior in this case: `enqueueProfileRestart` calls `existingJob.remove()` which throws on a locked active job (silently caught), then `queue.add()` dedupes by jobId and returns the existing job — so the new 'restart' is silently lost. The new profile only takes effect when FFmpeg dies for some other reason. Post-fix, profile edits must produce an FFmpeg PID change within 30s for the common case (running camera with live FFmpeg from boot recovery).
**Depends on:** Phase 21
**Requirements**: (no new REQ-IDs — closes runtime gap documented in 21-06-SUMMARY.md DEFECT section + 21-VALIDATION.md "Manual UAT" section, both written 2026-04-25)
**Plans:** 3/3 plans complete

Plans:
- [x] 21.1-01-PLAN.md — Publisher + module wiring: REDIS_CLIENT provider in StreamsModule + enqueueProfileRestart branch on existingJob.isActive() → publish to camera:{id}:restart on active path, fall through to remove-then-add on every other path (D-12 publisher, D-13 strict scope)
- [x] 21.1-02-PLAN.md — Subscriber + 3 in-process mitigations: StreamProcessor.process() opens ioredis.duplicate() subscriber, calls gracefulRestart on signal with restartingCameras Set dedup (M3), runFingerprintSafetyNet on subscribe-ready compares DB vs job profile (M2), unsubscribe+quit in finally (M1)
- [x] 21.1-03-PLAN.md — Hybrid test layer (D-14 / M4): 3 unit test files (publisher branch · subscriber + dedup · safety net) using ioredis-mock + 1 real-Redis integration test reproducing BKR06 11-PATCH UAT scenario from 21-VALIDATION.md
**UI hint**: no
</content>
