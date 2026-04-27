# Requirements: SMS Platform v1.3

**Defined:** 2026-04-27
**Core Value:** Developers can get a secure HLS playback URL for any registered camera via a single API call, and embed it on their website immediately.
**Milestone Goal:** Ship v1.2 feature-complete platform to production via pull-only deploy — fresh Linux box → set domain + secrets → `docker compose up -d` → working HTTPS app in <10 minutes with zero source on the prod box.

## v1.3 Requirements

Requirements for v1.3 milestone. Each maps to roadmap phases.

### Tech Debt Cleanup (Phase 0 prerequisite)

- [ ] **DEBT-01**: `StreamProcessor.process` rejects undefined/empty `cameraId` job data with fast-fail logging + metric (closes the silent stuck-camera bug open since 2026-04-21)
- [ ] **DEBT-02**: Triage all pre-existing API test failures (~23) — fix-now / skip-with-issue / delete; CI locks on red so future failures cannot land
- [ ] **DEBT-03**: SRS config template stops emitting `hls_use_fmp4` directive on cold boot (`settings.service.ts:127` + `cluster/templates/srs-origin.conf.ts:46`); cold-boot SRS smoke test passes
- [ ] **DEBT-04**: Recording playback page (`/app/recordings/[id]`) surfaces parent camera `tags` + `description` (closes Phase 22 ↔ Phase 17 audit gap)
- [ ] **DEBT-05**: Hand-rolled SQL files in `apps/api/src/prisma/migrations/*` converted to Prisma migration history; `prisma migrate deploy` against fresh DB produces v1.2-equivalent schema (including RLS policies)

### Image Pipeline

- [ ] **DEPLOY-01**: Multi-stage `apps/api/Dockerfile` produces ≤450MB production image (`node:22-bookworm-slim` runtime, non-root user, FFmpeg + tini included, prod-deps only)
- [ ] **DEPLOY-02**: `apps/web/Dockerfile` produces ≤220MB Next.js standalone image (non-root user, `outputFileTracingRoot` configured for monorepo)
- [ ] **DEPLOY-03**: GitHub Actions workflow builds + pushes both images to `ghcr.io/<org>/sms-{api,web}:<tag>` on git tag push (single-arch `linux/amd64`)
- [ ] **DEPLOY-04**: Image tags follow `vX.Y.Z` + `vX.Y` + `latest` + `sha-<7>` pattern via `docker/metadata-action@v5`
- [ ] **DEPLOY-05**: GHA workflow attaches build provenance attestation (`actions/attest-build-provenance`) to each pushed image

### Reverse Proxy & Auto-TLS

