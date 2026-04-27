# Project Research Summary — v1.3 Production Ready

**Project:** SMS Platform v1.3 — Production Ready (pull-only Docker Compose deploy surface)
**Researched:** 2026-04-27
**Confidence:** HIGH (deployment patterns) / MEDIUM (folder-name conventions, MinIO post-archive guidance)

> **Scope.** Application features are already shipped in v1.0–v1.2. v1.3 adds production-deployment surface only: registry, multi-stage Dockerfiles, reverse proxy, migration runner, CI/CD, compose patterns, operator runbook. All four researchers (STACK, FEATURES, ARCHITECTURE, PITFALLS) operated under this scope guard, and their conclusions converge cleanly.

## Executive Summary

v1.3 is a **packaging milestone**, not a product milestone. The user's bar — "fresh Linux box → set domain + secrets → `docker compose up -d` → working HTTPS app in <10 minutes with zero source on the prod box" — maps onto the Plausible / Outline / Coolify self-hosted-SaaS pattern. All four researchers converged independently on the same minimal architecture: **Caddy 2.11.x reverse proxy** for auto-TLS, **`node:22-bookworm-slim`** runtime base for both api and web, **separate one-shot `migrate` init container** for Prisma, **GHCR for image hosting**, **single-arch `linux/amd64`**, **same-origin routing** behind one hostname, and a dedicated **`deploy/`** folder at repo root that never contaminates the dev workflow.

**Recommended approach: opinionated and narrow.** Pick the simplest tool that closes each pitfall, write that tool's pattern down, operators copy-paste rather than improvise. Caddy over Traefik because Traefik's Docker-socket auto-discovery is a security liability that buys nothing for a fixed 6-service compose. Bookworm-slim over Alpine/distroless because FFmpeg + sharp + bash-based healthchecks are non-negotiable. Dedicated `migrate` service over api entrypoint script because it eliminates a class of race conditions at zero cost. The **MinIO upstream archive on 2026-04-25** (two days before research) is the sole external risk introduced into v1.3 — addressed by pinning to last known-good community tag and documenting AIStor migration; do NOT reopen object-storage selection in v1.3.

The dominant risk is **carry-over tech debt** that production amplifies silently: StreamProcessor undefined `cameraId` bug (open since 2026-04-21), ~23 pre-existing API test failures that block "tag → green CI → push image" gate, and — most acutely — `prisma db push --accept-data-loss` in dev with hand-rolled SQL files NOT in Prisma's migration layout. PITFALLS and ARCHITECTURE both flagged this last one as **Phase 0, non-negotiable**: convert to proper Prisma migrations BEFORE any Dockerfile work, or `migrate deploy` against a fresh prod DB will leave RLS unconfigured and silently break multi-tenancy.

## Locked Decisions (all 4 researchers agree)

| Decision | Verdict |
|----------|---------|
| Reverse proxy | **Caddy 2.11.2** (`caddy:2.11.2-alpine`) |
| Runtime base image | **`node:22-bookworm-slim`** (digest-pinned) |
| Migration strategy | **Separate one-shot `migrate` init service** with `restart: "no"` + `service_completed_successfully` |
| Folder name | **`deploy/`** at repo root |
| Multi-arch | **`linux/amd64` only** for v1.3 |
| Image registry | **GHCR public** (`ghcr.io/<org>/sms-{api,web}:tag`) |
| Secrets transport | **`.env` file** (chmod 600, gitignored) — NOT Docker `secrets:`, NOT Vault |
| PID 1 | **`init: true`** in compose for FFmpeg zombie reaping |
| Logging | **JSON-file driver** with rotation (10m × 5) |
| Migration baseline cutover | **Phase 0 prerequisite, BEFORE Dockerfile work** |
| Dev Dockerfile rename | `apps/api/Dockerfile` → `Dockerfile.dev`; new prod `Dockerfile` co-located |
| Network topology | Two networks: `edge` (caddy/web/api/srs) + `internal: true` (postgres/redis/minio/migrate) |
| SRS admin port 1985 | **Bind to `127.0.0.1`** only (SSH tunnel for access) |
| Routing | **Same-origin** via Caddy (eliminates cookie/CORS pitfalls) |

## Open Questions (resolve in requirements phase)

