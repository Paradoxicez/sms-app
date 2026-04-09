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
- [ ] 03-02-PLAN.md -- SRS on_play callback JWT + domain verification, HLS encryption key serving, three-tier rate limiting with @nestjs/throttler
- [ ] 03-03-PLAN.md -- Frontend: Policy management pages, embed code dialog on camera detail, public embed player page at /embed/{session}

### Phase 4: Developer Experience
**Goal**: Developers can programmatically manage cameras and streams using scoped API keys with full documentation and event notifications
**Depends on**: Phase 3
**Requirements**: DEV-01, DEV-02, DEV-03, DEV-04, DEV-05
**Success Criteria** (what must be TRUE):
  1. Developer can create API keys scoped to a project or site and see usage stats (requests/day, bandwidth)
  2. Developer can browse interactive API docs with curl examples and live responses
  3. Developer can subscribe to webhook events (camera.online, camera.offline, camera.degraded) and receives HMAC-signed payloads
  4. Developer can create playback sessions for multiple cameras in a single batch API call
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD

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
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD
**UI hint**: yes

### Phase 6: SRS Cluster & Scaling
**Goal**: Platform can scale HLS delivery across multiple SRS nodes with automatic failover
**Depends on**: Phase 2
**Requirements**: CLUSTER-01, CLUSTER-02, CLUSTER-03, CLUSTER-04, CLUSTER-05
**Success Criteria** (what must be TRUE):
  1. Admin can add and remove SRS edge nodes via the web UI and see their status (online/offline)
  2. Backend auto-generates srs.conf for each node and triggers config reload without downtime
  3. Playback sessions are routed to the least-loaded edge node automatically
  4. When an edge node goes down, active viewers are automatically failed over to a healthy node
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
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
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD
- [ ] 07-03: TBD
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
| 4. Developer Experience | 0/3 | Not started | - |
| 5. Dashboard & Monitoring | 0/3 | Not started | - |
| 6. SRS Cluster & Scaling | 0/2 | Not started | - |
| 7. Recordings | 0/3 | Not started | - |
