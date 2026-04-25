---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Self-Service, Resilience & UI Polish
status: executing
stopped_at: Phase 21.1 context gathered
last_updated: "2026-04-25T14:12:33.238Z"
last_activity: 2026-04-25
progress:
  total_phases: 10
  completed_phases: 10
  total_plans: 52
  completed_plans: 52
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-18)

**Core value:** Developers can get a secure HLS playback URL for any registered camera via a single API call, and embed it on their website immediately.
**Current focus:** Phase 21.1 — Active-job collision fix for hot-reload restart (gap closure)

## Current Position

Phase: 21.1
Plan: Not started
Status: Executing Phase 21.1
Last activity: 2026-04-26 - Completed quick task 260426-2vj: Developer Portal Overview Step 2 → static template

Progress: [░░░░░░░░░░] 0% (v1.2: 0/5 phases)

## Performance Metrics

**Velocity:**

- Total plans completed: 120 (v1.0: 53, v1.1: 15)
- Average duration: ~5 min/plan
- Total execution time: ~3.2 hours

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 MVP | 8 | 53 | Complete |
| v1.1 UI Overhaul | 6 | 15 | Complete |
| v1.2 Self-Service | 5 | TBD | In progress |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.2 Roadmap]: Bug fixes + DataTable migrations first (Phase 14) to unblock broken features
- [v1.2 Roadmap]: FFmpeg resilience + maintenance mode grouped in Phase 15 (both touch StatusService)
- [v1.2 Roadmap]: Phases 16/17/18 can run in parallel after Phase 14 completes

### Roadmap Evolution

