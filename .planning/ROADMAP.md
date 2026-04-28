# Roadmap: SMS Platform

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 + 999.1 (shipped 2026-04-16) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 UI Overhaul** — Phases 8-13 (shipped 2026-04-18) — [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Self-Service, Resilience & UI Polish** — Phases 14-22 (shipped 2026-04-27) — [archive](milestones/v1.2-ROADMAP.md)
- 🚧 **v1.3 Production Ready** — Phases 23-30 (planning_complete 2026-04-27)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-7 + 999.1) — SHIPPED 2026-04-16</summary>

- [x] Phase 1: Foundation & Multi-Tenant (6/6 plans)
- [x] Phase 2: Stream Engine & Camera Management (6/6 plans)
- [x] Phase 3: Playback & Security (3/3 plans)
- [x] Phase 4: Developer Experience (5/5 plans)
- [x] Phase 5: Dashboard & Monitoring (6/6 plans)
- [x] Phase 6: SRS Cluster & Scaling (3/3 plans)
- [x] Phase 7: Recordings (5/5 plans)
- [x] Phase 999.1: Role-based Sidebar Navigation (5/5 plans)

</details>

<details>
<summary>✅ v1.1 UI Overhaul (Phases 8-13) — SHIPPED 2026-04-18</summary>

- [x] Phase 8: Foundation Components (2/2 plans)
- [x] Phase 9: Layout & Login (3/3 plans)
- [x] Phase 10: Admin Table Migrations (3/3 plans)
- [x] Phase 11: Camera Management (3/3 plans)
- [x] Phase 12: Recordings (2/2 plans)
- [x] Phase 13: Hierarchy & Map (2/2 plans)

</details>

<details>
<summary>✅ v1.2 Self-Service, Resilience & UI Polish (Phases 14-22) — SHIPPED 2026-04-27</summary>

- [x] Phase 14: Bug Fixes & DataTable Migrations (3/3 plans) — completed 2026-04-18
- [x] Phase 15: FFmpeg Resilience & Camera Maintenance (4/4 plans) — completed 2026-04-19
- [x] Phase 16: User Self-Service (3/3 plans) — completed 2026-04-19
- [x] Phase 17: Recording Playback & Timeline (5/5 plans) — completed 2026-04-19
- [x] Phase 18: Dashboard & Map Polish (7/7 plans) — completed 2026-04-21
- [x] Phase 19: Camera input validation + multi-protocol (RTMP/RTMPS) (9/9 plans) — completed 2026-04-22
- [x] Phase 19.1: RTMP push ingest with platform-generated stream keys (8/8 plans, INSERTED) — completed 2026-04-23
- [x] Phase 20: Cameras UX bulk actions, maintenance toggle, copy ID, expressive status (4/4 plans) — completed 2026-04-25
- [x] Phase 21: Hot-reload Stream Profile changes to running cameras (6/6 plans) — completed 2026-04-25
- [x] Phase 21.1: Active-job collision fix for hot-reload restart (3/3 plans, INSERTED gap closure) — completed 2026-04-25
- [x] Phase 22: Camera metadata utilization — surface tags & description (12/12 plans) — completed 2026-04-26

</details>

### 🚧 v1.3 Production Ready (Active)

Goal: Take v1.2's feature-complete platform and ship it to production via a pull-only deploy model. Pre-built images on GHCR, single `docker-compose.yml` in repo, Caddy auto-TLS, Prisma migrate init container, operator scripts. Fresh Linux VM → set domain + secrets → `docker compose up -d` → working HTTPS app in <10 minutes with zero source on the prod box.

