# Requirements: SMS Platform

**Defined:** 2026-04-09
**Core Value:** Developers can get a secure HLS playback URL for any registered camera via a single API call, and embed it on their website immediately.

## v1 Requirements

### Authentication & Users

- [ ] **AUTH-01**: User can sign in with email and password
- [ ] **AUTH-02**: User session persists across browser refresh
- [ ] **AUTH-03**: Role-based access control (Admin, Operator, Developer, Viewer)
- [ ] **AUTH-04**: Super admin can manage all tenants, packages, and system settings

### Multi-Tenant

- [x] **TENANT-01**: Organization isolation with shared-schema + org_id on all tables (PostgreSQL RLS)
- [ ] **TENANT-02**: Super admin can create/edit/deactivate organizations
- [x] **TENANT-03**: Package system with configurable limits (camera count, concurrent viewers, bandwidth, storage)
- [x] **TENANT-04**: Feature toggles per package (recordings, webhooks, map, audit log, etc.)
- [ ] **TENANT-05**: Per-org user management (invite, assign roles, deactivate)

### Camera Management

- [ ] **CAM-01**: Register camera with RTSP/SRT URL, name, location (lat/lng), tags
- [ ] **CAM-02**: Project > Site > Camera hierarchy for organizing cameras
- [ ] **CAM-03**: Start/stop stream per camera (spawns/kills FFmpeg process)
- [ ] **CAM-04**: Camera status monitoring with state machine (online/offline/degraded/connecting/reconnecting)
- [ ] **CAM-05**: Auto-reconnect with exponential backoff on stream failure
- [ ] **CAM-06**: Test connection via ffprobe before registering camera (returns codec, resolution, FPS)
- [ ] **CAM-07**: Bulk camera import via CSV/JSON with validation and preview

### Stream Engine (SRS + FFmpeg)

- [ ] **STREAM-01**: FFmpeg process manager -- spawn, supervise, restart, kill per camera
- [ ] **STREAM-02**: RTSP pull via FFmpeg -> RTMP push to SRS pipeline (automatic on camera start)
- [ ] **STREAM-03**: SRS delivers HLS output (fMP4 segments, 2s fragments, AES-128 encryption)
- [ ] **STREAM-04**: SRS HTTP callbacks integration (on_publish, on_unpublish, on_play, on_stop, on_hls, on_dvr)
- [ ] **STREAM-05**: Stream profiles -- passthrough (-c copy) or transcode (H.264, configurable resolution/FPS/bitrate/audio)
- [ ] **STREAM-06**: H.265 camera auto-detection via ffprobe and automatic transcoding to H.264
- [ ] **STREAM-07**: Stream engine settings manageable via web UI (HLS config, RTMP port, timeouts)
- [ ] **STREAM-08**: WebRTC (WHEP) output support as low-latency alternative to HLS

### SRS Cluster

- [ ] **CLUSTER-01**: Data model supports multiple SRS nodes (origin + edge) with role and status
- [ ] **CLUSTER-02**: Admin can add/remove SRS edge nodes via web UI
- [ ] **CLUSTER-03**: Backend auto-generates srs.conf for each node and triggers reload
- [ ] **CLUSTER-04**: Load balancing -- playback sessions routed to least-loaded edge node
- [ ] **CLUSTER-05**: Node health monitoring via SRS `/api/v1/summaries` with auto-failover

### Playback & Security

- [ ] **PLAY-01**: API endpoint `POST /cameras/{id}/sessions` returns time-limited HLS playback URL
- [ ] **PLAY-02**: JWT-signed playback tokens with camera scope, domain restriction, expiry
- [ ] **PLAY-03**: Domain allowlist enforcement on HLS playback (wildcard subdomain support)
- [ ] **PLAY-04**: Session TTL configurable per policy (default 2 hours for live CCTV)
- [ ] **PLAY-05**: Viewer concurrency limits per camera enforced at session creation
- [ ] **PLAY-06**: Embed code generation (iframe snippet + hls.js snippet)
- [ ] **PLAY-07**: HLS segment encryption via SRS hls_keys with backend key serving for authenticated sessions

### Policies

- [ ] **POL-01**: Playback policies with TTL range, rate limit, viewer concurrency limit, domain allowlist
- [ ] **POL-02**: Policy resolution order: Camera > Site > Project > System defaults
- [ ] **POL-03**: Three-tier rate limiting (global, per-tenant, per-API-key) with standard headers

### Recordings

- [ ] **REC-01**: Record camera streams via on_hls callback archiving segments to MinIO/S3
- [ ] **REC-02**: Browse and playback recorded footage with time-range selection
- [ ] **REC-03**: Start/stop recording per camera
- [ ] **REC-04**: Configurable retention policies per camera and per plan
- [ ] **REC-05**: Storage quota enforcement per organization with alerts

### Developer Experience

