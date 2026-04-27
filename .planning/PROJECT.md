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

- ✓ User account self-service — change name, avatar, password — v1.2 (Phase 16)
- ✓ Plan/usage viewer — view current plan + usage/limits (read-only) — v1.2 (Phase 16)
- ✓ FFmpeg full resilience — SRS-restart pid-delta detection, 60s health check, graceful shutdown + boot recovery, 30s debounce notify/webhook — v1.2 (Phase 15)
- ✓ Camera maintenance mode — flag-flip suppresses notify/webhook, asymmetric row menu (Enter dialog / Exit direct), reason capture (≤200 chars) — v1.2 (Phase 15+20)
- ✓ Hot-reload stream profile to running cameras — within 30s via Redis pub/sub for active+locked BullMQ jobs — v1.2 (Phase 21+21.1)
- ✓ DataTable migrations: Team, Organizations, Cluster Nodes, Platform Audit — v1.2 (Phase 14)
- ✓ Bug fixes: super-admin user creation in system org (RLS context tx), API Key raw-copy + hard-delete — v1.2 (Phase 14)
- ✓ Recording playback page with HLS player + 24h timeline scrubber + heatmap — v1.2 (Phase 17)
- ✓ Dashboard polish — 6 stat cards + IssuesPanel (tenant) + 7 super-admin endpoints + 4 widgets — v1.2 (Phase 18)
- ✓ Map polish — teardrop SVG marker + recording/maintenance badges + 16:9 popup preview + Tags MultiSelect filter — v1.2 (Phase 18+22)
- ✓ Expressive Status pills — LIVE/REC/MAINT/OFFLINE replacing 3-icon composite — v1.2 (Phase 20)
- ✓ Bulk camera actions — Start Stream / Recording / Maintenance / Delete via `chunkedAllSettled` (concurrency=5) + partial-failure badges — v1.2 (Phase 20)
- ✓ Camera input validation + multi-protocol — 4-protocol allowlist (RTSP/RTMP/RTMPS/SRT), async codec probe pipeline, 3-layer duplicate prevention — v1.2 (Phase 19)
- ✓ RTMP push ingest with platform-generated stream keys — v1.2 (Phase 19.1)
- ✓ Camera metadata utilization — tags + description surfaced across DataTable, view-stream-sheet, map popup, webhook payload, audit diff, Dev Portal docs — v1.2 (Phase 22)

### Active

(None — milestone v1.2 shipped 2026-04-27. Run `/gsd-new-milestone` to scope v1.3 Production Ready.)

### Deferred to Future

- User self-service: change email (requires re-verify) — USER-04 (deferred from v1.2)
- FFmpeg stderr parsing for proactive degradation detection — RESIL-05 (deferred from v1.2)
- Timeline zoom levels (6h, 1h views) — REC-04 (deferred from v1.2)
- Cross-camera timeline view for incident investigation — REC-05 (deferred from v1.2)
- Scheduled maintenance windows (auto-enter/exit) — CAM-04 (deferred from v1.2)
- Phase 22 ↔ Phase 17 metadata gap — surface camera tags + description on `/app/recordings/[id]` playback page (v1.2 audit found unwired surface)
- StreamProcessor undefined cameraId defensive guard — open since 2026-04-21
- Pre-existing API test failures (~23) — auth/crypto ESM imports, recording manifest fMP4, srs callback mocks, cluster service tests

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
| fMP4 HLS over MPEG-TS | Better codec support, modern format | ⚠️ Revisit — first-boot gap required static config fix; SRS v6 falls back to MPEG-TS |
| BullMQ jobId unification (`camera:{id}:ffmpeg`) | Dedupe enqueue paths from 4 sources | ✓ Good — single source of truth (Phase 15) |
| Maintenance gate at StatusService chokepoint | Single suppression point for notify/webhook + 30s debounce | ✓ Good — gate + replacement-by-jobId pattern (Phase 15) |
| Hot-reload via Redis pub/sub for active+locked BullMQ jobs | BullMQ remove-then-add silently no-ops on locked jobs | ✓ Good — closes Phase 21 runtime gap (Phase 21.1) |
| Client-side `chunkedAllSettled` (concurrency=5) over server bulk endpoints | Reuse per-camera endpoints, simpler audit, no new server contract | ✓ Good — Phase 20 bulk actions ship without backend bloat |
| Expressive LIVE/REC/MAINT/OFFLINE pills replace 3-icon composite | Single readable signal vs 3 icons + tooltips | ✓ Good — supersedes Phase 15 D-12..D-16 (Phase 20) |
| Camera.tags as denormalized String[] with `tagsNormalized` shadow + GIN | Avoid Tag entity over-engineering; case-insensitive search | ✓ Good — Phase 22 ships across 4 surfaces |
| RTMP push with platform-generated stream keys + SRS forward hook | Avoid FFmpeg pull for encoders that prefer push | ✓ Good — Phase 19.1 inserted between 19 and 20 |
| Active-job collision via Redis pub/sub (Phase 21.1) | Phase 21 surface contract was correct but runtime restart cycle silently dropped on locked jobs | ✓ Good — gap closure phase pattern works |

