# Roadmap: SMS Platform

## Overview

The SMS Platform delivers a SaaS streaming infrastructure that converts RTSP camera feeds to secure HLS playback URLs via a single API call. The build progresses from foundational auth and multi-tenant isolation, through the highest-risk SRS/FFmpeg streaming pipeline, to secure playback sessions, developer-facing APIs, dashboard monitoring, cluster scaling, and finally recordings. Multi-tenant isolation is established first because retrofitting RLS onto existing tables is painful. The streaming engine comes second because it is the highest-risk component and must be proven before building features on top of it.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Multi-Tenant** - Auth, org isolation with RLS, package system, user management
- [ ] **Phase 2: Stream Engine & Camera Management** - FFmpeg process manager, RTSP-to-HLS pipeline via SRS, camera CRUD with status monitoring
- [ ] **Phase 3: Playback & Security** - JWT-signed playback sessions, domain allowlist, viewer limits, policies, embed code generation
- [ ] **Phase 4: Developer Experience** - API keys, developer portal, webhooks, in-app docs, batch sessions
- [ ] **Phase 5: Dashboard & Monitoring** - Real-time dashboard, map view, audit log, notifications, stream engine logs
- [ ] **Phase 6: SRS Cluster & Scaling** - Multi-node SRS origin/edge, load balancing, auto-failover, node management UI
- [ ] **Phase 7: Recordings** - HLS segment archival to MinIO, recording playback, retention policies, storage quotas

## Phase Details

### Phase 1: Foundation & Multi-Tenant
**Goal**: Users can authenticate, and all data is isolated per organization with enforced package limits
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, TENANT-01, TENANT-02, TENANT-03, TENANT-04, TENANT-05
**Success Criteria** (what must be TRUE):
  1. User can sign in with email/password and session persists across browser refresh
  2. Super admin can create an organization, assign a package, and create users within it
  3. Users in one organization cannot see or access data from another organization (RLS enforced)
  4. Package limits (camera count, viewers, bandwidth, storage) are stored and queryable per organization
  5. Users see only the features enabled by their organization's package (feature toggles work)
**Plans**: 6 plans

Plans:
- [x] 01-01-PLAN.md -- Scaffold monorepo, Docker Compose, Prisma schema, Vitest infrastructure
- [x] 01-02-PLAN.md -- Better Auth + RBAC plugins, RLS tenant isolation, System org seed
- [x] 01-03-PLAN.md -- Package CRUD, Organization management, User management APIs
- [x] 01-04-PLAN.md -- Frontend: sign-in page, admin panel, organizations + packages UI
- [x] 01-05-PLAN.md -- Gap closure: RLS policies on tenant-scoped tables, UsersController guard
- [x] 01-06-PLAN.md -- Gap closure: Feature toggle enforcement (backend guard + frontend hook)
**UI hint**: yes

### Phase 2: Stream Engine & Camera Management
**Goal**: Operators can register cameras and start/stop RTSP-to-HLS streams through the platform
**Depends on**: Phase 1
**Requirements**: CAM-01, CAM-02, CAM-03, CAM-04, CAM-05, CAM-06, CAM-07, STREAM-01, STREAM-02, STREAM-03, STREAM-04, STREAM-05, STREAM-06, STREAM-07, STREAM-08
**Success Criteria** (what must be TRUE):
  1. Operator can register a camera with RTSP URL and verify connectivity via ffprobe before saving
  2. Operator can start a camera stream and see HLS output playing in a browser within 10 seconds
  3. Camera status reflects real state (online/offline/degraded/reconnecting) and auto-reconnects on failure with exponential backoff
  4. Operator can assign a stream profile (passthrough or transcode) and H.265 cameras are auto-detected and transcoded to H.264
  5. Operator can manage stream engine settings (HLS config, ports, timeouts) via web UI without editing config files
**Plans**: 6 plans

Plans:
- [x] 02-01-PLAN.md -- Prisma schema, Docker Compose SRS, srs.conf, API Dockerfile with FFmpeg, npm dependencies
- [x] 02-02-PLAN.md -- Camera CRUD with Project > Site > Camera hierarchy, ffprobe test connection, H.265 detection
- [x] 02-03-PLAN.md -- FFmpeg process manager with BullMQ, camera status state machine, SRS callbacks, Socket.IO gateway
- [x] 02-04-PLAN.md -- Stream profile CRUD with validation, stream engine settings with srs.conf generation
- [x] 02-05-PLAN.md -- Camera management frontend: projects, cameras, detail page with HLS preview and stream controls
- [x] 02-06-PLAN.md -- Stream Profiles UI, Stream Engine Settings UI, Bulk Import dialog
**UI hint**: yes

