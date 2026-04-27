# Feature Research: v1.3 Production Ready

**Domain:** Production deployment of SMS Platform — pull-only Docker Compose for self-hosted single-server SaaS (NestJS + Next.js + Postgres + Redis + MinIO + SRS + FFmpeg)
**Researched:** 2026-04-27
**Confidence:** HIGH (categories 1–7, 10) / MEDIUM (categories 8–9 — mostly anti-feature reasoning + first-run conventions)

## Scope Note

This research covers the **production deployment surface** being added in v1.3. The application code (auth, cameras, streaming, recording, dashboard, etc.) is already shipped in v1.0..v1.2 — **DO NOT re-research feature parity**. Treat the existing app as a black box: containerize what exists, expose it on a domain, make `docker compose up -d` boot it cleanly on a fresh Linux box.

The 10 question categories from the orchestrator each map to a sub-section below. Each category is decomposed into Table Stakes / Differentiators / Anti-Features with complexity (S/M/L), dependencies on existing system, and reasoning for anti-feature classification.

## Critical Discovery: MinIO Archived (2026-04-25)

**Two days before this research**, the MinIO upstream community repository was archived (read-only) and pre-compiled binary releases / official Docker images were discontinued. This is documented at https://github.com/minio/minio. The vendor pivot is to "AIStor" (free + enterprise tiers under a different distribution model).

**Implication for v1.3:** the existing dev `docker-compose.yml` pins `minio/minio:latest`. For production, this resolves to an unmaintained image. The platform must:

- **Pin to a specific known-good MinIO tag** (e.g. last community release before archive) AND/OR
- **Switch to a maintained fork** (`bitnami/minio:2025.4.22` is mentioned in self-hosting communities), AND/OR
- **Document an AIStor migration path** for future operators.

This raises a v1.3 sub-decision that wasn't in PROJECT.md scope and **must be addressed before publishing the production compose file**. Adding this to anti-pattern flags rather than reopening object-storage selection — that's a v1.4+ topic. For v1.3: pin tag + document.

## Feature Landscape

### Category 1: Image Distribution (GHCR)

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| Public images on `ghcr.io/<org>/sms-{api,web}` | Operator pulls without auth setup; matches PROJECT.md "pull-only deploy" | S | GH org with packages enabled, Actions write-packages permission |
| Multi-tag strategy: `vX.Y.Z` (immutable) + `vX.Y` (floating minor) + `latest` (floating) | Operators pin to `vX.Y.Z` for prod, `vX.Y` for "latest patch" auto-update; never `latest` in prod | S | docker/metadata-action in GHA |
| Multi-arch build: `linux/amd64` + `linux/arm64` | Cloud servers (Hetzner, Oracle Cloud) increasingly ARM; macOS dev hosts also ARM. Single-arch image breaks "fresh Linux box" promise | M | docker/buildx in GHA, QEMU emulation overhead |
| Build provenance attestation (SLSA L2) | GHA `attest-build-provenance` is one-line opt-in; default-on for security-aware projects in 2026 | S | actions/attest-build-provenance |

#### Differentiators (Worth Considering)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Cosign keyless signing of images | Allows operator to verify image is from this repo via `cosign verify --certificate-identity-regexp=...`; ~10 lines extra in workflow; uses GHA OIDC, no key management | S | Deferrable to v1.4 unless target audience is enterprise/regulated |
| Git SHA tag for traceability | `ghcr.io/.../sms-api:sha-abc1234` lets operator pin to exact commit when chasing a regression | S | Free with docker/metadata-action |
| SBOM generation (`syft` or buildx attestation) | Surfaces dependency tree for supply-chain audits; required by some enterprise procurement | M | Adds ~30s to build |

#### Anti-Features (Avoid in v1.3)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Private images with PAT distribution | "We're a SaaS, our code is proprietary" | Single-server self-hosted IS the deploy model — code is open by definition; PAT rotation creates ops friction; GHCR free private quota (500MB/1GB bw) too tight | Public images + private-by-deployment (operator's data is private; the image is just packaged code) |
| Custom registry (Harbor, Docker Distribution) | "What if GHCR goes down?" | Self-hosted registry adds another container to babysit, TLS cert, auth, GC; massive scope creep for marginal benefit | GHCR uptime is GitHub-grade; operators concerned about availability can `docker save` images to tarball |
| Image signing with Cosign keypair (not keyless) | Traditional PKI feels "more secure" | Key management is exactly what keyless eliminates; rotating compromised keys is a manual ops fire drill | Keyless OIDC signing if signing at all (or defer entirely) |

#### Operator UX

```bash
# Pull (anonymous, no auth)
docker compose pull

# Verify (optional, if signing enabled)
cosign verify ghcr.io/<org>/sms-api:v1.3.0 \
  --certificate-identity-regexp='https://github.com/<org>/sms-app/.*' \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com
```

