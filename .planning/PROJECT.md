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

- ✓ Operator UX (bootstrap/update/backup/restore + super-admin CLI) — `bin/sms create-admin` (Better Auth scrypt, single-admin guard, --force idempotency), `deploy/scripts/{bootstrap,update,backup,restore}.sh` (atomic pre-flight migrate, offline pg_dump+MinIO+caddy_data archive, integrity-verified DR), README 5-step quickstart + BACKUP-RESTORE + TROUBLESHOOTING runbooks — v1.3 (Phase 29) — DEPLOY-17/18/19/20/21/23

- ✓ Smoke-test tooling for v1.3 GA gate — `deploy/SMOKE-TEST-LOG.md` operator-fillable template (105 lines, 7 H2 sections, 9 deferred-UAT rows), `deploy/scripts/verify-{nmap,deploy,playback,backup}.sh` (200/377/227/344 LOC, mode 100755), `deploy/scripts/smoke-test.sh` sequential wrapper (228 LOC) — authorship complete; live smoke run on clean cloud VM is operator/release work, persisted as 30-HUMAN-UAT.md — v1.3 (Phase 30) — DEPLOY-25/26

### Active

(Milestone v1.3 Production Ready — all 8 phases (23-30) complete. Awaiting `/gsd-audit-milestone v1.3` and `/gsd-complete-milestone` to archive.)

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
**Feature-complete:** v1.3 Production Ready — all 8 phases (23-30) complete (2026-04-29); awaiting milestone audit + archive before tagging GA
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

**Phase 24 highlights (Deploy Folder Structure + Dev Workflow Guardrails, 2026-04-27):**
- ✅ `deploy/` skeleton at repo root (`deploy/README.md` stub + `deploy/scripts/.gitkeep`) — placeholder for Phases 25-30 to fill in compose, Caddyfile, scripts, prod docs
- ✅ `apps/api/Dockerfile` → `apps/api/Dockerfile.dev` (R100 byte-identical rename via `git mv`) — frees `apps/api/Dockerfile` for Phase 25's production multi-stage build
- ✅ Root `.dockerignore` (12 grouped categories: Secrets, VCS, Deps, Build, Coverage, Planning, Data, IDE, Logs, Examples) with `!.env.example` whitelist correctly ordered after `.env.*` exclusion — closes Pitfall 8 BLOCKER for GA
- ✅ `scripts/dev-smoke.sh` — boots `pnpm dev`, probes api `:3003` + web `:3000`, status-tolerant (accepts 2xx-4xx for auth-guarded routes), traps EXIT for cleanup; manual-run gate per D-15
- ✅ CLAUDE.md `## Deploy Folder Convention` (5-rule guardrail, GSD-marker-wrapped) — durable convention lock that future Phase 25-30 subagents read at session boot
- 🔧 D-12 planning bug auto-corrected during D-22 verification: `dev-smoke.sh` `WEB_PORT` default `3002 → 3000` (CONTEXT.md mis-sourced web port from CORS allowlist instead of `apps/web/package.json` `--port 3000`); commit `05eef0a`

**Phase 25 highlights (Multi-Stage Dockerfiles + Image Hardening, 2026-04-27):**
- ✅ `apps/api/Dockerfile` — 4-stage prod build (deps → builder → prod-deps → runtime) on `node:22-bookworm-slim`; ffmpeg 5.1.x + tini 0.19.0 + curl + openssl + ca-certs; non-root `app:app` uid 1001 / gid 1001; HEALTHCHECK curl `/api/health`; `ENTRYPOINT ["/usr/bin/tini","--"]`; `CMD ["node","dist/main"]`
- ✅ `apps/web/Dockerfile` — 3-stage Next.js standalone (deps → builder → runtime); curl-only runtime (NO tini per D-07); non-root uid 1001 / gid 1001; HEALTHCHECK curl `/api/health`; `CMD ["node","apps/web/server.js"]`
- ✅ Per-app `.dockerignore` (api: keeps `src/prisma/migrations/` for Phase 26 init service; web: keeps `.next/standalone`, `.next/static`, `public/`); root `.dockerignore` baseline from Phase 24 inherited
- ✅ NestJS `HealthController` + `HealthModule` at `/api/health` (separate from guarded `/api/admin/health`); Next.js App Router handler at `apps/web/src/app/api/health/route.ts` (in-process, not rewritten); both return `{ok:true}` for liveness
- ✅ `apps/web/next.config.ts` — `outputFileTracingRoot: path.join(__dirname,'../../')` for pnpm monorepo standalone (precondition for `apps/web/server.js` runtime path)
- ✅ Multi-arch verified: api content size **400.77 MB arm64 / 419.83 MB amd64** (≤450 budget); web content size **100.11 MB arm64 / 99.99 MB amd64** (≤220 budget); ROADMAP §Phase 25 SC #1-4: 4/4 PASS on both platforms; threat model T-25-08..T-25-21: 10/10
- 🔧 In-plan hotfix: `apps/api/Dockerfile:91` `groupadd -r app` → `groupadd -r -g 1001 app` to align with web pattern (commit `bb36ade`); cosmetic CIS-style gid pinning, security gate (uid=1001 non-root) was already satisfied
- 📐 Image digests recorded in `25-VERIFICATION.md` as Phase 28 native amd64 CI regression baseline (±5% target)