## Current Milestone: v1.3 Production Ready

**Goal:** Ship the v1.2 feature-complete platform to production via a pull-only deploy model — GitHub Container Registry hosts the images, a single `docker-compose.yml` lives in the GitHub repo, and a fresh server can `git clone` (or even just `wget` the compose file), set a domain + secrets, and `docker compose up -d` with auto-TLS and zero source-code on the prod box.

**Target features:**

- **Pull-only deploy model** — Pre-built images on `ghcr.io/<org>/sms-{api,web}:<tag>`. Production server never sees app source; only compose file + env file + cert volume.
- **Multi-stage Dockerfile** — `apps/api` (build → runtime, drops dev deps + tooling, runs `node dist/main`), `apps/web` (Next.js standalone output).
- **Auto-TLS reverse proxy** — Likely Caddy (auto Let's Encrypt + 1-line config per site) or Traefik. Operator only sets domain.
- **Minimal-config secrets** — `.env.production.example` documents every required var; operator copies + fills (DB password, NEXTAUTH_SECRET, MinIO creds, domain). No Vault/Secrets Manager for v1.3.
- **DB migration strategy** — Prisma `migrate deploy` on container boot (vs `db:push` in dev), zero-downtime semantics for additive changes.
- **Health checks + restart policies** — Docker `HEALTHCHECK` directives, `/health` endpoints, graceful shutdown aligned with Phase 15 `ResilienceService`.
- **Logging + monitoring** — Structured JSON logs to stdout; SRS Prometheus exporter wired; optional log driver for aggregation.
- **GitHub Actions CI/CD** — Build + push to ghcr on tag; manual or auto-deploy via SSH or webhook.
- **Folder separation** — `deploy/` (or `ops/`) directory at repo root holds prod-only artifacts (compose, Caddyfile, .env example, scripts, README) so `apps/` stays dev-focused.
- **Tech-debt cleanup carried over from v1.2:**
  - StreamProcessor undefined cameraId defensive guard
  - Pre-existing API test failures (~23: auth/crypto ESM, recording manifest fMP4, srs callback mocks, cluster)
  - Phase 22 ↔ Phase 17 metadata gap — surface camera tags + description on recording playback page

**Key constraints:**
- Single-server self-hosted (per PROJECT.md), not Kubernetes.
- Production runs on Linux (currently dev'd on macOS) — image base + FFmpeg behavior must validate on Linux.
- Operator-friendly: minimum config, auto SSL renewal, single command deploy/update.
- Dev workflow must remain intact — adding `deploy/` should not contaminate `pnpm dev` or `pnpm build`.

## Current State

**Shipped:** v1.2 Self-Service, Resilience & UI Polish (2026-04-27) — 11 phases, 64 plans, 115 tasks
**In progress:** v1.3 Production Ready — Phase 23 complete (2026-04-27), 7 phases remain (24-30)
**Stack:** NestJS 11 + Next.js 15 + PostgreSQL 16 + Prisma 6 + Redis 7 + SRS v6 + FFmpeg 7 + MinIO + Better Auth

**v1.2 highlights:**
- **FFmpeg resilience** — SRS-restart pid-delta detection + bulk re-enqueue (jitter 0–30s), 60s health-check tick, graceful shutdown + boot re-enqueue, hot-reload Stream Profile to running cameras within 30s via Redis pub/sub for active+locked BullMQ jobs.
- **Camera maintenance + bulk UX** — Maintenance gate at StatusService suppresses notify/webhook with 30s debounce, asymmetric row-menu (Enter dialog with ≤200-char reason / Exit direct), expressive LIVE/REC/MAINT/OFFLINE pills, multi-select bulk toolbar (concurrency=5, partial-failure badges).
- **Recording playback** — `/app/recordings/[id]` route with HLS player + 24h timeline scrubber + hour-availability heatmap + cross-org enumeration closure (T-17-V4).
- **User self-service** — `/app/account` + `/admin/account` (Profile + Security + Plan & Usage tenant), MinIO avatars bucket with sharp-backed 256×256 WebP transcode, password change with `revokeOtherSessions`.
- **Multi-protocol ingest** — 4-protocol DTO allowlist (RTSP/RTMP/RTMPS/SRT), async codec probe pipeline (BullMQ `probe:{id}` dedup, 3 triggers: create / on-publish / retry), 3-layer duplicate prevention, RTMP push with platform-generated stream keys + SRS forward hook.
- **Camera metadata utilization** — Tags + description surfaced across DataTable column + Tags MultiSelect filter + view-stream-sheet Notes + map popup + webhook payload + audit diff + Dev Portal docs; `tagsNormalized` shadow column with GIN index for case-insensitive `hasSome` search; bulk Add/Remove tag endpoint with per-camera audit + cache invalidation.
- **DataTable + dashboard polish** — Team / Organizations / Cluster Nodes / Platform Audit migrations; tenant dashboard 6-card stat strip + IssuesPanel; super-admin 7 endpoints + 4 widgets (PlatformIssuesPanel / ClusterNodesPanel / StorageForecastCard / RecentAuditHighlights); map teardrop SVG marker + 16:9 popup preview.

**Tech debt status (resolved by Phase 23, 2026-04-27):**
- ✅ StreamProcessor undefined cameraId guard — `StreamGuardMetricsService` exposes refusal counter on `/api/srs/callbacks/metrics` (DEBT-01)
- ✅ Test suite green — 828 passed / 0 failed / 121 todo / 11 skipped; 121 todos tracked in `.planning/todos/v1.4-test-backfill.md` for v1.4 backfill (DEBT-02)
- ✅ SRS hls_use_fmp4 cold-boot — regression-lock tests added to both emit paths (DEBT-03)
- ✅ Phase 22 ↔ Phase 17 metadata gap — `/app/recordings/[id]` surfaces camera tags + description (DEBT-04)
- ✅ Migration baseline — single `0_init` Prisma migration with consolidated RLS replaces 8 hand-rolled SQL files; `db:reset` + `db:check-drift` scripts (DEBT-05)
- ⏳ CI gate (`.github/workflows/test.yml`) — workflow file shipped; first run + branch protection deferred until `gh repo create` (item #3 in 23-HUMAN-UAT.md)

**v1.3 work remaining (Phases 24-30):** Production deployment surface (multi-stage Docker, reverse proxy + TLS, GHCR push, operator UX, smoke test on clean VM)

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
*Last updated: 2026-04-27 after v1.2 milestone completion (Self-Service, Resilience & UI Polish — 11 phases, 64 plans, 115 tasks). All 22 v1.2 REQ-IDs satisfied; 1 audit-found enhancement (Phase 22→17 metadata) deferred to v1.3 backlog along with production-deployment scope. ROADMAP collapsed; REQUIREMENTS.md retired. Next: `/gsd-new-milestone` to scope v1.3 Production Ready.*