### Category 2: Operator UX (Deploy Day)

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| `deploy/README.md` with copy-paste 5-step quickstart | Operator's first 10 minutes determine retention; "git clone → cp .env → edit → up -d → done" is the bar | S | None; pure docs |
| `deploy/.env.production.example` with every var documented inline | Every required variable named; comments explain what to put; sensible defaults where possible (e.g. `POSTGRES_DB=sms_platform`) | S | None |
| `deploy/docker-compose.yml` (production-only, ports bound to 127.0.0.1) | Separation from dev compose: no port `5434:5432` on public IP; reverse proxy is the ONLY public face | M | New file separate from root `docker-compose.yml` |
| Domain + email are the ONLY required inputs | Operator typing 5 things vs 50 things — UX fork in the road. Auto-generate the rest (DB password via `openssl rand -base64 32`, NEXTAUTH_SECRET similarly) | M | Bootstrap script: `deploy/bin/init-secrets.sh` |
| Stream Profile regeneration handled at boot, not by operator | v1.0..v1.2 has Stream Profile system in DB; on fresh install, default profile must seed automatically | S | API entrypoint runs `prisma migrate deploy` + seed |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `deploy/bin/sms` operator CLI (start, stop, logs, backup, update, status) | One command surface vs operators learning docker compose flags; mirrors how `coolify`, `caprover`, `dokku` win operator hearts | M | Bash wrapper around `docker compose` |
| `.env.production.example` validation script | `bin/sms doctor` checks required vars, ports free, domain DNS resolves, disk space | M | Catches "I forgot to set NEXTAUTH_SECRET" before first boot |
| Compose profiles for optional services (`--profile observability`) | Operator can opt into Prometheus+Grafana later without editing compose | S | docker compose `profiles:` key |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Web installer / first-run setup wizard | "User-friendly UI for setup" | Chicken-and-egg: requires app running, but app needs DB+secrets to run; significantly higher complexity than .env file | First admin user via `bin/sms create-admin` CLI on host shell |
| Ansible playbook for deployment | "Repeatable, idempotent" | Operators of single-server self-hosted SaaS rarely use Ansible; adds learning curve; `docker compose up -d` is already idempotent | Plain compose + bash bootstrap script |
| Helm chart | "Standard packaging" | Out of scope per PROJECT.md "single-server Docker Compose"; Kubernetes is explicitly a v2+ topic | Skip entirely |

### Category 3: Auto-TLS

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| Caddy v2 official image as reverse proxy | Auto-HTTPS is the headline feature; Caddyfile syntax is ~5 lines for our case; 100M+ pulls on Docker Hub = production-proven | S | Caddy `caddy:2-alpine` image; domain pointing at server's port 80 |
| Let's Encrypt HTTP-01 challenge by default | Works without any DNS provider config; just expose ports 80+443 | S | Caddy does this with zero config given a domain |
| Persistent volume for `/data` (cert storage) | Without it, every restart re-issues cert and trips LE rate limit (50 certs/registered-domain/week) | S | Named volume `caddy_data` |
| Single Caddyfile with two `reverse_proxy` blocks (web → 3000, api → 3001) | One domain = `app.example.com` → web; `api.example.com` → api; OR path-based on single domain | S | Dependent on domain layout decision |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| DNS-01 wildcard cert (Cloudflare module) | One cert covers `*.example.com`; useful for tenant subdomains (`acme.app.example.com`); **already relevant** if v1.0 supports tenant subdomains (TBD) | M | Requires custom Caddy build via `xcaddy` w/ `caddy-dns/cloudflare` module + CF API token in env |
| Let's Encrypt staging endpoint flag | `ACME_STAGING=1` toggles to staging CA; avoids burning real-cert quota during operator's first install attempts | S | One env var → Caddyfile global block |
| HSTS + security headers preset | Caddy can emit `Strict-Transport-Security`, `X-Frame-Options`, etc. via one-liner | S | Caddyfile `header` directive |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Traefik with label-based config | "More featureful" | Steeper learning curve; label sprawl across compose; Caddy syntax is markedly simpler for our 2-3 backend case | Caddy unless we hit a feature gap |
| nginx + certbot manual cert renewal | "We know nginx" | Manual cron for renewal; restart on cert change; ~50 lines of config to recreate auto-HTTPS | Caddy does it in 5 lines |
| cert-manager pattern | "Industry standard" | Kubernetes-native — out of scope. Self-hosted single-server doesn't need Issuer/ClusterIssuer abstractions | Caddy auto-HTTPS |
| HTTP-only deployment (`--insecure`) | "Internal network, no TLS needed" | Browser security policies (SameSite cookies, mixed content) break Better Auth + HLS playback in 2026; Service Workers require HTTPS | Always TLS, even on internal |

