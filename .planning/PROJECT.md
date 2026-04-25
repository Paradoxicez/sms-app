# SMS Platform (Surveillance Management System)

## What This Is

A SaaS platform that lets developers embed live CCTV streams on their websites without managing streaming infrastructure. The platform ingests RTSP/RTMP/SRT camera feeds, converts them to HLS, and provides secure, time-limited playback URLs via API. Developers register cameras, configure stream profiles, and get embeddable links — the platform handles all transcoding, delivery, and access control.

## Core Value

Developers can get a secure HLS playback URL for any registered camera via a single API call, and embed it on their website immediately.

## Requirements

### Validated

- ✓ Multi-tenant architecture with organization isolation — v1.0
- ✓ Super admin panel for managing tenants and packages — v1.0
- ✓ Package system with configurable limits — v1.0
- ✓ Per-org user management with roles (Admin, Operator, Developer, Viewer) — v1.0
- ✓ SRS integration as stream engine — v1.0
- ✓ RTSP/RTMP/SRT ingest from cameras — v1.0
- ✓ HLS output for browser playback — v1.0
- ✓ Stream transcoding with configurable profiles — v1.0
- ✓ Stream health monitoring and auto-reconnect — v1.0
- ✓ Stream Engine configuration via web UI — v1.0
- ✓ Project > Site > Camera hierarchy — v1.0
- ✓ Camera registration with RTSP/SRT URL, name, location, tags — v1.0
- ✓ Camera status monitoring (online/offline/degraded/connecting) — v1.0
- ✓ Stream start/stop control per camera — v1.0
- ✓ Test connection before adding camera — v1.0
- ✓ Bulk camera import — v1.0
- ✓ API endpoint to create playback sessions — v1.0
- ✓ Session TTL (configurable) — v1.0
- ✓ Domain allowlist — v1.0
- ✓ Rate limiting per API key per camera — v1.0
- ✓ Viewer concurrency limits per camera — v1.0
- ✓ Embed code generation (iframe + hls.js snippet) — v1.0
- ✓ Reusable stream profiles (resolution, codec, FPS, audio) — v1.0
- ✓ Video processing modes: Transcode or Passthrough — v1.0
- ✓ Playback policies with TTL, rate limits, viewer limits, domain allowlist — v1.0
- ✓ Policy resolution order: Camera > Site > Project > System — v1.0
- ✓ Record camera streams with configurable retention — v1.0
- ✓ Browse and playback recorded footage — v1.0
- ✓ Recording start/stop per camera — v1.0
- ✓ Storage management with retention policies — v1.0
- ✓ API Keys scoped to project/site with usage tracking — v1.0
- ✓ Developer Portal with interactive API reference — v1.0
- ✓ In-app documentation (5 guides) — v1.0
- ✓ Webhook subscriptions for camera events — v1.0
- ✓ Dashboard with camera status, bandwidth, API usage, system metrics — v1.0
- ✓ Map view showing camera locations with status and preview — v1.0
- ✓ Audit log tracking all actions — v1.0
- ✓ Notification system for camera and system events — v1.0
- ✓ Live stream engine logs viewable in UI — v1.0
- ✓ Email/password authentication — v1.0
- ✓ Session persistence across browser refresh — v1.0
- ✓ Role-based access control — v1.0
- ✓ SRS cluster scaling with edge nodes — v1.0
- ✓ Role-based dual-portal (admin/tenant) — v1.0

### Active

- [ ] User account self-service — change name, avatar, email, password
- [ ] Plan/usage viewer — view current plan, usage/limits, contact admin for upgrade
- [ ] FFmpeg full resilience — auto-reconnect (SRS restart + camera drop), health check loop, notification on status change
- [ ] DataTable migration: Admin org > Team page
- [ ] DataTable migration: Super admin > Organizations page
- [ ] DataTable migration: Super admin > Cluster Nodes page
- [ ] DataTable migration: Super admin > Platform Audit page
- [ ] Fix: Super admin cannot create users for system org
- [ ] Fix: API Key copy returns masked key instead of real key
- [ ] Fix: API Key delete not working
- [ ] Recording playback page with timeline
- [ ] Dashboard improvements — org admin + super admin, add necessary data, remove unnecessary
- [ ] Map UI — improve thumbnail popup and pin/marker design
- [ ] Camera status column — 3 status icons: online/offline (live), recording, maintenance
- [ ] Camera maintenance mode action

### Deferred to Future

(None)

### Out of Scope

- Billing/payment integration (Stripe, etc.) — super admin manages plans manually for v1
- Mobile app — web-first
- OAuth/SSO login — email/password sufficient for v1
- AI-based video analytics — not core to streaming platform
- P2P/WebRTC delivery — HLS is the target protocol
- Multi-region deployment — single Docker Compose for v1