- [x] **Phase 23: Tech Debt Cleanup + Phase 0 Prerequisites** — Convert raw SQL to Prisma migration history, StreamProcessor undefined cameraId guard, 23-test triage, hls_use_fmp4 cold-boot fix, Phase 22→17 metadata wiring (completed 2026-04-27)
- [x] **Phase 24: Deploy Folder Structure + Dev Workflow Guardrails** — Rename Dockerfile→Dockerfile.dev, create `deploy/` skeleton, root `.dockerignore`, dev smoke test (completed 2026-04-27)
- [x] **Phase 25: Multi-Stage Dockerfiles + Image Hardening** — Production api Dockerfile (4 stages, FFmpeg+tini, non-root), web Dockerfile (Next.js standalone), per-app .dockerignore (completed 2026-04-27)
- [x] **Phase 26: Production Compose + Migrate Init + Networking + Volumes** — `deploy/docker-compose.yml` with image refs, two-network split, sms-migrate init service, MinIO bucket auto-create + Stream Profile seed (completed 2026-04-28)
- [x] **Phase 27: Caddy Reverse Proxy + Auto-TLS** — `deploy/Caddyfile` (same-origin), Caddy service with persistent volumes, DOMAIN-SETUP.md (completed 2026-04-28)
- [x] **Phase 28: GitHub Actions CI/CD → GHCR** — `build-images.yml` (matrix [api, web], amd64, GH Cache v2), `release.yml`, semver+latest+sha tagging, build provenance attestation (completed 2026-04-28)
- [ ] **Phase 29: Operator UX (bootstrap/update/backup/restore + super-admin CLI)** — `bin/sms create-admin`, 4 deploy scripts, `deploy/README.md` 5-step quickstart
- [ ] **Phase 30: Smoke Test on Clean VM (gates v1.3 GA)** — Provision DO/Hetzner droplet, sparse-checkout deploy/, run bootstrap.sh, verify <10min cold deploy, nmap port lockdown

## Phase Details

### Phase 23: Tech Debt Cleanup + Phase 0 Prerequisites
**Goal**: Tech debt that production amplifies silently is closed before any deploy work begins; the codebase is in a state where `prisma migrate deploy` against a fresh DB produces a v1.2-equivalent schema (RLS included), CI is green, FFmpeg children cannot leak from a stuck-camera bug, and SRS boots cleanly from cold without a manual config edit.
**Depends on**: Nothing (first phase of v1.3, builds on v1.2 shipped state)
**Requirements**: DEBT-01, DEBT-02, DEBT-03, DEBT-04, DEBT-05
**Success Criteria** (what must be TRUE):
  1. `prisma migrate deploy` against an empty Postgres database produces a schema byte-equivalent to v1.2 production (including RLS policies on Member, Invitation, UserPermissionOverride, etc.) — verified by `prisma migrate diff` returning no drift
  2. `vitest run` for the api package passes 100% green; the StreamProcessor undefined-cameraId guard has unit + integration coverage and emits a metric on the fast-fail path
  3. SRS container boots from cold (no pre-existing fMP4 m3u8 on disk) with no error in logs and serves first HLS segment within 30s of camera publish
  4. `/app/recordings/[id]` recording playback page surfaces the parent camera's tags (badge row) and description (line-clamped block); v1.2 audit gap closed
  5. CI workflow on every push to main runs `pnpm test` and locks merge on red — future failures cannot land
**Plans:** 6/6 plans complete
Plans:
- [x] 23-01-PLAN.md — DEBT-05 (partial): Squash hand-rolled SQL into single 0_init migration; replace db:push with db:reset; add db:check-drift; update CLAUDE.md (Wave 1)
- [x] 23-02-PLAN.md — DEBT-01: StreamGuardMetricsService + processor wiring + /metrics endpoint extension + unit/integration tests (Wave 1)
- [x] 23-03-PLAN.md — DEBT-03: Regression-lock tests for hls_use_fmp4 absence in both SRS emit paths (Wave 2)
- [x] 23-04-PLAN.md — DEBT-04: Recording playback page surfaces parent camera tags + description (closes Phase 22↔17 gap) (Wave 2)
- [x] 23-06-PLAN.md — DEBT-05 (completion): Update setup-test-db.sh to use prisma migrate deploy; BLOCKING checkpoint verifies cold-deploy + drift exit 0; delete 8 hand-rolled migration directories + 2 standalone RLS files (Wave 2, has user checkpoint)
- [x] 23-05-PLAN.md — DEBT-02 + CI gate: .github/workflows/test.yml (postgres 16 + drift check) + engines.pnpm + branch protection + v1.4 backlog (Wave 3, has user checkpoint)
*Note: `/health` endpoint already exists in api (`apps/api/src/admin/admin.controller.ts:14` + audit interceptor skip); not in scope for this phase.*

