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

(Planning for v1.1)

- [ ] Tenant self-service pages (/app/settings, /app/account, /app/plan)
- [ ] FFmpeg auto-reconnect after SRS container restart
- [ ] Mobile responsive layout improvements

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

## Current State

**Shipped:** v1.0 MVP (2026-04-16)
**Codebase:** 32,832 LOC TypeScript/TSX across 583 files
**Stack:** NestJS 11 + Next.js 15 + PostgreSQL 16 + Prisma 6 + Redis 7 + SRS v6 + FFmpeg 7 + MinIO + Better Auth
**Tests:** 31 web tests + 34 recording tests passing

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
*Last updated: 2026-04-14 — Phase 7 (Recordings) complete: recording pipeline, manifest playback, retention, storage quota, schedule management, frontend UI*