## Context

**Rebuild motivation:** Existing SMS Platform built on MediaMTX has fundamental issues — unstable streams, poor scalability, missing features (transcoding, proper recording), and painful TOML-based configuration. SRS (Simple Realtime Server) offers HTTP API control, better stability, and broader protocol support.

**Target users:** Developers who need to embed CCTV streams in their web applications. They want an API call that returns a playback URL — no streaming infrastructure management.

**Existing app:** 35 screenshots document the complete current UI (login, dashboard, projects, cameras, map, recordings, policies, stream profiles, audit log, API keys, developer portal, users, stream engine, webhooks, docs). UI design will be preserved; backend is full rewrite.

**SRS integration note:** SRS capabilities (exact API surface, supported protocols, transcoding options, recording mechanisms) must be deeply researched before finalizing API design and requirements. The backend architecture should wrap SRS rather than fight it — design API around what SRS can do natively.

## Constraints

- **Stream Engine**: SRS (Simple Realtime Server) — replacing MediaMTX
- **Deployment**: Docker Compose (single server, self-hosted)
- **UI Design**: Preserve existing UI patterns from screenshots (green theme, sidebar nav, card-based dashboard)
- **Security Model**: Session-based playback URLs + domain allowlist + API key (proven sufficient in v1)
- **Tech Stack**: NestJS + Next.js + PostgreSQL + Prisma + Redis + Better Auth + SRS + FFmpeg + MinIO
- **Auth**: Better Auth — provides built-in organizations, RBAC, sessions, invitations (replaces Passport.js)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SRS over MediaMTX | MediaMTX: unstable, can't scale, missing features, TOML-only config. SRS: HTTP API, stable, feature-rich | ✓ Good — stable HLS delivery, HTTP callbacks work well |
| Multi-tenant from day 1 | SaaS model requires org isolation; retrofitting is painful | ✓ Good — RLS + CLS org context used across all 7 phases |
| No billing in v1 | Super admin manages plans manually; avoids Stripe complexity in initial build | ✓ Good — package system works, billing deferred to v1.1+ |
| Docker Compose deploy | Start simple, single server; can migrate to K8s later | ✓ Good — 5 containers (postgres, redis, minio, srs, api) |
| Research SRS before finalizing API | Don't design APIs that the stream engine can't support natively | ✓ Good — discovered RTSP removal, FFmpeg wrapper pattern |
| Better Auth over Passport.js | Built-in orgs, RBAC, sessions, invitations — reduces Phase 1 scope significantly | ✓ Good — org/member/role management built-in |
| External FFmpeg over SRS ingest | Dynamic camera management without SRS config reload | ✓ Good — BullMQ process pool with reconnection |
| fMP4 HLS over MPEG-TS | Better codec support, modern format | ⚠️ Revisit — first-boot gap required static config fix |

## Current Milestone: v1.2 Self-Service, Resilience & UI Polish

**Goal:** เปิดให้ user จัดการบัญชีเอง, ทำ FFmpeg resilience เต็มรูปแบบ, แก้ UI ที่หลุดจาก v1.1, และปรับปรุง UX หลายจุด

**Target features:**
- User account self-service (name, avatar, email, password)
- Plan/usage viewer (view-only)
- FFmpeg full resilience (SRS restart + camera drop + health check + notification)
- DataTable migration for missed pages (Team, Organizations, Cluster Nodes, Platform Audit)
- Bug fixes (system org user creation, API key copy/delete)
- Recording playback page with timeline
- Dashboard improvements (org admin + super admin)
- Map UI improvements (thumbnail popup, pin design)
- Camera status icons (online/offline, recording, maintenance) + maintenance mode action

## Current State

**Shipped:** v1.1 UI Overhaul (2026-04-18)
**Stack:** NestJS 11 + Next.js 15 + PostgreSQL 16 + Prisma 6 + Redis 7 + SRS v6 + FFmpeg 7 + MinIO + Better Auth
**v1.1 delivered:**
- DataTable component system (sorting, faceted filters, pagination) — used by 13+ pages
- Collapsible sidebar with cookie persistence + split-screen login redesign
- All admin tables migrated to unified DataTable (Audit Log, Users, API Keys, Webhooks, Stream Profiles)
- Camera management: DataTable + card view with live HLS preview + View Stream sheet
- Recordings page with cross-camera DataTable, bulk delete, presigned download
- Hierarchy tree viewer (Project > Site > Camera) + resizable split-panel + map drag-to-relocate markers