### Phase 24: Deploy Folder Structure + Dev Workflow Guardrails
**Goal**: A `deploy/` directory exists at the repo root holding all production-only artifacts, the dev Dockerfile is renamed so the production Dockerfile can co-locate without ambiguity, and a root-level `.dockerignore` prevents secrets/state/planning leakage into any future image build context. The local `pnpm dev` workflow is byte-identical to the v1.2 experience.
**Depends on**: Phase 23 (tech debt blocks clean cold-deploy; structural moves should land on green CI)
**Requirements**: (none — this is preventive structural work that enables Phases 25-30 without contaminating the dev experience; no v1.3 REQ-IDs land here directly)
**Success Criteria** (what must be TRUE):
  1. `pnpm dev` (root) launches the dev stack identically to before Phase 24 — same ports, same hot-reload, same DB connection; no developer notices a behavioral change
  2. The repo contains a `deploy/` directory at the root with placeholder subfolders (e.g. `deploy/scripts/`, `deploy/docs/`) that subsequent phases populate; `apps/` remains dev-focused
  3. `apps/api/Dockerfile` is renamed to `apps/api/Dockerfile.dev` (used by the existing dev compose); a root `.dockerignore` prevents `.env*`, `node_modules`, `.planning/`, `*.log`, and build artifacts from being copied into any image build context
  4. `git ls-files deploy/` returns the new skeleton; CI lint/build still passes
**Plans:** 5/5 plans complete
Plans:
- [x] 24-01-PLAN.md — Create deploy/ skeleton (deploy/README.md stub + deploy/scripts/.gitkeep) (Wave 1)
- [x] 24-02-PLAN.md — git mv apps/api/Dockerfile → apps/api/Dockerfile.dev (Wave 1)
- [x] 24-03-PLAN.md — Create root .dockerignore with comprehensive Pitfall-8 patterns (Wave 1)
- [x] 24-04-PLAN.md — Create scripts/dev-smoke.sh (root monorepo smoke test for pnpm dev) (Wave 1)
- [x] 24-05-PLAN.md — Add CLAUDE.md ## Deploy Folder Convention guardrail + D-22 BLOCKING manual checklist (Wave 2, has user checkpoint)

### Phase 25: Multi-Stage Dockerfiles + Image Hardening
**Goal**: Both production images build locally from a clean checkout, run as non-root with proper PID 1 handling, contain only the runtime dependencies they need (FFmpeg + tini for api; Next.js standalone for web), and fit within the size budget set by research (≤450MB api, ≤220MB web). The images are reproducible and ready for CI to push to GHCR.
**Depends on**: Phase 24 (deploy folder structure must exist; dev Dockerfile must be renamed before prod Dockerfile lands)
**Requirements**: DEPLOY-01, DEPLOY-02
**Success Criteria** (what must be TRUE):
  1. `docker build -f apps/api/Dockerfile .` from the repo root produces an image ≤ 450 MB (verified via `docker images`) using `node:22-bookworm-slim` runtime, with FFmpeg 7.x and tini installed
  2. `docker run --rm <api-image> id` shows the process running as a non-root UID; `docker run --rm <api-image> ffmpeg -version` confirms FFmpeg is on PATH
  3. `docker build -f apps/web/Dockerfile .` produces an image ≤ 220 MB using Next.js standalone output with `outputFileTracingRoot` configured for the pnpm monorepo; `docker run --rm <web-image>` boots and serves on port 3000 as non-root
  4. Both images have per-app `.dockerignore` that excludes test files, source maps where appropriate, and `.planning/` content; build context size is minimized
