# SMS Platform (Surveillance Management System)

## What This Is

A SaaS platform that lets developers embed live CCTV streams on their websites without managing streaming infrastructure. The platform ingests RTSP/RTMP/SRT camera feeds, converts them to HLS, and provides secure, time-limited playback URLs via API. Developers register cameras, configure stream profiles, and get embeddable links — the platform handles all transcoding, delivery, and access control.

## Core Value

Developers can get a secure HLS playback URL for any registered camera via a single API call, and embed it on their website immediately.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Multi-Tenant & SaaS:**
- [ ] Multi-tenant architecture with organization isolation
- [ ] Super admin panel for managing tenants and packages
- [ ] Package system with configurable limits (camera count, viewers, bandwidth, storage, feature toggles)
- [ ] Per-org user management with roles (Admin, Operator, Developer, Viewer)

**Stream Engine (SRS-based):**
- [ ] SRS integration as stream engine replacing MediaMTX
- [ ] RTSP/RTMP/SRT ingest from cameras
- [ ] HLS output for browser playback (low-latency)
- [ ] Stream transcoding with configurable profiles (resolution, FPS, codec, audio)
- [ ] Stream health monitoring and auto-reconnect
- [ ] Stream Engine configuration via web UI (not TOML files)

**Camera Management:**
- [ ] Project > Site > Camera hierarchy for organizing cameras
- [ ] Camera registration with RTSP/SRT URL, name, location (lat/lng), tags
- [ ] Camera status monitoring (online/offline/degraded/connecting)
- [ ] Stream start/stop control per camera
- [ ] Test connection before adding camera
- [ ] Bulk camera import

**Playback & Security:**
- [ ] API endpoint to create playback sessions (returns time-limited HLS URL)
- [ ] Session TTL (configurable, default 120s)
- [ ] Domain allowlist (restrict embed origins)
- [ ] Rate limiting per API key per camera
- [ ] Viewer concurrency limits per camera
- [ ] Embed code generation (iframe + hls.js snippet)

**Stream Profiles:**
- [ ] Reusable output configurations (protocol, resolution, codec, FPS, audio mode, keyframe interval)
- [ ] Video processing modes: Transcode (H.264) or Passthrough
- [ ] Assignable to cameras or as site/project defaults

**Policies:**
- [ ] Playback policies with TTL range, rate limits, viewer limits, domain allowlist
- [ ] Policy resolution order: Camera > Site > Project > System defaults

**Recordings:**
- [ ] Record camera streams with configurable retention
- [ ] Browse and playback recorded footage
- [ ] Recording start/stop per camera
- [ ] Storage management with retention policies

**Developer Experience:**
- [ ] API Keys scoped to project/site with usage tracking
- [ ] Developer Portal with interactive API reference (curl examples + responses)
- [ ] In-app documentation (API workflow, policies, stream profiles guides)
- [ ] Webhook subscriptions for camera events (online, offline, degraded, reconnecting)

**Monitoring & Admin:**
- [ ] Dashboard with camera status, bandwidth, API usage, system metrics (CPU/memory/storage)
- [ ] Map view showing camera locations with status and preview
- [ ] Audit log tracking all actions
- [ ] Notification system for camera and system events
- [ ] Live stream engine logs viewable in UI

**Authentication:**
- [ ] Email/password authentication
- [ ] Session persistence across browser refresh
- [ ] Role-based access control

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
| SRS over MediaMTX | MediaMTX: unstable, can't scale, missing features, TOML-only config. SRS: HTTP API, stable, feature-rich | -- Pending |
| Multi-tenant from day 1 | SaaS model requires org isolation; retrofitting is painful | -- Pending |
| No billing in v1 | Super admin manages plans manually; avoids Stripe complexity in initial build | -- Pending |
| Docker Compose deploy | Start simple, single server; can migrate to K8s later | -- Pending |
| Research SRS before finalizing API | Don't design APIs that the stream engine can't support natively | -- Pending |
| Better Auth over Passport.js | Built-in orgs, RBAC, sessions, invitations — reduces Phase 1 scope significantly | -- Pending |

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
*Last updated: 2026-04-09 after initialization*