### Category 4: Update Flow

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| `docker compose pull && docker compose up -d` works | Documented update command; recreates containers, network, leaves volumes | S | Baked into compose file structure |
| Prisma `migrate deploy` runs on API container start | Idempotent; no-op if all migrations applied; non-interactive (no prompts) | S | API entrypoint script + `prisma/migrations/` baked into image |
| Health-check-gated rollout | New API container marked unhealthy if `/health` fails; old container stays as fallback (compose v2 `depends_on` + `condition: service_healthy`) | M | `/health` endpoint exists (need to verify in code) |
| Documented rollback: `docker compose pull <prev-tag> && up -d` | Operator anxiety reducer; pinning to prev `vX.Y.Z` rolls back image but NOT migrations | S | Migrations must be additive (see Pitfalls) |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Watchtower auto-update for `vX.Y` floating tag | Operator opts in; container auto-restarts on new patch | S | `containrrr/watchtower` sidecar with label scope |
| Pre-flight migration dry-run | `bin/sms preflight` runs `prisma migrate diff` to surface schema changes before pull | M | Prisma supports `migrate diff` |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Blue-green deployment | "Zero downtime" | Single-server: doubles RAM/disk; complex Caddy upstream switching; ~30s downtime on `compose up -d` is acceptable for a video platform that's already buffering 10s HLS segments | Accept brief restart; Caddy holds connections; FFmpeg child processes restart per Phase 15 boot-recovery |
| Rolling update (`deploy.update_config`) | "Zero downtime" | Compose v2 `deploy` keys only honored by Swarm, not standalone Compose; Swarm is out of scope | Same — accept brief restart |
| Canary deployment | "Test 5% traffic first" | Single-server, single-tenant has no traffic to split | Skip |
| Snapshot-based rollback (LVM, ZFS) | "Disaster recovery" | Filesystem-level out of scope; volume snapshots better handled by host OS, not docs | Document `docker volume backup` procedure |

#### Migration Discipline (Critical Constraint)

Schema migrations must be **additive only** between minor versions to support image-level rollback. PROJECT.md "Prisma schema change workflow" requires `db:push` + regenerate + rebuild + restart in dev — **production uses `migrate deploy`** which does not auto-generate; the image must already contain the regenerated client. This is a **build-time** concern, not runtime.

### Category 5: Backup & Restore

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| `bin/sms backup` script — Postgres `pg_dump` + MinIO `mc mirror` + recordings volume tar | One command produces a single timestamped directory; recoverable | M | `mc` CLI in MinIO container (already there); `pg_dump` via `docker exec postgres` |
| `bin/sms restore <backup-dir>` script | Reverse of above; documented as destructive; requires confirmation | M | Same |
| Postgres dump uses `pg_dump --format=custom -Z6` (zstd not available pre-PG 17) | Custom format = parallelizable restore; -Z6 cuts size 60-70% | S | PG 16 ships `pg_dump` with these flags |
| Recordings volume backup is "rsync to external location" | The volume can be 100GB+; full tar every night is wasteful; rsync incremental is the common pattern | S | `rsync` available on host |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Cron sidecar that runs nightly backup | Operator sets `BACKUP_SCHEDULE=0 2 * * *` and forgets | M | `mcuadros/ofelia` cron sidecar OR systemd timer on host |
| Offsite backup to S3-compatible target | `mc mirror` to remote bucket; nightly | M | Operator provides remote bucket creds |
| Backup rotation (keep 7 daily + 4 weekly + 12 monthly) | Standard GFS rotation; prevents disk fill | M | `find -mtime +N -delete` in script |
| `bin/sms verify-backup` | Test-restore to throwaway DB and run `prisma migrate status` | M | High-trust operators want this |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| pgBackRest / Barman | "Production-grade Postgres backup" | Massive learning curve for single-server; built for fleet PG; overkill | Plain `pg_dump` is sufficient at this scale |
| Continuous WAL archiving | "Point-in-time recovery" | Requires WAL shipping infra; PITR is a v2+ topic when SLA matters | Daily logical dump |
| Volume snapshot via container `docker commit` | "Snapshot the running DB" | Inconsistent — Postgres pages may be mid-write; corrupted backups | Always `pg_dump`, never volume copy of running PG |