**Plans:** 6/6 plans complete
Plans:
- [x] 25-01-PLAN.md — api HealthController + HealthModule (D-01) (Wave 1)
- [x] 25-02-PLAN.md — web /api/health Next.js route handler (D-02) (Wave 1)
- [x] 25-03-PLAN.md — apps/web/next.config.ts add outputFileTracingRoot (D-18) (Wave 1)
- [x] 25-04-PLAN.md — apps/api/Dockerfile (4-stage) + apps/api/.dockerignore (D-05..D-07, D-10, D-12..D-15) (Wave 2)
- [x] 25-05-PLAN.md — apps/web/Dockerfile (3-stage) + apps/web/.dockerignore (D-11, D-16..D-17) (Wave 2)
- [x] 25-06-PLAN.md — D-19 11-step manual verification + must_haves checkpoint (Wave 3, has user checkpoint)

### Phase 26: Production Compose + Migrate Init + Networking + Volumes
**Goal**: A single `deploy/docker-compose.yml` brings up the entire production stack on any Linux host with Docker Compose v2 — Postgres + Redis + MinIO + SRS + sms-migrate (init) + api + web — using GHCR image references only (no `build:` context). The two-network topology hides stateful services from the host, the migrate service runs once before api boots, and first-run init creates required MinIO buckets + seeds a default Stream Profile.
**Depends on**: Phase 25 (compose references images that Phase 25 builds)
**Requirements**: DEPLOY-10, DEPLOY-11, DEPLOY-12, DEPLOY-13, DEPLOY-14, DEPLOY-15, DEPLOY-16, DEPLOY-22
**Success Criteria** (what must be TRUE):
  1. `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d` (with valid env file) brings up the full stack on a clean local Linux VM in under 2 minutes; all services pass healthchecks
  2. `sms-migrate` runs `prisma migrate deploy` exactly once with `restart: "no"`, exits 0, and api only starts after `service_completed_successfully`; re-running `up -d` does not re-trigger destructive migrations
  3. `nmap -p 5432,6379,9000,9001,1985 localhost` from the host shows all five ports closed externally — postgres/redis/minio admin/SRS admin are reachable only from inside the compose networks; SRS 1985 binds to 127.0.0.1 only
  4. Named volumes `postgres_data`, `redis_data`, `minio_data`, `caddy_data`, `hls_data` survive `docker compose down && docker compose up -d` with data intact; FFmpeg child processes are reaped (no zombies) thanks to `init: true`
  5. First-run init creates the `avatars` and `recordings` MinIO buckets and seeds a default Stream Profile if no profiles exist; subsequent boots are idempotent (no duplicate buckets/profiles)
  6. `deploy/.env.production.example` documents every required variable (DOMAIN, DB_PASSWORD, NEXTAUTH_SECRET, BETTER_AUTH_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, IMAGE_TAG); `deploy/scripts/init-secrets.sh` generates 32-char random values and chmods 600
**Plans:** 4/4 plans complete
Plans:
- [x] 26-01-PLAN.md — Init scripts: apps/api/src/scripts/init-buckets.ts (DEPLOY-15) + seed-stream-profile.ts (DEPLOY-16) (Wave 1)
- [x] 26-02-PLAN.md — deploy/.env.production.example template + deploy/scripts/init-secrets.sh idempotent secret generator (DEPLOY-22) (Wave 1)
- [x] 26-03-PLAN.md — deploy/docker-compose.yml: 7 services + 2 networks + 5 named volumes (DEPLOY-10, 11, 12, 13, 14, 15, 16) (Wave 2)
- [x] 26-04-PLAN.md — docker compose config --quiet validation + user checkpoint (Wave 3, has user checkpoint)