- [ ] **DEPLOY-06**: Caddy 2.11.x service auto-provisions Let's Encrypt certificate for operator-set `${DOMAIN}` on first boot; HTTP→HTTPS redirect enabled
- [ ] **DEPLOY-07**: Caddy routes `/api/*` and `/socket.io/*` to api:3003, default route to web:3000 (same-origin pattern eliminates cookie/CORS pitfalls)
- [ ] **DEPLOY-08**: Caddy WebSocket pass-through works end-to-end for `NotificationsGateway` and `StatusGateway` Socket.IO streams
- [ ] **DEPLOY-09**: `caddy_data` + `caddy_config` named volumes persist certs across container restarts (no Let's Encrypt rate-limit lockout on `docker compose down/up`)

### Compose Orchestration

- [ ] **DEPLOY-10**: `deploy/docker-compose.yml` references GHCR images only (no `build:` context); fresh server runs `docker compose pull && docker compose up -d` against the file alone
- [ ] **DEPLOY-11**: Two-network topology — `edge` (caddy + web + api + srs) and `internal: true` (postgres + redis + minio + migrate); postgres/redis/minio have no host ports; SRS admin port 1985 binds to `127.0.0.1` only
- [ ] **DEPLOY-12**: Named volumes for `postgres_data`, `redis_data`, `minio_data`, `caddy_data`, `hls_data` (shared SRS↔api); volumes survive container recycle
- [ ] **DEPLOY-13**: Every long-running service has `init: true` (FFmpeg zombie reaping), healthcheck with `start_period`, `restart: unless-stopped`, JSON-file logging with rotation (10m × 5)

### Migration & First-Run Bootstrap

- [ ] **DEPLOY-14**: Dedicated `sms-migrate` init service runs `prisma migrate deploy` once with `restart: "no"`; api service depends on it via `condition: service_completed_successfully`
- [ ] **DEPLOY-15**: First-run init creates required MinIO buckets (avatars, recordings) automatically; idempotent on subsequent boots
- [ ] **DEPLOY-16**: First-run seed inserts default Stream Profile if no profiles exist; idempotent
- [ ] **DEPLOY-17**: `bin/sms create-admin` CLI creates super-admin user with system org membership and bcrypt-hashed password (works inside `docker compose exec api`)

### Operator Scripts

- [ ] **DEPLOY-18**: `deploy/scripts/bootstrap.sh` validates required env vars, pulls latest images, runs migrate + first-run seeds, brings up stack, prints next-step URL
- [ ] **DEPLOY-19**: `deploy/scripts/update.sh` pulls new image tag, runs migrate, recycles services in dependency order
- [ ] **DEPLOY-20**: `deploy/scripts/backup.sh` produces a single timestamped archive containing pg_dump + MinIO mirror + caddy_data tar
- [ ] **DEPLOY-21**: `deploy/scripts/restore.sh` consumes a backup archive and rebuilds all volumes; idempotent overwrite of existing data

### Secrets & Documentation

- [ ] **DEPLOY-22**: `deploy/.env.production.example` documents every required variable (DOMAIN, DB_PASSWORD, NEXTAUTH_SECRET, BETTER_AUTH_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, IMAGE_TAG); `deploy/scripts/init-secrets.sh` generates 32-char random values for empty fields and chmods to 600
- [ ] **DEPLOY-23**: `deploy/README.md` documents 5-step quickstart proving <10-min cold deploy from fresh Linux VM
- [ ] **DEPLOY-24**: `deploy/DOMAIN-SETUP.md` documents DNS A-record requirements, port 80 reachability for ACME HTTP-01, propagation expectations, staging-CA toggle for debug

### Validation Gates

- [ ] **DEPLOY-25**: Smoke test on clean Linux VM (DigitalOcean/Hetzner droplet) — clone repo (or sparse-checkout `deploy/`), set `DOMAIN` + secrets, run `bootstrap.sh` → HTTPS app accessible + login + camera register + RTSP→HLS playback + recording archive + WebSocket all work within 10 minutes from fresh provision
- [ ] **DEPLOY-26**: Port lockdown verified via `nmap` on production server — only `80`, `443`, `1935`, `8080`, `8000/udp`, `10080/udp` open; postgres `5432`, redis `6379`, minio `9000+9001`, srs admin `1985` all closed externally

## Future Requirements

Deferred to v1.3.x patches or v1.4 milestone. Tracked but not in current roadmap.

### v1.3.x Patches

- **DEPLOY-27**: Cosign keyless image signing via GHA OIDC + verify step in `bootstrap.sh` (defer per "minimal config" goal)
- **DEPLOY-28**: SBOM generation via buildx attestation
- **DEPLOY-29**: `bin/sms doctor` pre-flight check (env, DNS, port 80, image pull)
- **DEPLOY-30**: Backup rotation strategy (GFS — daily/weekly/monthly retention) + offsite mc mirror to S3-compatible target
- **DEPLOY-31**: Watchtower opt-in for auto-update on `latest` tag
- **DEPLOY-32**: Multi-arch CI matrix (`linux/amd64` + `linux/arm64`) for ARM-based VPS

### v1.4 Milestone Candidates

- **OBS-01**: Observability profile (`docker compose --profile observability up`) — Prometheus + Grafana + Loki + SRS dashboards + log shipping
- **STORAGE-01**: AIStor migration path documentation + automated cutover script (MinIO upstream archived 2026-04-25)
- **DEPLOY-33**: DNS-01 wildcard cert support (`*.example.com`) for future tenant subdomain routing
- **DEPLOY-34**: Blue-green deploy guide (single-server best-effort with brief downtime window)

### Carry-Over From v1.2

- **USER-04**: User can change email (requires re-verify) — deferred from v1.2
- **RESIL-05**: FFmpeg stderr parsing for proactive degradation detection — deferred from v1.2
- **REC-04**: Timeline zoom levels (6h, 1h views) — deferred from v1.2
- **REC-05**: Cross-camera timeline view for incident investigation — deferred from v1.2
- **CAM-04**: Scheduled maintenance windows (auto-enter/exit) — deferred from v1.2

## Out of Scope

Explicitly excluded from v1.3. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Helm charts / Kubernetes operators | PROJECT.md constraint: "single-server Docker Compose" |
| Argo CD / Flux GitOps | Kubernetes-only; over-engineered for fixed-topology compose |
| Service mesh (Istio / Linkerd) | Same-server traffic; no benefit |
| Multi-region deployment | PROJECT.md constraint: single server |
| Web first-run wizard | Permanent attack surface; CLI-driven seed (DEPLOY-17) instead |
| Blue-green at app level | Single-server doesn't support; rolling recycle sufficient for v1.3 |
| HashiCorp Vault / external secret manager | Over-engineered for self-hosted single-server |
| Datadog / New Relic / commercial APM | Vendor lock-in; expensive for self-hosted |
| OpenTelemetry traces / Jaeger / Tempo | Defer to v2+ |
| ARM64 multi-arch images | Defer to DEPLOY-32; v1.3 production target is amd64 |
| Image signing (Cosign keyless) | Defer to DEPLOY-27 (build provenance attestation ships in DEPLOY-05) |
| Wildcard DNS / tenant subdomain routing | Single hostname for v1.3 simplicity |
| Migration to AIStor (MinIO replacement) | MinIO archived 2026-04-25; v1.3 pins last community tag, AIStor migration is v1.4 work |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEBT-01 | Phase 23 | Pending |
| DEBT-02 | Phase 23 | Pending |
| DEBT-03 | Phase 23 | Pending |
| DEBT-04 | Phase 23 | Pending |
| DEBT-05 | Phase 23 | Pending |
| DEPLOY-01 | Phase 25 | Pending |
| DEPLOY-02 | Phase 25 | Pending |
| DEPLOY-03 | Phase 28 | Pending |
| DEPLOY-04 | Phase 28 | Pending |
| DEPLOY-05 | Phase 28 | Pending |
| DEPLOY-06 | Phase 27 | Pending |
| DEPLOY-07 | Phase 27 | Pending |
| DEPLOY-08 | Phase 27 | Pending |
| DEPLOY-09 | Phase 27 | Pending |
| DEPLOY-10 | Phase 26 | Pending |
| DEPLOY-11 | Phase 26 | Pending |
| DEPLOY-12 | Phase 26 | Pending |
| DEPLOY-13 | Phase 26 | Pending |
| DEPLOY-14 | Phase 26 | Pending |
| DEPLOY-15 | Phase 26 | Pending |
| DEPLOY-16 | Phase 26 | Pending |
| DEPLOY-17 | Phase 29 | Pending |
| DEPLOY-18 | Phase 29 | Pending |
| DEPLOY-19 | Phase 29 | Pending |
| DEPLOY-20 | Phase 29 | Pending |
| DEPLOY-21 | Phase 29 | Pending |
| DEPLOY-22 | Phase 26 | Pending |
| DEPLOY-23 | Phase 29 | Pending |
| DEPLOY-24 | Phase 27 | Pending |
| DEPLOY-25 | Phase 30 | Pending |
| DEPLOY-26 | Phase 30 | Pending |

**Coverage:**
- v1.3 requirements: 31 total (5 DEBT + 26 DEPLOY)
- Mapped to phases: 31/31 ✓ (100% coverage, no orphans)
- Phase 24 owns no REQ-IDs (preventive structural work — deploy/ skeleton + Dockerfile rename + root .dockerignore — enabling Phases 25-30 without contaminating dev workflow)

**Phase distribution:**
- Phase 23: 5 (all DEBT)
- Phase 24: 0 (structural)
- Phase 25: 2 (DEPLOY-01, 02)
- Phase 26: 8 (DEPLOY-10, 11, 12, 13, 14, 15, 16, 22)
- Phase 27: 5 (DEPLOY-06, 07, 08, 09, 24)
- Phase 28: 3 (DEPLOY-03, 04, 05)
- Phase 29: 6 (DEPLOY-17, 18, 19, 20, 21, 23)
- Phase 30: 2 (DEPLOY-25, 26)

---
*Requirements defined: 2026-04-27*
*Last updated: 2026-04-27 — traceability completed by /gsd-new-milestone roadmapper (Phases 23-30 mapped; 31/31 REQ-IDs covered)*