- Phase 15.1 inserted after Phase 15: Tenancy RLS bypass + StreamProcessor transition fixes (URGENT)
- Phase 19 added: Camera input validation and multi-protocol support (RTMP/RTMPS) — closes 5 gaps from audit `.planning/debug/camera-stream-validation-audit.md` (codec/resolution populate, Add Camera format validation, bulk import dedup, RTMP unblock, Prisma unique constraint)
- Phase 19.1 inserted after Phase 19: RTMP push ingest with platform-generated stream keys (URGENT)
- Phase 20 added: Cameras UX — bulk actions, maintenance toggle in action menu, copy Camera ID (menu + view-stream header), expressive LIVE/REC status icons, active-state feedback on Start Stream/Record buttons
- Phase 21 added: Hot-reload Stream Profile changes to running cameras — closes audit gap where StreamsService.startStream reads profile only at job-enqueue, leaving live FFmpeg processes on stale settings until manual restart or 60s health-check failure

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260419-h84 | Fix tenancy RLS superuser_bypass + StreamProcessor reconnecting→connecting transition (15.1 gap closure) | 2026-04-19 | 5f0ffd9 | | [260419-h84-fix-tenancy-rls-superuser-bypass-streamp](./quick/260419-h84-fix-tenancy-rls-superuser-bypass-streamp/) |
| 260420-nmu | Fix StatusService RLS regression — use SystemPrismaService instead of TENANCY_CLIENT (phase 15 commit 8ea20f7 missed this file) | 2026-04-20 | 49adac6 | | [260420-nmu-fix-statusservice-rls-regression-use-sys](./quick/260420-nmu-fix-statusservice-rls-regression-use-sys/) |
| 260420-oid | Audit TENANCY_CLIENT misuse — fix all 6 broken services (Playback, Webhooks, WebhookDeliveryProcessor, Notifications, Recordings, Settings) | 2026-04-20 | e87016c | | [260420-oid-audit-tenancy-client-misuse-fix-all-serv](./quick/260420-oid-audit-tenancy-client-misuse-fix-all-serv/) |
| 260421-dlg | Isolate vitest from dev DB — sms_platform_test database + triple safety guards prevent dev-DB wipe | 2026-04-21 | 35cf4fc | | [260421-dlg-isolate-vitest-from-dev-db-use-test-data](./quick/260421-dlg-isolate-vitest-from-dev-db-use-test-data/) |
| 260421-f0c | Fix StreamProcessor concurrency 1→50 + add stream-probe processor for bulk-import codec detection | 2026-04-21 | 1800a7d+ff1cdc1 | | [260421-f0c-fix-streamprocessor-concurrency-1-add-st](./quick/260421-f0c-fix-streamprocessor-concurrency-1-add-st/) |
| 260421-g9o | fix StreamProcessor undefined cameraId bug - add defensive guard | 2026-04-21 | 5cf6343 | | [260421-g9o-fix-streamprocessor-undefined-cameraid-b](./quick/260421-g9o-fix-streamprocessor-undefined-cameraid-b/) |
| 260422-cnv | Align Team page empty state with API Keys table pattern | 2026-04-22 | a4f2eb0 | | [260422-cnv-align-team-page-empty-state-with-api-key](./quick/260422-cnv-align-team-page-empty-state-with-api-key/) |
| 260422-ds9 | Fix RLS bug pattern across codebase (Option A) — OrgAdminGuard, AdminDashboardService, bulkImport, test harness, seeds | 2026-04-22 | a1e8348 | Verified | [260422-ds9-fix-rls-bug-pattern-across-codebase-opti](./quick/260422-ds9-fix-rls-bug-pattern-across-codebase-opti/) |
| 260425-uw0 | Add Stream Profile column (after Resolution) to Cameras table — name + Transcode/Passthrough badge using same color tokens as Stream Profiles page | 2026-04-25 | 5ca5168 | | [260425-uw0-add-stream-profile-column-after-resoluti](./quick/260425-uw0-add-stream-profile-column-after-resoluti/) |
| 260425-vrl | Sync camera card-view status badge with table-view StatusPills style — extracted shared CameraStatusPill primitive | 2026-04-25 | c5187a7 | | [260425-vrl-sync-camera-card-view-status-badge-with-](./quick/260425-vrl-sync-camera-card-view-status-badge-with-/) |
| 260425-w7v | Add camera snapshot thumbnails (FFmpeg + MinIO snapshots bucket) for card view — refresh on online transition + page mount | 2026-04-25 | f32c746 | | [260425-w7v-add-camera-snapshot-thumbnails-ffmpeg-mi](./quick/260425-w7v-add-camera-snapshot-thumbnails-ffmpeg-mi/) |
| 260425-wy8 | Switch snapshot trigger from on_publish to on_hls (fix 404 race) — fires only on first segment per session (seq_no===0) | 2026-04-25 | a4c517d | | [260425-wy8-switch-snapshot-trigger-from-on-publish-](./quick/260425-wy8-switch-snapshot-trigger-from-on-publish-/) |
| 260426-06n | Snapshot auth via PlaybackService token + relax on_hls guard for missing snapshots — fixes hls_ctx 403 + catches up streams already publishing before deploy | 2026-04-26 | 2f46722 | | [260426-06n-snapshot-auth-via-playbackservice-token-](./quick/260426-06n-snapshot-auth-via-playbackservice-token-/) |
| 260426-07r | Backend default-profile semantic alignment — null streamProfileId fallback to org isDefault profile + 409 block on deleting default while other profiles exist | 2026-04-26 | 813be0a | | [260426-07r-backend-default-profile-semantic-alignme](./quick/260426-07r-backend-default-profile-semantic-alignme/) |
| 260426-0m4 | Add PlaybackService.createSystemSession for background tasks (snapshot RLS fix) — fixes "Camera not found" cascade from 260426-06n; createSession unchanged for HTTP callers | 2026-04-26 | 3898415 | | [260426-0m4-add-playbackservice-createsystemsession-](./quick/260426-0m4-add-playbackservice-createsystemsession-/) |
| 260426-0nc | Frontend camera-form default-profile UX — remove hardcoded Default option, pre-select isDefault on new, validate required, empty-state CTA when org has 0 profiles, edit-mode warning for legacy null cameras | 2026-04-26 | 68e2a71 | | [260426-0nc-frontend-camera-form-default-profile-ux-](./quick/260426-0nc-frontend-camera-form-default-profile-ux-/) |
| 260426-28m | PoliciesService.resolve no-CLS-context bypass for background callers — closes 4th cascading snapshot bug (createSystemSession → policiesService.resolve → tenantPrisma RLS denial) | 2026-04-26 | a61e192 | | [260426-28m-policiesservice-resolve-no-cls-context-b](./quick/260426-28m-policiesservice-resolve-no-cls-context-b/) |
| 260426-29p | Stream Profiles page default indicator (Star icon + tooltip) + backend auto-mark first profile per org as isDefault=true | 2026-04-26 | 3c69577 | | [260426-29p-stream-profiles-page-default-indicator-s](./quick/260426-29p-stream-profiles-page-default-indicator-s/) |
| 260426-2vj | Developer Portal Overview Step 2 → static template (drop dynamic key/camera hints, use CAMERA_ID + sk_live_YOUR_API_KEY placeholders) | 2026-04-26 | 59561bc | | [260426-2vj-developer-portal-overview-step-2-remove-](./quick/260426-2vj-developer-portal-overview-step-2-remove-/) |

## Session Continuity

Last session: 2026-04-25T12:41:08.334Z
Stopped at: Phase 21.1 context gathered
Resume file: .planning/phases/21.1-active-job-collision-fix-for-hot-reload-restart-gap-closure/21.1-CONTEXT.md