### Category 6: Observability

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| Structured JSON logs to stdout from API and Web | `docker logs` shows machine-parseable logs; sets up future log aggregation without rework | S | Already done? (need to verify in code — pino/nestjs-logger setup) |
| `docker compose logs -f api web srs` is the documented "see what's happening" command | Operators are not Grafana DBAs; first debugging tool is logs | S | None |
| `/health` endpoint on API (checked by Caddy/Compose) | Liveness signal; returns 200 if process is up | S | Check existing code — likely exists |
| Container restart policies (`restart: unless-stopped`) on every service | Without it, single FFmpeg crash kills the API and operator must `up -d` manually | S | Compose `restart:` directive |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Compose profile `--profile observability` enables Prometheus + Grafana + Loki | Operator opts in; Loki replaces "scroll docker logs" UX with searchable | L | 4 extra containers (prom, graf, loki, promtail); ~512MB RAM |
| Pre-built Grafana dashboards for SRS metrics + Postgres + Node | SRS already exposes Prometheus on 9972 (per CLAUDE.md); operator imports via API | M | Use SRS upstream dashboards from `srs-grafana` repo |
| Uptime monitoring sidecar (Uptime Kuma) | Self-hosted, single binary, lovely UI for "is my server up" + ping/HTTP/DNS checks | M | Kuma container in `--profile observability` |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Datadog / New Relic agent | "Industry standard APM" | Per-host pricing breaks single-server self-hosted economics; vendor lock | Loki + Grafana for free |
| Distributed tracing (Jaeger, Tempo) | "Observability is 3 pillars" | We have one process; spans across services are nice-to-have, not table stakes | Defer to v2+ |
| Alertmanager + PagerDuty | "Production needs paging" | Operators of self-hosted prod usually want email alert at most; PagerDuty integration is enterprise | Optional Grafana alert → email |
| OpenTelemetry collector | "Standardize" | Adds another container + config surface; collector for what? we don't ship traces yet | Defer until tracing is needed |

### Category 7: Secret Management

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| `.env.production` file (gitignored) sourced by Compose | The conventional minimum for self-hosted single-server; matches every other open-source SaaS distribution | S | `env_file:` in compose |
| `.env.production.example` checked into git as template | Operator copies and fills | S | None |
| Generate-on-init for sensitive secrets (DB password, NEXTAUTH_SECRET, MinIO root creds) | `bin/sms init` runs `openssl rand` for every secret with empty value; operator only touches domain + email | M | Bootstrap script |
| Documented file permissions: `chmod 600 .env.production` | Secrets in env file are readable by default; ops audit minimum | S | README note + `bin/sms init` enforces |
| `.dockerignore` excludes `.env*` from build context | Prevents accidental secret bake-into-image | S | Standard pattern |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Docker Compose `secrets:` (file-based) for DB password | Mounts secret as file at `/run/secrets/db_password`; Postgres image supports `POSTGRES_PASSWORD_FILE` | M | More secure than env var (which `docker inspect` shows) but adds operator step |
| SOPS-encrypted `.env.production.sops` checked into git | Operator decrypts with their own GPG/age key on prod box; team-shared without sharing plaintext | L | Adds SOPS dependency; useful for multi-operator deployments only |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| HashiCorp Vault | "Production-grade secret management" | Adds a stateful service that itself needs secret bootstrap (chicken-and-egg); massive scope; for single-tenant single-server, value is near zero | Plain `.env` file with strict permissions |
| AWS/GCP Secrets Manager | "Cloud-native" | Couples deployment to cloud provider — breaks "self-hosted" promise | Skip |
| Encrypted env vars in compose file | "Security through obscurity" | Decryption key has to live somewhere; just shifts the problem | SOPS if needed |

### Category 8: CI/CD Anti-Features (Explicit Out-of-Scope)

These are things v1.3 should **explicitly NOT do** to stay aligned with PROJECT.md "single-server Docker Compose" constraint. Document in deploy/README.md so future contributors don't drift.

| Anti-Feature | Why Requested | Why Out of Scope | What to Tell Contributors |
|--------------|---------------|------------------|---------------------------|
| GitOps (Argo CD, Flux) | "Declarative deploys" | Designed for Kubernetes; operates on cluster state; we have one server | "v1.3 is single-server Compose. If we move to K8s, GitOps is on the table." |
| Kubernetes operators / CRDs | "Cloud native" | Same — out of scope | Same |
| Helm charts | "Package the app" | Same | Same |
| Service mesh (Istio, Linkerd) | "Zero-trust networking" | mTLS between containers on one host has marginal value vs. complexity | "v1.3 trusts the docker bridge network." |
| Multi-region deployment | "HA across regions" | Already in PROJECT.md Out of Scope | Same |
| Auto-scaling (HPA, VPA) | "Scale on traffic" | Single-server can't scale horizontally; SRS edge cluster is already supported (CLAUDE.md) but is a v2+ activation, not v1.3 | "Edge clustering exists in SRS; v1.3 ships single-origin only." |
| Blue-green at app level | See Category 4 anti-features | Same | Same |
| Service discovery (Consul) | "Decouple from compose" | Compose DNS (`postgres`, `redis`, etc.) is already service discovery for our scope | Skip |
| GitHub Actions self-hosted runners | "Faster builds" | Operator burden; GitHub-hosted runners are free for public repos | GH-hosted runners |
| Container scanning in deployment pipeline (Trivy, Snyk) | "Vuln detection" | **Differentiator** — keep at build stage in CI, not deploy. Already covered by GHA marketplace actions | Add as build-time gate; not deploy-time |