### Phase 3: Playback & Security
**Goal**: Developers can get a secure, time-limited HLS playback URL via a single API call and embed it on their website
**Depends on**: Phase 2
**Requirements**: PLAY-01, PLAY-02, PLAY-03, PLAY-04, PLAY-05, PLAY-06, PLAY-07, POL-01, POL-02, POL-03
**Success Criteria** (what must be TRUE):
  1. Developer can call POST /cameras/{id}/sessions and receive a working HLS playback URL with JWT-signed token
  2. Playback URL stops working after the configured TTL expires
  3. Playback is rejected when the requesting domain is not in the allowlist
  4. Viewer concurrency limits are enforced -- excess viewers are rejected at session creation
  5. Policy inheritance resolves correctly: Camera policy overrides Site, which overrides Project, which overrides System defaults
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md -- Prisma schema (Policy + PlaybackSession), Policy CRUD with per-field merge resolution, Playback session creation with JWT signing via jose
- [x] 03-02-PLAN.md -- SRS on_play callback JWT + domain verification, HLS encryption key serving, three-tier rate limiting with @nestjs/throttler
- [x] 03-03-PLAN.md -- Frontend: Policy management pages, embed code dialog on camera detail, public embed player page at /embed/{session}

### Phase 4: Developer Experience
**Goal**: Developers can programmatically manage cameras and streams using scoped API keys with full documentation and event notifications
**Depends on**: Phase 3
**Requirements**: DEV-01, DEV-02, DEV-03, DEV-04, DEV-05
**Success Criteria** (what must be TRUE):
  1. Developer can create API keys scoped to a project or site and see usage stats (requests/day, bandwidth)
  2. Developer can browse interactive API docs with curl examples and live responses
  3. Developer can subscribe to webhook events (camera.online, camera.offline, camera.degraded) and receives HMAC-signed payloads
  4. Developer can create playback sessions for multiple cameras in a single batch API call
**Plans**: 5 plans

Plans:
- [x] 04-01-PLAN.md -- Prisma schema (ApiKey, ApiKeyUsage, WebhookSubscription, WebhookDelivery), API key CRUD, ApiKeyGuard, usage tracking
- [x] 04-02-PLAN.md -- Swagger UI bootstrap at /api/docs, decorators on all controllers, batch playback sessions endpoint
- [x] 04-03-PLAN.md -- Webhook subscriptions CRUD, BullMQ delivery with HMAC-SHA256, StatusService event hook
- [x] 04-04-PLAN.md -- Frontend: Developer Portal pages (Quick Start, API Keys, Webhooks), sidebar nav
- [x] 04-05-PLAN.md -- In-app documentation: 5 guide pages (API Workflow, Policies, Stream Profiles, Webhooks, Streaming Basics)
**UI hint**: yes

### Phase 5: Dashboard & Monitoring
**Goal**: Operators and admins can monitor camera status, system health, and all platform activity through a real-time dashboard
**Depends on**: Phase 2
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07
**Success Criteria** (what must be TRUE):
  1. Dashboard shows camera status summary, bandwidth chart, and API usage stats that update in real-time via WebSocket
  2. Map view displays camera locations with status indicators and clicking a camera shows a live preview
  3. Admin can view audit log of all user actions with actor, timestamp, IP, and details
  4. Users receive notifications for camera events (online/offline/degraded) and system alerts
  5. Admin can view live SRS stream engine logs in the UI
**Plans**: 6 plans

Plans:
- [x] 05-00-PLAN.md -- Wave 0: test stub files for Nyquist compliance (dashboard, audit, notifications, SRS logs)
- [x] 05-01-PLAN.md -- Prisma schema (AuditLog, Notification, NotificationPreference), RLS, AuditModule, NotificationsModule, DashboardModule
- [x] 05-02-PLAN.md -- Frontend deps (Leaflet, chart), sidebar nav Monitoring section, Map View page with markers and HLS popup
- [x] 05-03-PLAN.md -- Dashboard page with stat cards, bandwidth/API charts, camera status table, system metrics
- [x] 05-04-PLAN.md -- Audit Log page with filters and detail dialog, SRS live log streaming gateway and viewer
- [x] 05-05-PLAN.md -- Notification bell/dropdown with real-time delivery, preferences, camera detail page redesign
**UI hint**: yes

### Phase 6: SRS Cluster & Scaling
**Goal**: Platform can scale HLS delivery across multiple nginx caching proxy edge nodes with automatic failover
**Depends on**: Phase 2
**Requirements**: CLUSTER-01, CLUSTER-02, CLUSTER-03, CLUSTER-04, CLUSTER-05
**Success Criteria** (what must be TRUE):
  1. Admin can add and remove SRS edge nodes via the web UI and see their status (online/offline)
  2. Backend auto-generates srs.conf for each node and triggers config reload without downtime
  3. Playback sessions are routed to the least-loaded edge node automatically
  4. When an edge node goes down, active viewers are automatically failed over to a healthy node
