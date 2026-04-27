---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Production Ready
status: executing
stopped_at: Phase 23 context gathered
last_updated: "2026-04-27T07:55:36.507Z"
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 6
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-27)

**Core value:** Developers can get a secure HLS playback URL for any registered camera via a single API call, and embed it on their website immediately.
**Current focus:** Phase 23 — Tech Debt Cleanup + Phase 0 Prerequisites (DEBT-01..05). Run `/gsd-plan-phase 23` to begin.

## Current Position

Milestone: v1.3 — Production Ready
Phase: 23 — Tech Debt Cleanup + Phase 0 Prerequisites
Status: Ready to execute
Plan: — (none yet)

Progress: [░░░░░░░░░░] 0% (v1.3: 0/8 phases, 0/0 plans)

## Performance Metrics

**Velocity:**

- Total plans completed across all milestones: 196 (v1.0: 53, v1.1: 15, v1.2: 64, plus 8 inserted/quick)
- v1.2 timeline: 2026-04-18 → 2026-04-27 (10 days from Phase 14 to milestone close)
- v1.2 commits: ~600+ across feat/fix/docs/refactor/chore

**By Milestone:**

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 MVP | 8 | 53 | Complete | 2026-04-16 |
| v1.1 UI Overhaul | 6 | 15 | Complete | 2026-04-18 |
| v1.2 Self-Service, Resilience & UI Polish | 11 | 64 | Complete | 2026-04-27 |
| v1.3 Production Ready | 8 (23-30) | TBD | Planning Complete | — |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.3 Roadmap]: Phase 23 owns ALL DEBT-XX (Phase 0 prerequisite — non-negotiable before any deploy work)
- [v1.3 Roadmap]: Phase 24 has NO REQ-IDs — preventive structural work (deploy/ folder + Dockerfile rename + root .dockerignore) to enable Phases 25-30 without contaminating dev
- [v1.3 Roadmap]: Phase 25 → 26 → 27 strict serial dependency (compose references images, Caddy references network)
- [v1.3 Roadmap]: Phase 28 (CI/CD) depends on Phase 25 only — can run in parallel with Phases 26/27 in calendar time
- [v1.3 Roadmap]: Phase 30 is the v1.3 GA gate — clean VM smoke test must pass before milestone close
- [v1.3 Research]: Caddy 2.11.x over Traefik (no Docker socket exposure)
- [v1.3 Research]: node:22-bookworm-slim runtime base (FFmpeg + sharp + bash healthchecks need it; Alpine/distroless rejected)
- [v1.3 Research]: Dedicated sms-migrate init service over api entrypoint (eliminates race conditions at zero cost)
- [v1.3 Research]: Single-arch linux/amd64 only (multi-arch deferred to DEPLOY-32 v1.3.x)
- [v1.3 Research]: GHCR public registry, .env file (chmod 600) for secrets — NOT Docker secrets, NOT Vault

### Roadmap Evolution

- v1.3 milestone scoped 2026-04-27 — 8 phases (23-30) covering 5 DEBT + 26 DEPLOY requirements
- 4-researcher consensus (STACK + FEATURES + ARCHITECTURE + PITFALLS) converged on phase order; roadmap follows research SUMMARY.md verbatim
- Phase 23 absorbed Phase 0 prerequisites identified by ARCHITECTURE + PITFALLS researchers (raw SQL → Prisma migration history is the most acute risk; without it `migrate deploy` against fresh prod DB silently breaks RLS multi-tenancy)
- /health endpoint already exists in api (`apps/api/src/admin/admin.controller.ts:14` + audit interceptor skip) — confirmed before scoping Phase 23, so /health work removed from Phase 23 scope

### Pending Todos

None yet (Phase 23 plans not authored — run `/gsd-plan-phase 23` to begin).

### Blockers/Concerns