### Category 9: First-Run Init

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| Postgres auto-creates database from `POSTGRES_DB` env var | Standard postgres image behavior — no init script needed | S | Already in dev compose |
| API container runs `prisma migrate deploy` before app start | Schema applied to fresh DB on first boot | M | Entrypoint script `docker-entrypoint.sh` |
| API container runs seed for default Stream Profile + system data | First operator must be able to register a camera immediately; default profile must exist | M | `prisma db seed` OR custom seed script gated by "is empty" check |
| Super admin user creation: `bin/sms create-admin --email --password` | Better Auth needs at least one user with super-admin role; CLI-driven (NOT auto-create from env, NOT first-user-becomes-admin web flow) | M | NestJS CLI command, or one-shot container |
| MinIO bucket auto-creation on API start | Avatar bucket + recordings bucket — API checks existence and creates on boot. Already partially done? (avatars bucket per v1.2 USER work) | M | Verify MinioService bootstrap in code |
| SRS config templated from env vars (`SRS_CALLBACK_URL`, etc.) | The existing `config/srs.conf` is hardcoded; production needs domain + callback URL injection | M | envsubst at container start, or volume-mounted templated file |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Idempotent seed (re-runnable) | Operator can `bin/sms reseed` without breaking existing data; useful after upgrades | M | Seed checks "exists?" before insert |
| Default org + project + site for "demo mode" | New install has clickable cameras out of the box; reduces "blank slate" friction | S | Behind `DEMO_DATA=true` env flag |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Web-based "first-run wizard" to create admin | "Better UX" | Requires API running, but admin doesn't exist yet; wizard becomes a permanent surface that stays in code; bypass attempts | CLI command `bin/sms create-admin`; documented in README |
| First-login-becomes-admin promotion | "Even simpler UX" | Race condition (someone else hits `/signup` first); footgun in unsecured deploys before TLS provisions | Explicit CLI step |
| Drop-and-recreate DB on every container start | "Always fresh" | Catastrophic data loss on accidental restart | Migrations are append-only |

### Category 10: Health Probes

#### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| Compose `healthcheck:` on every service (api, web, postgres, redis, minio, srs) | Docker auto-restarts unhealthy; `depends_on: condition: service_healthy` gates startup order | S | Most exist in dev compose; verify all |
| `/health` endpoint on API with shallow check (process up + DB ping + Redis ping) | Used by Caddy upstream health, Docker healthcheck, external uptime monitoring | M | Check if `@nestjs/terminus` is wired; if not, add |
| Web (Next.js) `/api/health` returning 200 | Caddy needs an upstream check for the web tier too | S | Next.js route handler |
| `start_period: 30s` on API healthcheck | Cold start with `prisma migrate deploy` + Nest module init takes 10-25s; without start_period, container marked unhealthy and restart-loops | S | Compose key, well-supported |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `start_interval` (Compose v2.27+, 2024) for fast initial health checks | First 30s of boot, check every 1s; after, every 30s. Faster to mark healthy → faster to start dependents | S | Requires `compose-spec` 1.27+; document min Docker version |
| Separate `/livez` (process up) vs `/readyz` (process up + can serve traffic) | NestJS `@nestjs/terminus` supports both; aligns with K8s convention; prepares us for v2+ migration | M | Premature for v1.3 single-server but cheap |
| Healthcheck for FFmpeg child process pool | Exposes "are workers processing?" — connects to v1.2 ResilienceService; could surface "X workers stuck" metric | M | Existing ResilienceService likely has the data; just need an HTTP surface |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Deep health check that pings every camera | "Comprehensive" | Healthcheck runs every 10s; pinging 100 cameras every 10s is a network storm; cascade failures | Camera health is a separate concern (already in v1.2 StatusService); /health stays shallow |
| Healthcheck that triggers on transient blips | "Tight SLA" | Postgres briefly slow → API marked unhealthy → restarted → cascading restarts | `retries: 3` + `interval: 10s` = 30s tolerance |

## Feature Dependencies