### Phase 27: Caddy Reverse Proxy + Auto-TLS
**Goal**: A single hostname terminates TLS automatically via Let's Encrypt, routes `/api/*` and `/socket.io/*` to api:3003 and everything else to web:3000 (same-origin pattern eliminates cookie/CORS pain), and persists certificates across container restarts so `docker compose down/up` does not trigger ACME rate-limit lockout. WebSocket pass-through works for both NotificationsGateway and StatusGateway.
**Depends on**: Phase 26 (Caddy needs the `edge` network and api/web service names defined in the compose)
**Requirements**: DEPLOY-06, DEPLOY-07, DEPLOY-08, DEPLOY-09, DEPLOY-24
**Success Criteria** (what must be TRUE):
  1. Setting `DOMAIN=example.com` in `.env`, pointing example.com's A-record at the host, and running `docker compose up -d` results in a valid Let's Encrypt certificate within 60s; `https://example.com` loads the web app and `http://example.com` 301-redirects to HTTPS
  2. With staging-CA toggle enabled in Caddyfile, the same flow produces a Let's Encrypt staging cert (no rate-limit risk) — operators can debug DNS/firewall without burning prod quota
  3. WebSocket reaches `NotificationsGateway` and `StatusGateway` end-to-end via Caddy: `wss://example.com/socket.io/?EIO=4&transport=websocket` upgrades successfully and receives notify/status events; tested by logging into the deployed app and triggering a camera status change
  4. `caddy_data` + `caddy_config` named volumes persist certs across `docker compose down/up` cycles; the second `up` does not trigger ACME re-issuance
  5. `deploy/DOMAIN-SETUP.md` documents DNS A-record requirements, port 80 reachability for ACME HTTP-01, propagation expectations, and the staging-CA toggle for debugging