- [ ] **DEV-01**: API Keys scoped to project or site with usage tracking (requests/day, bandwidth)
- [ ] **DEV-02**: Developer Portal with interactive API reference (curl examples + live responses)
- [ ] **DEV-03**: In-app documentation (API workflow guide, policies guide, stream profiles guide)
- [ ] **DEV-04**: Webhook subscriptions for camera events (online/offline/degraded/reconnecting) with HMAC signatures
- [ ] **DEV-05**: Batch playback session creation for multiple cameras in one API call

### Dashboard & Monitoring

- [ ] **DASH-01**: Dashboard with camera status summary, bandwidth chart, API usage stats
- [ ] **DASH-02**: Real-time camera status and viewer count updates via WebSocket
- [ ] **DASH-03**: Map view showing camera locations with status indicators and click-to-preview
- [ ] **DASH-04**: System metrics display (CPU, memory, storage, SRS node stats via Prometheus)
- [ ] **DASH-05**: Audit log tracking all user actions with actor, timestamp, IP, details
- [ ] **DASH-06**: Notification system for camera events and system alerts
- [ ] **DASH-07**: Live stream engine logs viewable in UI (SRS log stream)

## v2 Requirements

### Advanced Features

- **ADV-01**: Billing/payment integration (Stripe) with self-service subscription
- **ADV-02**: OAuth/SSO login (Google, GitHub)
- **ADV-03**: Snapshot capture API (grab frame from live stream)
- **ADV-04**: Adaptive bitrate streaming (multiple quality levels per camera)
- **ADV-05**: Custom player web component (`<sms-player>`)
- **ADV-06**: Multi-region deployment with geo-routing

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI video analytics | Bottomless scope, not core to streaming. Provide webhook hooks for third-party AI instead |
| P2P/WebRTC-only delivery | HLS + optional WHEP covers all use cases |
| Mobile native app | Web-first platform, responsive dashboard is sufficient |
| Real-time chat/intercom | Not relevant to CCTV surveillance use case |
| Camera PTZ control | Hardware-specific, requires ONVIF integration -- defer to v2+ |
| Self-service billing in v1 | Super admin manages plans manually to avoid payment gateway complexity |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| TENANT-01 | Phase 1 | Complete |
| TENANT-02 | Phase 1 | Pending |
| TENANT-03 | Phase 1 | Complete |
| TENANT-04 | Phase 1 | Complete |
| TENANT-05 | Phase 1 | Pending |
| CAM-01 | Phase 2 | Pending |
| CAM-02 | Phase 2 | Pending |
| CAM-03 | Phase 2 | Pending |
| CAM-04 | Phase 2 | Pending |
| CAM-05 | Phase 2 | Pending |
| CAM-06 | Phase 2 | Pending |
| CAM-07 | Phase 2 | Pending |
| STREAM-01 | Phase 2 | Pending |
| STREAM-02 | Phase 2 | Pending |
| STREAM-03 | Phase 2 | Pending |
| STREAM-04 | Phase 2 | Pending |
| STREAM-05 | Phase 2 | Pending |
| STREAM-06 | Phase 2 | Pending |
| STREAM-07 | Phase 2 | Pending |
| STREAM-08 | Phase 2 | Pending |
| PLAY-01 | Phase 3 | Pending |
| PLAY-02 | Phase 3 | Pending |
| PLAY-03 | Phase 3 | Pending |
| PLAY-04 | Phase 3 | Pending |
| PLAY-05 | Phase 3 | Pending |
| PLAY-06 | Phase 3 | Pending |
| PLAY-07 | Phase 3 | Pending |
| POL-01 | Phase 3 | Pending |
| POL-02 | Phase 3 | Pending |
| POL-03 | Phase 3 | Pending |
| DEV-01 | Phase 4 | Pending |
| DEV-02 | Phase 4 | Pending |
| DEV-03 | Phase 4 | Pending |
| DEV-04 | Phase 4 | Pending |
| DEV-05 | Phase 4 | Pending |
| DASH-01 | Phase 5 | Pending |
| DASH-02 | Phase 5 | Pending |
| DASH-03 | Phase 5 | Pending |
| DASH-04 | Phase 5 | Pending |
| DASH-05 | Phase 5 | Pending |
| DASH-06 | Phase 5 | Pending |
| DASH-07 | Phase 5 | Pending |
| CLUSTER-01 | Phase 6 | Pending |
| CLUSTER-02 | Phase 6 | Pending |
| CLUSTER-03 | Phase 6 | Pending |
| CLUSTER-04 | Phase 6 | Pending |
| CLUSTER-05 | Phase 6 | Pending |
| REC-01 | Phase 7 | Pending |
| REC-02 | Phase 7 | Pending |
| REC-03 | Phase 7 | Pending |
| REC-04 | Phase 7 | Pending |
| REC-05 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 49 total
- Mapped to phases: 49
- Unmapped: 0

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-08 after roadmap creation (DASH and CLUSTER split into separate phases, REC moved to Phase 7)*