**v1.2 progress (in flight):**
- Phase 16 complete (2026-04-19) — User self-service: `/app/account` + `/admin/account` pages, avatar upload/remove via MinIO, password change with revokeOtherSessions, tenant Plan & Usage read-only view. Validated USER-01/02/03. Human UAT 9/9 passed.
- Phase 19 complete (2026-04-22) — Camera input validation + RTMP/RTMPS pull-model support: 4-protocol DTO allowlist (T-19-01 HIGH mitigated), protocol-branch `-rtsp_transport` flag, async probe pipeline (BullMQ `probe:{cameraId}` dedup, 3 triggers: create / on-publish / retry), `CodecInfo` tagged-union (pending/success/failed/no-data) with sanitized error reasons, 4-state `CodecStatusCell` + inline retry icon, 3-layer duplicate prevention (client validateRow + service pre-check + Prisma `@@unique([orgId, streamUrl])`), live form validation mirroring backend, bulk-import within-file dedup + 3rd duplicate icon + toast cascade. 9 plans / 5 waves / 43 commits. RTMP **push** model (platform-generated stream keys) split to Phase 19.1 per supplementary discuss.
- Phase 20 complete (2026-04-25) — Cameras UX bulk actions + maintenance toggle + copy ID + expressive status: 22 locked decisions D-01..D-22 from CONTEXT.md. Multi-select + sticky `BulkToolbar` (Start Stream / Start Recording / Maintenance / Delete) with `chunkedAllSettled` fan-out (concurrency=5, pre-filter helpers per Research A6/A7), asymmetric row-menu Maintenance (Enter → reason dialog ≤200 chars / Exit → direct DELETE), Copy Camera ID + Copy cURL with literal `<YOUR_API_KEY>` placeholder (no real key fetch), monospace ID chip + copy affordance in ViewStreamSheet header, expressive LIVE/REC/MAINT/OFFLINE status pills replacing 3-icon column (motion-reduce paired pulse, byte-for-byte token reuse from map popup), expandable Start Stream / Start Record pill buttons with `min-w-[340px]` reservation. Backend: `POST /api/cameras/:id/maintenance` accepts optional `{ reason?: string }` body — captured in audit log via existing `request.body` snapshot, no schema change. 4 plans / 2 waves / 17 commits. Human UAT 5/5 passed. Out-of-scope fix during UAT: shared tooltip primitive z-index `z-50 → z-[1200]` (was clipping behind Sheet `z-[1100]`); BulkToolbar extended to `/app/projects` page via shared `useCameraBulkActions` hook + `<CameraBulkActions>` component (initial scope only covered `/app/cameras`).
- Phase 21 + 21.1 complete (2026-04-25) — Hot-reload stream profile changes to running cameras: D-01..D-11 (Phase 21) shipped audit-log-correct surface (jobId pattern `camera:{id}:ffmpeg`, dedup-by-jobId, gracefulRestart helper, 409 DELETE protection, audit-at-enqueue, UI toasts, B-1 collision guard). Manual UAT 2026-04-25 surfaced runtime defect: `enqueueProfileRestart`'s remove-then-add silently no-ops on active+locked BullMQ jobs (BKR06 + SD640: 11 PATCHes → 11 audit rows but FFmpeg PID 14013 unchanged). Phase 21.1 closes this with D-12..D-15: Redis pub/sub channel `camera:{id}:restart` between publisher (`enqueueProfileRestart`) and subscriber (`StreamProcessor.process()` via `ioredis.duplicate()`), 4 mitigations bundled (M1 try/finally + unsubscribe+quit; M2 fingerprint safety net on subscribe-ready; M3 in-process `restartingCameras: Set<string>` dedup; M4 hybrid test layer = 3 mock units + 1 real-Redis integration). 21.1 = 3 plans / 2 waves / 9 commits. Verifier 12/12 must-haves passed. BKR06 11-PATCH integration test reproduces the original failure mode and asserts 11/11 `gracefulRestart` invocations within 1.6s wall-time against real Redis. D-13 strict scope: only `enqueueProfileRestart` modified — `startStream`, `stopStream`, `notifyQueue`, B-1 guard all byte-identical. D-15 rollout: standard `docker compose restart api` flow uses Phase 15 `ResilienceService.onApplicationShutdown` + `BootRecoveryService.onApplicationBootstrap` — no migration code, no admin endpoint, no maintenance window.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-25 after Phase 21.1 completion (Active-job collision fix for hot-reload restart — gap closure for Phase 21). D-12..D-15 implemented: Redis pub/sub signaling between publisher/subscriber, 4 mitigations bundled, hybrid test layer (3 mock units + 1 real-Redis integration reproducing BKR06 11-PATCH UAT scenario). 12/12 must-haves verified. 703 API + 485 web tests green; 19 new tests added by 21.1. D-13 strict scope honored — only `enqueueProfileRestart` modified, all other call sites byte-identical including B-1 collision guard.*