1. **MinIO post-archive disposition** — pin last `minio/minio` community tag OR adopt `bitnami/minio:2025.4.22` fork? Decide before publishing compose.
2. **Cosign keyless signing** — ship in v1.3 or defer? Build provenance attestation should ship anyway (~3 lines, free).
3. **`bin/sms` operator CLI scope** — v1.3 launch subset (suggest: `backup`, `restore`, `update`, `create-admin`); defer rest.
4. **`/health` endpoint shallow vs deep** — verify v1.2 presence; if missing, fold into Phase 0.
5. **Phase 22 ↔ 17 metadata gap** — confirm ship-anyway in Phase 0 (~4 LOC).
6. **DNS pattern** — single hostname (`app.streambridge.io`) for v1.3 simplicity, or wildcard? Recommend single.

## Critical Blockers (must ship in v1.3 GA)

1. **StreamProcessor undefined `cameraId` defensive guard** (Pitfall 14) — production amplifies silent stuck-camera bug.
2. **~23 pre-existing API test failures** (Pitfall 15) — auth/crypto ESM, recording manifest fMP4, srs callback mocks, cluster. Blocks CI gate model.
3. **`hls_use_fmp4` cold-boot fix** (Pitfall 4) — without it, single-command cold deploy is impossible.
4. **Phase 22 ↔ Phase 17 metadata gap** (Pitfall 16) — recommend ship anyway, ~4 LOC.

## Recommended Phase Order (8 phases)

### Phase 0: Tech-debt cleanup + dev-workflow guardrails (PREREQUISITE)
**Why first:** Cannot ship pull-only deploy on top of `db:push` + raw SQL; cannot gate CI on green tests if 23 are red; cannot rely on prod restart cycles if FFmpeg children leak.
**Delivers:** Convert raw SQL → Prisma migration history; StreamProcessor undefined cameraId guard + tests + metric; triage 23 test failures; fix `hls_use_fmp4` cold-boot in `settings.service.ts:127` + `srs-origin.conf.ts:46`; add `/health` (api, if missing) + `/api/health` (web); set `outputFileTracingRoot` in `next.config.ts`; Phase 22 ↔ 17 metadata wiring.
**Closes:** Pitfalls 1, 2, 4, 14, 15, 16.
**Research flag:** Yes (Prisma baseline cutover + 23-test triage non-trivial).

### Phase 1: Deploy folder structure + dev-workflow preservation
**Delivers:** `deploy/` skeleton; rename `apps/api/Dockerfile` → `Dockerfile.dev`; root `.dockerignore`; `pnpm dev` smoke test confirms no contamination.
**Closes:** Pitfall 18 (dev contamination), Pitfall 8 (.env leak).

### Phase 2: Multi-stage Dockerfiles (api + web) + image hardening
**Delivers:** Production `apps/api/Dockerfile` (4 stages: deps → builder → prod-deps → runtime, non-root, FFmpeg + tini), `apps/web/Dockerfile` (Next.js standalone, non-root). `.dockerignore` per app. Local `docker run` smoke test.
**Closes:** Pitfalls 2, 3, 8, 12.

### Phase 3: Production compose + Prisma migrate init + networking + volumes
**Delivers:** `deploy/docker-compose.yml` (image refs only); two-network split with `internal: true`; host-port-strip on stateful services; SRS 1985 → `127.0.0.1`; `sms-migrate` init service; named volumes (`postgres_data`, `minio_data`, `caddy_data`, `hls_data` shared SRS↔api); `srs.conf.production` with `SRS_CALLBACK_HOST=http://api:3003`; `.env.production.example`; `init-secrets.sh`; MinIO pinned to last community tag.
**Closes:** Pitfalls 1, 5, 6, 9, 13.

### Phase 4: Caddy reverse proxy + auto-TLS
**Delivers:** `deploy/Caddyfile` (same-origin: `/api/*` → api:3003, `/socket.io/*` → api:3003, default → web:3000); Caddy service with `caddy_data` + `caddy_config` named volumes; staging-CA toggle docs; `DOMAIN-SETUP.md` with DNS + port 80 pre-flight.
**Closes:** Pitfalls 7, 10, 17.