**Plans:** 5/5 plans complete
Plans:
- [x] 27-01-PLAN.md — Author deploy/Caddyfile (5 handle blocks + global ACME options + admin off + protocols h1 h2) (Wave 1)
- [x] 27-02-PLAN.md — Patch deploy/docker-compose.yml: add caddy service (edge+internal nets, caddy_data + caddy_config + Caddyfile:ro) + new caddy_config volume (Wave 1)
- [x] 27-03-PLAN.md — Fix mixed-content blocker (D-26): MinioService.buildPublicUrl helper reads MINIO_PUBLIC_URL; getAvatarUrl + getSnapshotUrl emit https:// on TLS pages; vitest regression guard (Wave 1)
- [x] 27-04-PLAN.md — Patch deploy/.env.production.example with ACME_EMAIL + ACME_CA + MINIO_PUBLIC_URL; wire MINIO_PUBLIC_URL through compose api service env block (Wave 1)
- [x] 27-05-PLAN.md — Author deploy/DOMAIN-SETUP.md (D-21 5 sections + D-28 Cloudflare note) + deploy/scripts/verify-phase-27.sh (D-24 #1+#2+structural greps); operator checkpoint (Wave 2, has user checkpoint)

### Phase 28: GitHub Actions CI/CD → GHCR
**Goal**: Pushing a `vX.Y.Z` git tag triggers a GitHub Actions workflow that builds both production images, pushes them to `ghcr.io/<org>/sms-{api,web}` with semver + latest + sha tags, and attaches build provenance attestation. Operators on a production server can `docker compose pull && docker compose up -d` against a stable, signed-by-attestation image.
**Depends on**: Phase 25 (CI builds the Dockerfiles produced by Phase 25)
**Requirements**: DEPLOY-03, DEPLOY-04, DEPLOY-05
**Success Criteria** (what must be TRUE):
  1. Pushing a test tag `v1.3.0-test` triggers `.github/workflows/build-images.yml` (matrix `app: [api, web]`); both images appear at `ghcr.io/<org>/sms-api:v1.3.0-test` and `ghcr.io/<org>/sms-web:v1.3.0-test` within 10 minutes (single-arch linux/amd64, GH Cache v2)
  2. Each pushed image carries the four tag variants via `docker/metadata-action@v5`: `v1.3.0-test`, `v1.3` (major.minor), `latest` (on main), and `sha-<7-char-commit>` — verified by `docker inspect ghcr.io/<org>/sms-api:v1.3` showing all aliases
  3. Build provenance attestation is attached to both images via `actions/attest-build-provenance`; `gh attestation verify oci://ghcr.io/<org>/sms-api:v1.3.0-test --owner <org>` succeeds
  4. `release.yml` creates a GitHub Release on tag push, listing the published image references in the release notes; auth uses `${{ secrets.GITHUB_TOKEN }}` (no PAT)
**Plans:** 4/4 plans complete
Plans:
- [x] 28-01-PLAN.md — Smoke scripts: .github/scripts/smoke-{api,web}.sh asserting Phase 25 D-19 invariants on every CI build (Wave 1)
- [x] 28-02-PLAN.md — release.yml: tag-triggered GitHub Release with auto-notes + custom body (image refs + attestation verify + compose pull snippet) + prerelease auto-flag (Wave 1)
- [x] 28-03-PLAN.md — build-images.yml: matrix [api, web] build/smoke/push to GHCR with semver+latest+sha tags via metadata-action@v5, OCI labels, GH Cache v2, sigstore attestation via attest-build-provenance@v2 (Wave 2)
- [x] 28-04-PLAN.md — deploy/.env.production.example GHCR_ORG comment expansion (D-18) + 28-04-VERIFICATION.md 9-checkpoint runbook + live operator checkpoint (D-22 #1-9, D-19 manual GHCR public toggle) (Wave 3, has user checkpoint)

### Phase 29: Operator UX (bootstrap/update/backup/restore + super-admin CLI)
**Goal**: A developer who has never seen the codebase can clone the repo (or sparse-checkout `deploy/`), copy the env example, run a single `bootstrap.sh`, and reach a working super-admin login URL in under 10 minutes. Day-2 operations — updating to a new image tag, taking a backup, restoring from a backup — each fit on a single command and produce auditable, idempotent results.
**Depends on**: Phase 26 (scripts wrap the compose flow; need migrate/seed semantics nailed first)
**Requirements**: DEPLOY-17, DEPLOY-18, DEPLOY-19, DEPLOY-20, DEPLOY-21, DEPLOY-23
**Success Criteria** (what must be TRUE):
  1. `docker compose exec api bin/sms create-admin --email <e> --password <p>` (or interactive prompt) creates a super-admin user with system-org membership and a bcrypt-hashed password; the user can log in immediately at the deployed URL
  2. `bash deploy/scripts/bootstrap.sh` on a fresh VM (after `.env` is filled) validates required env vars, pulls latest images, runs migrate + first-run seeds, brings up the stack, prints the deployed URL — completes in under 10 minutes wall-clock
  3. `bash deploy/scripts/update.sh v1.3.1` updates `IMAGE_TAG`, pulls new images, runs migrate, recycles services in dependency order (postgres → redis → minio → migrate → api → web → caddy) without dropping in-flight requests for longer than the configured grace period
  4. `bash deploy/scripts/backup.sh` produces a single timestamped archive (e.g. `sms-backup-2026-04-27T1200.tar.gz`) containing pg_dump output + MinIO mc-mirror + caddy_data tar; `bash deploy/scripts/restore.sh <archive>` consumes that archive and rebuilds all volumes; round-trip preserves all org/user/camera/recording data byte-equivalent
  5. `deploy/README.md` documents the 5-step quickstart (clone → init-secrets → fill domain → bootstrap → first-login) and proves the <10-minute claim with a recorded walkthrough or timing log
**Plans:** 5/6 plans executed
Plans:
- [x] 29-01-PLAN.md — DEPLOY-17: bin/sms CLI (apps/api/src/cli/sms.ts) + bash wrapper + Dockerfile cross-touch (Wave 1)
- [x] 29-02-PLAN.md — DEPLOY-18: deploy/scripts/bootstrap.sh first-run orchestrator (Wave 2)
- [x] 29-03-PLAN.md — DEPLOY-19: deploy/scripts/update.sh atomic image-tag upgrade (Wave 2)
- [x] 29-04-PLAN.md — DEPLOY-20: deploy/scripts/backup.sh offline atomic backup (Wave 2)
- [x] 29-05-PLAN.md — DEPLOY-21: deploy/scripts/restore.sh integrity-verified restore (Wave 2)
- [ ] 29-06-PLAN.md — DEPLOY-23: deploy/README.md (overwrite stub) + BACKUP-RESTORE.md + TROUBLESHOOTING.md (Wave 3)

### Phase 30: Smoke Test on Clean VM (gates v1.3 GA)
**Goal**: An external, never-touched-the-codebase Linux VM is provisioned, the deploy folder is sparse-checked-out (or the repo is cloned), DNS is configured, `bootstrap.sh` is run, and within 10 minutes the operator can log in at `https://<domain>`, register a camera, watch RTSP→HLS playback in the browser, see a recording archive in MinIO, and observe live WebSocket status events. Port lockdown is verified externally with nmap. This phase is the v1.3 GA gate — only after it passes does the milestone ship.
**Depends on**: Phases 26 + 27 + 28 + 29 (compose, Caddy, GHCR images, operator scripts must all work together)
**Requirements**: DEPLOY-25, DEPLOY-26
**Success Criteria** (what must be TRUE):
  1. A fresh DigitalOcean or Hetzner droplet (Ubuntu 22.04 LTS, 4GB RAM, Docker pre-installed) is provisioned, the `deploy/` directory is sparse-checked-out, `.env` is filled, DNS A-record is set, `bootstrap.sh` is run — total wall-clock from `ssh` first-login to "operator can log in at HTTPS URL" is under 10 minutes
  2. End-to-end smoke test passes on the deployed VM: super-admin login → register a test camera (RTSP) → camera transitions to LIVE → click play in browser → HLS segments load and play → toggle Record → recording archive appears in MinIO → status changes broadcast over WebSocket to the dashboard in real time
  3. `nmap -p 22,80,443,1935,8080,8000,10080,5432,6379,9000,9001,1985 <vm-public-ip>` from an external machine shows ONLY 22 (SSH) + 80 (HTTP→HTTPS redirect) + 443 (HTTPS) + 1935 (RTMP ingest) + 8080 (SRS HTTP) + 8000/udp (WebRTC) + 10080/udp (SRT) open; postgres 5432, redis 6379, minio 9000+9001, srs admin 1985 are all closed externally
  4. Drift log captured: any deviation between the documented quickstart and the actual VM run is recorded in `deploy/SMOKE-TEST-LOG.md` and resolved before milestone close
**Plans**: TBD

## Progress

| Milestone | Phases | Status | Shipped |
| --------- | ------ | ------ | ------- |
| v1.0 MVP | 1-7 + 999.1 | Complete | 2026-04-16 |
| v1.1 UI Overhaul | 8-13 | Complete | 2026-04-18 |
| v1.2 Self-Service, Resilience & UI Polish | 14-22 | Complete | 2026-04-27 |
| v1.3 Production Ready | 23-30 | Planning Complete | — |

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 23. Tech Debt Cleanup + Phase 0 Prerequisites | 6/6 | Complete    | 2026-04-27 |
| 24. Deploy Folder Structure + Dev Workflow Guardrails | 5/5 | Complete    | 2026-04-27 |
| 25. Multi-Stage Dockerfiles + Image Hardening | 6/6 | Complete    | 2026-04-27 |
| 26. Production Compose + Migrate Init + Networking + Volumes | 4/4 | Complete    | 2026-04-28 |
| 27. Caddy Reverse Proxy + Auto-TLS | 5/5 | Complete    | 2026-04-28 |
| 28. GitHub Actions CI/CD → GHCR | 4/4 | Complete    | 2026-04-28 |
| 29. Operator UX (bootstrap/update/backup/restore + super-admin CLI) | 5/6 | In Progress|  |
| 30. Smoke Test on Clean VM (gates v1.3 GA) | 0/TBD | Not started | - |