**Phase 26 highlights (Production Compose + Migrate Init + Networking + Volumes, 2026-04-28):**
- ✅ `deploy/docker-compose.yml` — 7 services (postgres + redis + minio + sms-migrate + srs + api + web), 2 networks (edge + `internal: true` blocks egress), 5 named volumes (postgres_data, redis_data, minio_data, caddy_data forward-declared for Phase 27, hls_data); GHCR-only image refs (zero `build:` directives per DEPLOY-10); SRS port 1985 binds `127.0.0.1` only (Pitfall 13); 6 long-running services have `init: true` + `restart: unless-stopped` + `*default-logging` anchor (json-file 10m × 5); api `stop_grace_period: 30s` for FFmpeg drain
- ✅ `sms-migrate` init container reuses api image (D-02), chains `prisma migrate deploy && init-buckets.js && seed-stream-profile.js` exactly once with `restart: "no"`; api gates on `service_completed_successfully` (DEPLOY-14)
- ✅ `apps/api/src/scripts/init-buckets.ts` — idempotent MinIO bucket bootstrap (avatars public-read via `setBucketPolicy`, recordings stays private), `Client.bucketExists` guard, fail-fast `process.exit(1)` (DEPLOY-15)
- ✅ `apps/api/src/scripts/seed-stream-profile.ts` — per-org `streamProfile.count` guard, default 1080p H.264 / 2500kbps / 25fps profile with `isDefault: true`, fresh-VM no-orgs friendly path (DEPLOY-16); schema-correction landed: D-13 sample's stale field names (`videoCodec`/`width`/`height`/`framerate`/`gopSize`) replaced with actual schema fields (codec/resolution/fps/videoBitrate/audioCodec/audioBitrate)
- ✅ `deploy/.env.production.example` — 4-section D-25 template (Required / Image refs / Defaults / Computed), 7 SC #6 vars + GHCR_ORG + JWT_PLAYBACK_SECRET + ADMIN_EMAIL/PASSWORD; 7 `change-me-*` placeholders for init-secrets.sh detection
- ✅ `deploy/scripts/init-secrets.sh` — idempotent `openssl rand -base64 32` generator with BSD/GNU sed shim (macOS dev compatibility), `chmod 600 deploy/.env` (Pitfall 8 mitigation), DOMAIN/GHCR_ORG/ADMIN_EMAIL excluded from SECRET_VARS array (operator-supplied identifiers, never auto-generated); end-to-end smoke: first run generates 6 secrets, second run skips all 6 — fully idempotent (DEPLOY-22)
- ✅ Static validation: `docker compose config --quiet` exits 0 against synthetic env file; 14/14 static assertions PASS (port topology, depends_on chain, volume declarations, image-only refs, no `host.docker.internal`, no legacy `version: '3'`); user-approved checkpoint
- 📐 Phase 30 flags: (a) verifier-script regex assumed short-form `127.0.0.1:1985`, but `docker compose config` renders ports in long-form (`host_ip: 127.0.0.1` + `target: 1985` adjacent) — re-test against actual `docker port` output; (b) `caddy_data` forward-declared for Phase 27 join, `docker compose config` strips orphan from rendered output (source has 5, rendered shows 4)