### Phase 5: GitHub Actions CI/CD → GHCR
**Delivers:** `.github/workflows/build-images.yml` (matrix `app: [api, web]`, GH Cache v2, single-arch amd64); `release.yml` (GH Release with image tags); semver + `latest` + `sha-` tags via `metadata-action@v5`; build provenance attestation; first test tag → verify push; flip default `IMAGE_TAG` in compose to GHCR ref.
**Closes:** Pitfalls 11, 12.

### Phase 6: First-run bootstrap + operator scripts + backup/restore
**Delivers:** `bin/sms create-admin` CLI; MinIO bucket auto-create; default Stream Profile seed; `bootstrap.sh` / `update.sh` / `backup.sh` / `restore.sh`; `deploy/README.md` 5-step quickstart; `BACKUP-RESTORE.md` + `TROUBLESHOOTING.md`.
**Research flag:** Yes (Better Auth super-admin seed via CLI has v1.0/v1.2 lifecycle nuance).

### Phase 7: Smoke test on a clean VM (gates v1.3 GA)
**Delivers:** Provision DigitalOcean/Hetzner droplet; sparse-checkout `deploy/`; configure DNS; run `bootstrap.sh`; verify HTTPS + login + camera register + RTSP→HLS + recording archive + WebSocket; capture timing < 10 min; `nmap -p 9001,1985,5432` → all closed; document drift.

### Phase 8 (deferrable to v1.3.x): Observability profile + Cosign + extras
**Delivers:** `--profile observability` (Prometheus + Grafana + Loki + SRS dashboards); Cosign keyless via GHA OIDC; SBOM via buildx attestation; `bin/sms doctor`; backup rotation (GFS) + offsite mc mirror; Watchtower opt-in.

## Stack Additions

| Component | Choice | Version |
|-----------|--------|---------|
| Image registry | GHCR | `ghcr.io` |
| Reverse proxy | Caddy | `caddy:2.11.2-alpine` |
| Node runtime base | Debian Bookworm slim | `node:22-bookworm-slim` (digest-pinned) |
| Prisma migrate runner | Same image as api | Prisma 6.19 `migrate deploy` |
| Compose spec | Docker Compose v2 | ≥ 2.27 |
| CI build | docker/build-push-action | v7.1.0 |
| CI metadata | docker/metadata-action | v5 |
| CI cache | type=gha (GH Cache v2) | v6.19+ |
| Auth (CI) | `${{ secrets.GITHUB_TOKEN }}` | no PAT |
| Logging | JSON-file driver | with rotation `10m × 5` |
| Image budget (api) | ≤ 450 MB (FFmpeg dominates) | — |
| Image budget (web) | ≤ 220 MB (Next standalone) | — |

## Anti-Features (Out of Scope for v1.3)

| Feature | Reason |
|---------|--------|
| Helm charts / Kubernetes operators | PROJECT.md constraint: "single-server Docker Compose" |
| Argo CD / Flux GitOps | K8s-only; over-engineered for fixed-topology compose |
| Service mesh (Istio/Linkerd) | Same-server traffic; no benefit |
| Multi-region deployment | PROJECT.md constraint |
| Web first-run wizard | Permanent attack surface; CLI-driven seed instead |
| Blue-green at app level | Single-server doesn't support; rolling sufficient |
| HashiCorp Vault | Over-engineered for self-hosted single-server |
| Datadog / New Relic | Vendor lock-in; expensive for self-hosted |
| OpenTelemetry traces / Jaeger / Tempo | Defer to v2+ |
| Cosign keyless signing | Defer to v1.3.x (build attestation ships in v1.3) |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Every version pinned via official sources within 24h; cross-verified against project files |
| Features | **HIGH** (cats 1–7, 10) / **MEDIUM** (8–9) | Anti-features and first-run conventions lean on competitor patterns |
| Architecture | **HIGH** (Caddy/Prisma/Next.js) / **MEDIUM** (folder name) | Folder-name reasoned convention, not RFC |
| Pitfalls | **HIGH** | Most verified against project's own RETROSPECTIVE.md / CLAUDE.md / dev compose |

**Overall: HIGH.** Four independent researchers converged on the same major decisions.

## Detailed research files
- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`

---
*Research completed: 2026-04-27*
*Ready for roadmap: yes*