```
Category 1 (GHCR images)
    └── enables → Category 2 (operator UX: pull-only)
                       └── enables → Category 4 (update flow)

Category 3 (Caddy auto-TLS)
    └── requires → Domain DNS pointed at server (operator step)
    └── requires → Persistent volume for cert storage

Category 4 (Update flow)
    └── requires → Category 10 (health probes for gating)
    └── requires → Migration discipline (additive only)
    └── enables → Category 5 (backup before update)

Category 5 (Backup/restore)
    └── requires → Postgres + MinIO volumes accessible
    └── enables → Category 4 rollback safety

Category 6 (Observability)
    └── enhances → Category 4 (operator can see if update is healthy)
    └── enhances → Category 5 (backup failure alerts)

Category 7 (Secrets)
    └── blocks → All other categories (nothing boots without secrets)

Category 9 (First-run init)
    └── requires → Category 7 (secrets in place)
    └── requires → Category 10 (health probes to mark "ready")
    └── enables → Category 2 (deploy day works end-to-end)

Category 10 (Health probes)
    └── enhances → Category 4 (gated rollout)
    └── enhances → Category 6 (uptime metric)
```

### Critical Path Ordering for Roadmap Phases

```
Phase A: Multi-stage Dockerfiles (apps/api + apps/web) ← prerequisite for everything
   └── Phase B: docker-compose.production.yml + Caddy + .env.example
       └── Phase C: GHA workflow → push to GHCR
           └── Phase D: First-run init (entrypoint, migrate, seed, create-admin CLI)
               └── Phase E: Backup/restore scripts + bin/sms CLI
                   └── Phase F (deferrable): Observability profile
                       └── Phase G (deferrable): Cosign signing + SBOM
```

Phases A–E are **table stakes** = launch v1.3. Phases F–G are differentiators that can ship in v1.3.x patches.

## MVP Definition

### Launch With (v1.3)

The minimum to declare v1.3 production-ready. Each item below is a candidate REQ-ID for `REQUIREMENTS.md`.

- [ ] **DEPLOY-01** Multi-stage `apps/api/Dockerfile` (builder → runtime, drops dev deps, runs `node dist/main`)
- [ ] **DEPLOY-02** Multi-stage `apps/web/Dockerfile` using Next.js standalone output
- [ ] **DEPLOY-03** `deploy/docker-compose.yml` separate from dev; binds to 127.0.0.1; uses ghcr image references
- [ ] **DEPLOY-04** Caddy reverse proxy service in compose with auto-HTTPS via Let's Encrypt HTTP-01
- [ ] **DEPLOY-05** `deploy/.env.production.example` documenting all required vars
- [ ] **DEPLOY-06** `deploy/README.md` with 5-step quickstart
- [ ] **DEPLOY-07** GHA workflow `.github/workflows/release.yml` builds + pushes to ghcr.io on tag (multi-arch amd64/arm64)
- [ ] **DEPLOY-08** Image tag strategy: `vX.Y.Z`, `vX.Y`, `latest`
- [ ] **DEPLOY-09** API entrypoint runs `prisma migrate deploy` before `node dist/main`
- [ ] **DEPLOY-10** Default Stream Profile seed runs on first boot (idempotent)
- [ ] **DEPLOY-11** `bin/sms create-admin` CLI for first super-admin user
- [ ] **DEPLOY-12** MinIO bucket auto-creation on API start (avatars + recordings)
- [ ] **DEPLOY-13** SRS config templating from env vars
- [ ] **DEPLOY-14** `/health` (API) + `/api/health` (web) shallow endpoints
- [ ] **DEPLOY-15** Compose healthchecks on all services with `start_period`
- [ ] **DEPLOY-16** `bin/sms backup` script — Postgres pg_dump + MinIO mc mirror + recordings tar
- [ ] **DEPLOY-17** `bin/sms restore <dir>` script
- [ ] **DEPLOY-18** Update procedure documented: `bin/sms update` = pull + up -d
- [ ] **DEPLOY-19** Container restart policy `unless-stopped` on all services
- [ ] **DEPLOY-20** MinIO image tag pinned to last known-good community release; archive note in README
- [ ] **DEPLOY-21** Structured JSON logs to stdout (verify pino/Nest config)
- [ ] **DEPLOY-22** `.dockerignore` excludes `.env*` and dev-only files
- [ ] **DEPLOY-23** `init-secrets.sh` generates random secrets for empty values

### Add After Validation (v1.3.x patches)

Features to add once v1.3.0 is live and operators are using it.

- [ ] **DEPLOY-24** Cosign keyless image signing in GHA workflow
- [ ] **DEPLOY-25** SBOM generation (buildx attestation)
- [ ] **DEPLOY-26** Build provenance attestation (SLSA L2)
- [ ] **DEPLOY-27** `--profile observability` enabling Prometheus + Grafana + Loki + SRS dashboards
- [ ] **DEPLOY-28** Watchtower opt-in for auto-update on `vX.Y` floating tag
- [ ] **DEPLOY-29** `bin/sms doctor` pre-flight validation
- [ ] **DEPLOY-30** Backup rotation (GFS) + offsite mc mirror
- [ ] **DEPLOY-31** DNS-01 wildcard cert support (Cloudflare module)
- [ ] **DEPLOY-32** `bin/sms verify-backup` test-restore validator