- None blocking; all open questions from research SUMMARY.md were resolved in REQUIREMENTS.md scoping (MinIO post-archive: pin last community tag; Cosign deferred to v1.3.x; bin/sms scope: backup/restore/update/create-admin only).

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
| 260426-l5a | Activity tab UX polish — specific action labels (deriveActionLabel) + hideResourceColumn prop for single-camera scope | 2026-04-26 | 00fc95e | | [260426-l5a-activity-tab-ux-polish-specific-action-l](./quick/260426-l5a-activity-tab-ux-polish-specific-action-l/) |
| 260426-mth | Fix map camera-pin click collapses to group regression — useMemo position reference in camera-marker.tsx (regression from d570449) | 2026-04-26 | ffa2a7b | | [260426-mth-fix-map-camera-pin-click-collapses-to-gr](./quick/260426-mth-fix-map-camera-pin-click-collapses-to-gr/) |
| 260426-lg5 | Inline duplicate detection (Name + Stream URL) in Add Camera + Bulk Import — DB `@@unique([orgId, name])` + cell-level amber border + status pills + smart Confirm(N)/Close | 2026-04-26 | (pending) | | [260426-lg5-inline-live-duplicate-detection-for-name](./quick/260426-lg5-inline-live-duplicate-detection-for-name/) |
| 260426-nqr | Camera Edit form dirty-tracking PATCH (send only changed fields) + extend deriveActionLabel for tags/description/location/siteId/streamUrl/needsTranscode single-field rules | 2026-04-26 | 18dd74f | | [260426-nqr-camera-edit-form-dirty-tracking-patch-se](./quick/260426-nqr-camera-edit-form-dirty-tracking-patch-se/) |
| 260426-ox9 | Migrate per-camera Recordings detail table to shared DataTable + add Download/Delete row actions (DataTableRowActions, AlertDialog, refetch + deleted-current handler) | 2026-04-26 | 4f1a136 | | [260426-ox9-add-download-delete-row-actions-to-per-c](./quick/260426-ox9-add-download-delete-row-actions-to-per-c/) |
| 260426-sjz | Add Push & Encoder Setup docs guide (6th developer-portal menu) + fix 4 broken `/docs/push-setup` links | 2026-04-26 | 0a4d597 | | [260426-sjz-add-push-encoder-setup-docs-guide-and-fi](./quick/260426-sjz-add-push-encoder-setup-docs-guide-and-fi/) |
| 260426-udl | Trim encoder-setup docs to OBS+NVR only (drop FFmpeg/Wirecast/vMix) + replace SRS / Simple Realtime Server with "stream engine" in tenant docs | 2026-04-26 | 6bf8952 | | [260426-udl-trim-encoder-setup-docs-to-obs-nvr-only-](./quick/260426-udl-trim-encoder-setup-docs-to-obs-nvr-only-/) |
| 260426-x2o | Fix 16 docs-vs-code drift issues across 4 tenant developer-portal docs pages (policies/api-workflow/stream-profiles/webhooks) — TTL/maxViewers/rateLimit defaults, field names, endpoint URLs, profile enums | 2026-04-26 | d37cd13 | | [260426-x2o-fix-16-docs-vs-code-drift-issues-across-](./quick/260426-x2o-fix-16-docs-vs-code-drift-issues-across-/) |
| 260427-0r1 | Delete Developer Portal Overview page (content duplicated in Docs) — server-side redirects /app/developer→/app/developer/docs and /admin/developer→/admin/developer/docs, drop Overview from sidebar nav + role matrix + breadcrumb | 2026-04-27 | c1b5fe9 | | [260427-0r1-overview-docs](./quick/260427-0r1-overview-docs/) |
| 260427-1u5 | Rebrand SMS Platform → StreamBridge across user-facing UI strings (browser title, login wordmark, sidebar header, footer, docs intros, API Swagger title) + redesign login left panel (drop stat boxes, add 4 protocol pills RTSP/RTMP/SRT/WebRTC, new tagline) — internal `@sms-platform/*` package names preserved | 2026-04-27 | c1f5f62 | | [260427-1u5-rebrand-sms-platform-to-streambridge-acr](./quick/260427-1u5-rebrand-sms-platform-to-streambridge-acr/) |
| 260427-2sd | Move org badge + NotificationBell from sidebar header to top header bar (right-aligned) in tenant + admin layouts; add small `v0.1.0` version label above sidebar user profile (expanded only) | 2026-04-27 | 6a5cd2f | | [260427-2sd-move-org-badge-bell-to-top-header-bar-ad](./quick/260427-2sd-move-org-badge-bell-to-top-header-bar-ad/) |

## Session Continuity

Last session: 2026-04-27T06:22:25.455Z
Stopped at: Phase 23 context gathered
Resume file: .planning/phases/23-tech-debt-cleanup-phase-0-prerequisites/23-CONTEXT.md