**Phase 27 highlights (Caddy Reverse Proxy + Auto-TLS, 2026-04-28):**
- ✅ `deploy/Caddyfile` — 49 lines, 5 mutually-exclusive handle blocks (`/api/*` + `/socket.io/*` → api:3003, `/avatars/*` + `/snapshots/*` → minio:9000, catch-all → web:3000), global ACME options with prod LE default + staging-CA toggle via `${ACME_CA}`, `email {$ACME_EMAIL}`, `admin off`, `servers { protocols h1 h2 }` (HTTP/3 disabled per D-12), `caddy validate --adapter caddyfile` exit 0
- ✅ `deploy/docker-compose.yml` caddy service — `caddy:2.11` image, `:80/tcp` + `:443/tcp` (no `/udp`), `edge` + `internal` networks (D-17), `caddy_data` + new `caddy_config` named volumes + `Caddyfile:ro` mount, healthcheck `wget --spider` with 30s `start_period`, `depends_on api+web service_healthy`; additions-only patch + 18/18 grep guards PASS
- ✅ `apps/api/src/recordings/minio.service.ts` — new `buildPublicUrl(bucket, objectName, version)` private helper consumed by both `getAvatarUrl` + `getSnapshotUrl`; reads `MINIO_PUBLIC_URL` (browser-facing) instead of deriving scheme from `MINIO_USE_SSL` (api↔minio internal SDK flag); closes T-27-MIXED mixed-content blocker (D-26); SDK init byte-identical, 5 new vitest URL-composition tests including 2 `^https://` regression guards (10/10 pass)
- ✅ `deploy/.env.production.example` — adds `ACME_EMAIL` + `MINIO_PUBLIC_URL` to Section 1 (Required), `ACME_CA` to Section 3 (Defaults); compose api service env block exports `MINIO_PUBLIC_URL`; `init-secrets.sh` untouched (operator-supplied identifiers, never auto-generated)
- ✅ `deploy/DOMAIN-SETUP.md` — 113-line operator-facing setup doc per DEPLOY-24, 5 H2 sections (DNS A-record / Port 80 reachability / Propagation / Staging-CA toggle / Common Errors), D-28 Cloudflare gray→orange addendum, 7-row Common Errors table mapping log message → cause → fix; references all 3 env vars + edge+internal networks; lives at `deploy/` root (NOT `deploy/docs/`)
- ✅ `deploy/scripts/verify-phase-27.sh` — 115 LOC, mode 0755, bundles D-24 checkpoint #1 (`docker compose config --quiet`) + #2 (`caddy validate` via `docker run --rm caddy:2.11`) + 25 structural greps across all 4 Phase 27 artifacts; lab-only checkpoints #3-6 explicitly NOT executed (Phase 30 territory)
- 📐 Phase 30 deferred (4 items in `27-HUMAN-UAT.md`): live LE cert issuance + 308 redirect (SC #1), live `wss://` 101 upgrade to NotificationsGateway + StatusGateway (SC #3), cert persistence across `docker compose down/up` (SC #4), re-run `verify-phase-27.sh` on healthy Docker host. All 4 explicitly scoped to Phase 30 clean-VM smoke per DOMAIN-SETUP.md footer + 27-05 SUMMARY.

**Phase 28 highlights (GitHub Actions CI/CD → GHCR, 2026-04-28):**
- ✅ `.github/workflows/build-images.yml` — matrix `app: [api, web]` parallel build/smoke/push pipeline; `docker/build-push-action@v6` with `load: true` → smoke gate via `bash .github/scripts/smoke-${{ matrix.app }}.sh smoke-${{ matrix.app }}:latest` → `push: true` on non-PR; `actions/attest-build-provenance@v2` attaches sigstore SLSA Build L3 provenance to every pushed image
- ✅ `.github/workflows/release.yml` — tag-triggered `v*.*.*`, auto-changelog from commits, body includes both image refs + `gh attestation verify` cmds + `docker compose pull && up -d` upgrade snippet, prerelease auto-flag for `-(alpha|beta|rc|test)` suffixes; `permissions: contents: write` only (strict separation from build-images.yml)
- ✅ `.github/scripts/smoke-{api,web}.sh` — encode Phase 25 D-19 manual checklist as automated CI gates (non-root UID, FFmpeg apt, tini install, Next.js standalone outputFileTracingRoot) — fail at smoke step before any GHCR pollution
- ✅ Live verification on real GHCR (`Paradoxicez/sms-app`): 9/9 checkpoints PASS — prerelease v1.3.0-test pushed both images with attestation, anonymous `docker pull` succeeded (Pitfall 11 ✓), stable v1.3.0 produced exactly the 4-tag scheme `[v1.3.0, v1.3, sha-14f638d, latest]`, PR build skipped GHCR push, Pitfall 8 leak check returned 0 `.env` layers
- 🔧 In-plan hotfix: `metadata-action` `pattern={{version}}` → `pattern=v{{version}}` to restore documented 4-tag `vX.Y.Z` format on stable releases (commit `7b7cb8f`)
- 🔧 Phase 23 latent CI bugs surfaced + fixed inline (3 commits — `168f6e5`/`6caa372`/`14f638d`): drop DATABASE_URL collision in test.yml, conditional `.env` source in `db:check-drift`, `createdb` shadow DB step before drift check
- 📐 Three documented limitations defer to follow-up (cosmetic, no production impact): L-28-A metadata-action prerelease v-prefix suppression, L-28-B release.yml body capital-P + prerelease-v ref discrepancy, L-28-C linux/amd64-only image (Apple Silicon dev needs `--platform`)

**Phase 30 highlights (Smoke Test on Clean VM — v1.3 GA gate, 2026-04-29):**
- ✅ `deploy/SMOKE-TEST-LOG.md` — operator-fillable smoke run template, 105 lines, 7 H2 sections (Run Metadata / Verifier Results / Manual UI Checklist / Drift / Evidence / Sign-off / Redaction notice), 4 SC rows + 9 deferred-UAT rows from Phases 27/29, 7 manual UI steps; redaction notice covers ADMIN_PASSWORD/RTSP_TEST_URL/VM_IP/LE serials per T-30-01
- ✅ `deploy/scripts/verify-nmap.sh` — laptop-side TCP+UDP port-lockdown verifier (200 LOC), `--reason` flag on both scans, asserts the 10+2 port contract for v1.3 GA (TCP 22/80/443/1935/8080 OPEN; TCP 5432/6379/9000/9001/1985 CLOSED; UDP 8000+10080 OPEN), no 443/udp scan per D-15
- ✅ `deploy/scripts/verify-deploy.sh` — VM-side post-bootstrap 7-step verifier (377 LOC), folds 6 deferred UAT items (Phase 27 SC#1/#3/#4 + Phase 29 SC#1/#2/#3); parses `Bootstrap time:` ≤600s, `${DC} down` WITHOUT `-v` (T-30-04 mitigated), backgrounded /api/health probe asserts longest_outage ≤ 5s during `update.sh` recycle, invokes `verify-phase-27.sh`
- ✅ `deploy/scripts/verify-playback.sh` — VM-side post-UI playback verifier (227 LOC), wss://101 upgrade with `openssl rand -base64 16` Sec-WebSocket-Key, `mc ls.*local/recordings` asserts ≥1 `.ts` AND 0 `.mp4` (SRS v6 codec limit honored), no hardcoded RTSP credentials
- ✅ `deploy/scripts/verify-backup.sh` — VM-side backup/restore round-trip (344 LOC), pg_count for 5 tables (User/Organization/Camera/Recording/RecordingArchive), backup.sh + restore.sh `--yes` round-trip, sha256-of-sorted-listing for 3 MinIO buckets (avatars/snapshots/recordings), TLS cert preservation via `certificate obtained` log scan
- ✅ `deploy/scripts/smoke-test.sh` — sequential wrapper (228 LOC), pre-flight checks all 4 verifiers exist, MAX_RC aggregator, manual gate with `read -r _` between verify-deploy and verify-playback, verify-nmap is INFORMATIONAL only (printed, never invoked) per Plan 06 contract
- ✅ `.gitignore` +6 lines: `deploy/smoke-evidence/` (operator's local-only screenshots/raw logs stay out of git per T-30-05); SMOKE-TEST-LOG.md DOES ship — only binary evidence does not
- ✅ `30-VERIFICATION.md` — verifier report status `human_needed`, 6/6 must-haves verified, all 6 deliverables ship correct; 3 HUMAN-UAT items persist for the actual smoke run on a real cloud VM
- 📐 Phase 30 is the GA-gate ENABLER, not the GA event itself: authorship complete; live smoke run on a clean Ubuntu 22.04 VM with real DNS+RTSP requires operator/release work tracked via `30-HUMAN-UAT.md` (will surface in `/gsd-progress` and `/gsd-audit-uat`)

**v1.3 work remaining:** none — all 8 milestone phases (23-30) complete; awaiting `/gsd-audit-milestone v1.3` + `/gsd-complete-milestone` to archive and tag GA

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
*Last updated: 2026-04-29 after Phase 30 completion (Smoke Test Tooling — 6 plans, DEPLOY-25/26 statically verified; 6/6 must-haves shipped; 3 HUMAN-UAT items deferred to operator/release work on a real clean VM). Milestone v1.3 Production Ready is feature-complete (8/8 phases, 23-30) — awaiting `/gsd-audit-milestone v1.3` then `/gsd-complete-milestone` before tagging GA. Note: 5 Phase-29 HUMAN-UAT items + 4 Phase-27 deferred items are subsumed into the Phase 30 smoke run rather than re-tested here.*