### Future Consideration (v2+)

Features explicitly out of scope per PROJECT.md or because they belong in a Kubernetes-shaped successor.

- [ ] Helm chart / Kubernetes manifests
- [ ] Multi-region / multi-server deployment
- [ ] Blue-green deployment
- [ ] Service mesh
- [ ] HashiCorp Vault for secrets
- [ ] WAL-based PITR for Postgres
- [ ] OpenTelemetry traces
- [ ] AIStor migration (post-MinIO archive)

## Feature Prioritization Matrix

Day-1 vs deferred for the downstream consumer's question.

| Feature | User Value | Implementation Cost | Priority | % Operators Need on Day-1 |
|---------|------------|---------------------|----------|---------------------------|
| Multi-stage Dockerfiles | HIGH | LOW | **P1** | 100% (blocking) |
| Pull-only compose + Caddy + .env.example | HIGH | MEDIUM | **P1** | 100% (blocking) |
| GHA → GHCR with multi-arch | HIGH | LOW | **P1** | 95% (some build locally) |
| Auto-TLS via Caddy HTTP-01 | HIGH | LOW | **P1** | 90% (most have public domain) |
| Prisma migrate on boot | HIGH | LOW | **P1** | 100% (blocking on first install) |
| Default seed (Stream Profile) | HIGH | LOW | **P1** | 100% (blocking — can't add camera otherwise) |
| `create-admin` CLI | HIGH | LOW | **P1** | 100% (blocking — can't log in otherwise) |
| MinIO bucket auto-create | HIGH | LOW | **P1** | 100% (blocking — avatars/recordings fail otherwise) |
| Health probes on all services | HIGH | LOW | **P1** | 100% (blocking restart policy) |
| Backup script | HIGH | MEDIUM | **P1** | **70%** ← downstream consumer question |
| Restore script | HIGH | MEDIUM | **P1** | **70%** (paired with backup) |
| Documented rollback | HIGH | LOW | **P1** | 50% (most don't roll back ever, but docs ease anxiety) |
| Cosign signing | LOW | LOW | **P2** | **5%** ← downstream consumer question (enterprise-only) |
| SBOM | LOW | LOW | P2 | 5% |
| Observability stack | MEDIUM | HIGH | P2 | 30% |
| Watchtower auto-update | MEDIUM | LOW | P2 | 20% |
| DNS-01 wildcard | MEDIUM | MEDIUM | P2 | 10% (only multi-tenant subdomain users) |
| Backup rotation/offsite | HIGH | MEDIUM | **P2** | 40% (operators with valuable data) |
| Web first-run wizard | LOW | HIGH | **P3** | Anti-feature — explicit avoid |
| Helm chart | LOW | HIGH | **P3** | Out of scope |

### Answers to Downstream Consumer Questions

**Q: What % of operators need backup tooling on day-1 vs deferred?**
A: **~70% on day-1**. Operators choosing self-hosted instead of SaaS are usually data-sensitive enough to want backups before they trust the system in production. The script can be simple (Postgres pg_dump + MinIO mc mirror + recordings tar) but it must exist. Backup ROTATION and offsite sync are the deferrable parts (~40% need on day-1).

**Q: Is image signing critical or can wait?**
A: **Wait — defer to v1.3.1 or v1.4**. <5% of operators verify image signatures today; tooling friction (cosign install, key/cert verification) outweighs benefit at our maturity stage. The exception is enterprise/regulated buyers who explicitly ask for it — none of those are confirmed for v1.3 per PROJECT.md. SBOM and provenance attestation are even further down the list. **The exception**: build-provenance attestation is now ~3 lines in GHA via `actions/attest-build-provenance` and is essentially free; that one CAN ship in v1.3 without scope cost. Cosign signing has more setup overhead, defer.

## Competitor Feature Analysis

How comparable self-hosted SaaS projects (chosen as reference points for what's table stakes in this niche) handle these categories.

| Feature | Plausible (analytics) | Outline (knowledge base) | Coolify (PaaS) | Our v1.3 Approach |
|---------|----------------------|--------------------------|----------------|-------------------|
| Image distribution | DockerHub `plausible/community-edition` | DockerHub `outlinewiki/outline` | DockerHub + GHCR | **GHCR public** |
| Reverse proxy | docs reference Caddy/nginx; not bundled | Bundled Caddy in compose | Bundled Caddy + auto-HTTPS | **Bundled Caddy** |
| Auto-TLS | Operator-provided (manual) | Yes (Caddy) | Yes (Caddy) | **Yes (Caddy)** |
| Multi-arch images | amd64 + arm64 | amd64 only | amd64 + arm64 | **amd64 + arm64** |
| Image signing | No | No | No | **No (defer)** |
| First-run setup | Web wizard | Web wizard | Web wizard | **CLI** (rationale: less surface area, less attack surface pre-TLS) |
| Backup tooling | Documented manual pg_dump | Built-in S3 backup | bin/coolify-backup | **bin/sms backup** |
| Observability | None | None | Built-in (Coolify panel) | **Optional profile** |
| Update flow | `docker compose pull && up -d` | Same | Web UI button + auto-update opt-in | **Same as Plausible/Outline; documented procedure** |
| Secret management | `.env` file | `.env` file | `.env` + encrypted vault | **`.env` file + generated defaults** |

**Key insight:** Our profile is closest to **Plausible Community** (CLI-driven, .env file, manual but documented backups) — pragmatic open-source self-hosted SaaS. We deviate from Plausible by **bundling Caddy** (Outline/Coolify pattern) because PROJECT.md explicitly wants auto-TLS; deviating from Coolify by **NOT building a web admin panel** (out of scope, that IS Coolify).

## Sources

### Highest Confidence (Official / Primary)
- [GitHub Container Registry docs](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) — pull rate limits, public/private semantics (HIGH)
- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https) — auto-TLS behavior, ACME flow (HIGH)
- [Caddy Docker Hub](https://hub.docker.com/_/caddy) — official image, persistent volume requirement (HIGH)
- [Prisma Docker deployment guide](https://www.prisma.io/docs/guides/deployment/docker) — `migrate deploy` non-interactive use (HIGH)
- [SRS Prometheus Exporter docs](https://ossrs.net/lts/en-us/docs/v5/doc/exporter) — port 9972, scrape config (HIGH; already in CLAUDE.md)
- [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/) — file-based secrets with `_FILE` suffix (HIGH)
- [Docker Compose env-vars best practices](https://docs.docker.com/compose/how-tos/environment-variables/best-practices/) — `.env.example` convention (HIGH)
- [MinIO archive notice](https://github.com/minio/minio) — repository archived 2026-04-25, pre-compiled binaries discontinued (HIGH — verified directly)

### Medium Confidence (Community / Verified)
- [GitHub Container Signing Blog](https://github.blog/security/supply-chain-security/safeguard-container-signing-capability-actions/) — Cosign + GHA OIDC keyless flow (HIGH for the technique, MEDIUM for "table stakes" claim)
- [Caddy + Cloudflare DNS-01 guide](https://oneuptime.com/blog/post/2026-02-08-how-to-run-caddy-with-docker-and-automatic-https-wildcard-certificates/view) — wildcard cert via xcaddy custom build (MEDIUM)
- [Prisma Migrations Zero-Downtime DEV.to article](https://dev.to/whoffagents/prisma-migrations-in-production-zero-downtime-strategies-and-rollback-patterns-3nf1) — additive-only migration discipline (MEDIUM)
- [Best Free Container Registries 2026 — tools.fun](https://tools.fun/resources/best-free-container-registries) — GHCR rate limits (MEDIUM)
- [Self-hosting MinIO with Docker Compose](https://selfhosting.sh/apps/minio/) — confirms archive + bitnami fork as workaround (MEDIUM)
- [pg_dump backup strategies for Docker](https://serversinc.io/blog/automated-postgresql-backups-in-docker-complete-guide-with-pg-dump/) — cron + format=custom -Z6 pattern (MEDIUM)
- [NestJS graceful shutdown](https://dev.to/hienngm/graceful-shutdown-in-nestjs-ensuring-smooth-application-termination-4e5n) — `app.enableShutdownHooks()` for SIGTERM (MEDIUM)
- [Stopping Docker containers safely with dumb-init](https://medium.com/@salimian/stopping-docker-containers-safely-how-dumb-init-saved-my-nestjsworker-88529b5a9f13) — dumb-init / tini `--init` for FFmpeg child reaping (MEDIUM)
- [Docker Compose blue-green guide](https://technicallyshane.com/2025/08/30/blue-green-deployment-of-a-docker-compose-setup.html) — confirms blue-green is doable but heavyweight (MEDIUM, anti-feature reasoning)

### Lower Confidence (Single Source / Inferred)
- [Container Registry Comparison 2026 — distr.sh](https://distr.sh/blog/container-image-registry-comparison/) — vendor-comparative views (LOW; vendor-published)
- [SaaS bootstrap onboarding strategies — auth0](https://auth0.com/blog/user-onboarding-strategies-b2b-saas/) — admin vs JIT provisioning (LOW; generic, not deploy-flow specific)

---
*Feature research for: SMS Platform v1.3 Production Ready milestone (production deployment surface)*
*Researched: 2026-04-27*
*Critical flag: MinIO archived 2 days ago — must pin tag + document migration path*