**Plans**: 3 plans

Plans:
- [x] 06-01-PLAN.md -- Prisma schema (SrsNode, NodeRole, NodeStatus), ClusterModule CRUD, SrsApiService multi-node refactor, nginx/SRS config generation
- [x] 06-02-PLAN.md -- Health monitoring via BullMQ (10s interval, 3-miss offline), playback routing to least-loaded edge, settings propagation
- [x] 06-03-PLAN.md -- Frontend: Cluster Nodes page with stat cards, node table, add/remove/detail dialogs, Socket.IO real-time updates
**UI hint**: yes

### Phase 7: Recordings
**Goal**: Users can record camera streams, browse recorded footage, and manage storage with retention policies
**Depends on**: Phase 2
**Requirements**: REC-01, REC-02, REC-03, REC-04, REC-05
**Success Criteria** (what must be TRUE):
  1. Operator can start/stop recording for any camera and recorded segments are archived to MinIO/S3
  2. User can browse recorded footage with time-range selection and play it back in the browser
  3. Retention policies auto-delete recordings older than the configured period per camera and per plan
  4. Storage quota is enforced per organization with alerts at threshold levels
**Plans**: 5 plans

Plans:
- [x] 07-00-PLAN.md -- Wave 0: test stub files for Nyquist compliance (archive, manifest, lifecycle, retention, quota, schedule)
- [x] 07-01-PLAN.md -- Docker Compose MinIO, Prisma schema (Recording, RecordingSegment, RecordingSchedule), MinioService, RecordingsService start/stop/archive, on_hls callback wiring
- [x] 07-02-PLAN.md -- ManifestService dynamic m3u8 generation, RetentionProcessor hourly cleanup, ScheduleProcessor BullMQ, storage quota alerts
- [x] 07-03-PLAN.md -- Frontend: Recordings tab on camera detail (calendar, timeline, player, controls), schedule dialog, retention settings, recordings admin page, sidebar nav
- [x] 07-04-PLAN.md -- Gap closure: Seed dev Package with features, add /api/features/check endpoint, fix error feedback and storage quota mapping
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7
Note: Phases 5, 6, and 7 depend on Phase 2 (not on each other) and can be parallelized after Phase 3/4 if desired.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Multi-Tenant | 4/6 | Gap closure planned | - |
| 2. Stream Engine & Camera Management | 0/6 | Planned | - |
| 3. Playback & Security | 0/3 | Planned | - |
| 4. Developer Experience | 0/5 | Planned | - |
| 5. Dashboard & Monitoring | 0/5 | Planned | - |
| 6. SRS Cluster & Scaling | 0/3 | Planned | - |
| 7. Recordings | 4/5 | Gap closure planned | - |

## Backlog

### Phase 999.1: Role-based Sidebar Navigation (BACKLOG)
**Goal**: แยกเมนู sidebar ตาม role — Super Admin เห็นเฉพาะ platform management (orgs, packages, cluster, system) ส่วน Org Admin เห็นเฉพาะ org-level features (cameras, recordings, policies, developer) ป้องกัน conflict ที่ super admin เห็นหน้าว่างเปล่าและ org admin เห็นเมนูที่ไม่ควรเข้าถึง
**Requirements**: AUTH-03, AUTH-04, TENANT-04, TENANT-05
**Plans**: 5 plans

Plans:
- [x] 999.1-00-PLAN.md — Wave 0 test scaffolding (shared mocks + 9 failing test stubs for Nyquist compliance)
- [x] 999.1-01-PLAN.md — Backend: OrgAdminGuard + UsersController relaxation + GET /orgs/:id/members/me
- [x] 999.1-02-PLAN.md — Portal shell: PlatformNav + TenantNav + /app layout + root redirector + sign-in redirect + delete (dashboard)
- [x] 999.1-03-PLAN.md — Tenant pages migration to /app/*, feature-gate empty states, platform dashboard/audit stubs
- [x] 999.1-04-PLAN.md — User management UI: /admin/users (platform) + /app/team (tenant) with OrgAdminGuard wiring

### Phase 999.2: UI Review & Fixes (BACKLOG)
**Goal**: รัน UI-REVIEW สำหรับ 5 เฟสที่ยังไม่ได้ตรวจ (01, 02, 04, 06, 07) เทียบกับ UI-SPEC แล้วสร้าง fix plans สำหรับ issues ที่เจอ
**Requirements**: TBD
**Plans**: 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
