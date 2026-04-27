# Stack Research — v1.3 Production Ready (Pull-Only Deploy Additions)

**Domain:** Production deployment surface for existing SMS Platform (NestJS 11 + Next.js 15 + Postgres 16 + Prisma 6 + Redis 7 + SRS v6 + FFmpeg 7 + MinIO + Better Auth)
**Researched:** 2026-04-27
**Confidence:** HIGH (all version numbers verified via official sources within the last 24h)

> **Scope guard.** This file ONLY documents what gets ADDED for v1.3 — registry, multi-stage Dockerfiles, reverse proxy, migration runner, CI/CD, and compose patterns. The dev stack itself (NestJS, Prisma, etc.) was researched in v1.0 / v1.2 and is not re-litigated here. Prior `STACK.md` content (v1.2 Self-Service, Resilience & UI Polish) lives in git history.

---

## Recommended Stack

### Core Production Additions

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **GitHub Container Registry (ghcr.io)** | n/a (managed) | Image hosting for `sms-api` + `sms-web` | Free for public repos, scoped to repo via `GITHUB_TOKEN`, no extra account/billing for the operator, OCI-compliant, supports private images via PAT. Reuses the existing GitHub repo permission model — no Docker Hub rate limits, no third-party SaaS. |
| **Caddy** | **2.11.2** (image: `caddy:2.11.2-alpine`) | Auto-TLS reverse proxy in front of api / web / SRS HLS | Five-line Caddyfile per host, ACME (Let's Encrypt + ZeroSSL fallback) is **on by default**, ~30 MB RAM, native WebSocket pass-through with zero config (matters for our `socket.io` + `@nestjs/websockets` gateways), cert volume = the only persistent state. **Picked over Traefik** — Traefik's Docker-socket auto-discovery is a security liability for a single-server deploy and its router/middleware/service vocabulary is overkill for 3 hosts. **Picked over Nginx + Certbot** — eliminates the cron-cert-renewal failure mode entirely. |
| **`node:22-bookworm-slim`** | digest-pinned | Runtime base for `sms-api` + migration runner | Lets us `apt-get install ffmpeg` cleanly. Distroless was rejected — no shell means no `bash`-based health probes (we already rely on `bash -c "exec 3<>/dev/tcp/..."` for SRS), and `fluent-ffmpeg`'s child-process introspection breaks without `/bin/sh`. Alpine was rejected — musl + FFmpeg's many shared libs is a known compat minefield, and sharp's libvips path is wobbly on musl. |
| **`node:22-bookworm-slim`** (Next.js standalone runner) | digest-pinned | Runtime base for `sms-web` | Same Debian base as the API for cache-layer reuse on the build host. Next.js 15 `output: 'standalone'` (already set in `apps/web/next.config.ts`) produces a self-contained `node server.js` — no `next start`, no `npm` in the runtime layer. |
| **Caddyfile** (declarative config) | n/a | Per-host routing + TLS | Operator-readable. Three blocks: `app.<domain>` → web:3000, `api.<domain>` → api:3001, `<domain>/hls/*` → srs:8080 (rewriting). One global `email <op@domain>` line for ACME. |
| **Prisma migrate deploy** | 6.19.x (matches `@prisma/client`) | Schema migrations on deploy | Switches from `db:push` (dev-only) to versioned migrations. **Separate init container** (`sms-migrate`) with `restart: "no"` + `depends_on: postgres: condition: service_healthy`, then `sms-api` / `sms-web` use `depends_on: sms-migrate: condition: service_completed_successfully`. Avoids race conditions across multi-instance restarts and keeps the runtime image free of `prisma` CLI footprint creep. |
| **Docker Compose v2** (compose-spec) | Compose ≥ 2.27 | Production orchestration | Already mandated by PROJECT.md ("Docker Compose deploy"). v2 (Go binary `docker compose`) is the supported line; v1 (`docker-compose` Python) is EOL. Use `condition: service_healthy` + `condition: service_completed_successfully` for ordered boot. |
| **GitHub Actions + `docker/build-push-action`** | **v7.1.0** | CI build + push to ghcr.io | Latest stable (released 2025-04-10). Built-in `cache-from: type=gha` + `cache-to: type=gha,mode=max` — uses GitHub's Cache Service v2 (v1 was shut down 2025-04-15, so anything older than v6.19 silently breaks caching). Pairs with `docker/setup-buildx-action@v3` and `docker/metadata-action@v5` for tag derivation. |
| **`docker/login-action`** | v3 | ghcr.io auth in CI | Uses `${{ secrets.GITHUB_TOKEN }}` directly — no PAT needed for repo-scoped image push. Set `permissions: packages: write` on the workflow. |

### Supporting Libraries / Tools

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| **`docker/setup-buildx-action`** | v3 | Configure Buildx in GH Actions | Always — required by `build-push-action` for cache + multi-arch capability. |
| **`docker/setup-qemu-action`** | v3 | Cross-arch emulation | **Only if** we ship `arm64` (see decision below). Pure `amd64` skips it entirely. |
| **`docker/metadata-action`** | v5 | Tag/label derivation | Auto-tags from git: `type=ref,event=tag`, `type=sha,prefix=sha-`, `type=raw,value=latest,enable={{is_default_branch}}`. Also injects OCI labels (`org.opencontainers.image.source`, `revision`, etc.) so the package page links back to the repo. |
| **`pnpm fetch` + `pnpm install --offline`** | pnpm 9.x | Cache-friendly monorepo install in Dockerfile | First `COPY pnpm-lock.yaml`, `RUN pnpm fetch`, then `COPY` source and `RUN pnpm install --offline --frozen-lockfile`. Layer cache hits the lockfile only — re-installs don't re-download on source-only changes. |
| **`pnpm deploy --filter @sms-platform/api --prod /out`** | pnpm 9.x | Prune the api package for runtime | Produces a self-contained `/out/node_modules` with workspace deps materialized and devDeps stripped. Replaces the manual `npm prune --production` dance and respects pnpm-workspace symlinks. |
| **`tini`** (PID 1 init) | bundled in Compose `init: true` | Reaping FFmpeg zombie children | Use Compose's `init: true` (no extra package). Critical because `ResilienceService` spawns FFmpeg children that exit independently of NestJS — without an init reaping them, defunct PIDs accumulate. |
| **JSON-file logging driver** | bundled w/ Docker Engine | stdout capture + rotation | Default driver, but **must** set `max-size: "10m"` + `max-file: "5"` per service. Otherwise unbounded logs fill `/var/lib/docker` on a single-server box. |

### Development Tools (for the deploy folder)

| Tool | Purpose | Notes |
|------|---------|-------|
| `dotenv-linter` | Validate `.env.production.example` shape | Run in CI on the deploy folder PR. |
| `hadolint` | Dockerfile lint | Catch the obvious — pinned tags, `--no-install-recommends`, no `apt-get update` without `&& rm -rf /var/lib/apt/lists/*`. |
| `docker scout cves` | Image CVE scan | Run after build-push in CI; non-blocking initially, alerting only. |
| `docker compose config --quiet` | Compose-file syntax validation | Pre-commit + CI check on the `deploy/docker-compose.yml`. |

---

## Installation

### CI side (added to repo)

```yaml
# .github/workflows/build-push.yml (sketch — full file is roadmap work)
permissions:
  contents: read
  packages: write
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta-api
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/sms-api
          tags: |
            type=ref,event=tag
            type=sha,prefix=sha-
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v7
        with:
          context: .
          file: deploy/api.Dockerfile
          platforms: linux/amd64                # see Multi-arch decision below
          push: true
          tags: ${{ steps.meta-api.outputs.tags }}
          labels: ${{ steps.meta-api.outputs.labels }}
          cache-from: type=gha,scope=api
          cache-to: type=gha,mode=max,scope=api
      # ... repeat for web image with separate scope=web
```

### Server side (zero source, only this)

```bash
# On a fresh Linux box (Ubuntu 24.04 LTS or Debian 12):
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER" && newgrp docker

# Pull only the deploy folder (no app source needed)
git clone --depth 1 --filter=blob:none --sparse https://github.com/<org>/sms-platform.git
cd sms-platform
git sparse-checkout set deploy
cd deploy
cp .env.production.example .env
$EDITOR .env                              # set DOMAIN, ACME_EMAIL, secrets

docker login ghcr.io                      # only needed if images are private
docker compose pull
docker compose up -d
```

---

## Key Decisions (rationale)

### 1. Reverse Proxy: Caddy 2.11.2 over Traefik 3.x and Nginx + Certbot

| Criterion | Caddy | Traefik | Nginx + Certbot |
|-----------|-------|---------|-----------------|
| Auto-TLS out of the box | YES (default ON) | YES (file/label provider) | NO (cron job + reload dance) |
| Config size for our 3 hosts | ~10 lines | ~30 lines (router/service/middleware) | ~80 lines + certbot wiring |
| WebSocket pass-through | Automatic | Needs `passhostheader` + `Upgrade` middleware | Needs explicit `Upgrade`/`Connection` headers |
| RAM footprint | ~30 MB | ~80 MB | ~20 MB but no ACME |
| Docker socket exposure | NONE (file-based) | YES (or extra `caddy-docker-proxy`) | NONE |
| Cert renewal failure mode | In-process, retries automatic | In-process, retries automatic | Cron job dies silently → expired cert |

**Verdict:** Caddy. Our use case is "3 fixed hostnames, single server, never-changing topology" — exactly Caddy's sweet spot. Traefik shines when containers come and go and you want automatic discovery; we have a fixed compose file with 6 services and no churn. Caddy's WebSocket/SSE handling is a hard requirement (Socket.IO + `@nestjs/websockets` SrsLogGateway are core to v1.2 features) and works without any directives. `skipTrailingSlashRedirect: true` in `next.config.ts` is already set for Socket.IO compatibility — Caddy will pass through cleanly.

### 2. Base image: `node:22-bookworm-slim` (NOT distroless, NOT alpine)

| Criterion | bookworm-slim | distroless | alpine |
|-----------|---------------|------------|--------|
| `apt-get install ffmpeg` works | YES | NO (no apt) | YES (apk, slightly different versions) |
| FFmpeg 7.x available | YES (Debian Bookworm-backports) | n/a | YES (edge/community) |
| sharp (libvips) compat | rock solid | OK if you bundle libs | musl quirks |
| `bash` for healthchecks | YES | NO | only `ash` (incompatible w/ our SRS healthcheck) |
| Image base size | ~75 MB | ~30 MB | ~40 MB |
| Final size with FFmpeg + node_modules | ~340 MB | n/a (FFmpeg won't fit cleanly) | ~280 MB but fragile |

**Verdict:** bookworm-slim. We give up ~50 MB to keep `bash` (matches our `docker-compose.yml` healthcheck pattern), apt (FFmpeg), and glibc (sharp + ssl3 stable). Alpine's musl-vs-glibc surprises with FFmpeg shared libs and sharp's libvips are not worth the savings. Distroless is incompatible with our FFmpeg-spawn-as-child-process architecture — without `/bin/sh` the `fluent-ffmpeg` library can't introspect process state on error paths.

**Future-size lever (not v1.3):** Multi-stage with `COPY --from=mwader/static-ffmpeg:7 /ffmpeg /usr/local/bin/ffmpeg` saves ~60 MB and removes the apt FFmpeg dependency. Defer until size becomes pain.

### 3. Migration strategy: separate `sms-migrate` init container

```yaml
sms-migrate:
  image: ghcr.io/<org>/sms-api:${IMAGE_TAG}
  command: ["pnpm", "exec", "prisma", "migrate", "deploy"]
  environment:
    DATABASE_URL: ${DATABASE_URL_MIGRATE}   # uses the bypass-RLS role per existing convention
  depends_on:
    postgres:
      condition: service_healthy
  restart: "no"

sms-api:
  image: ghcr.io/<org>/sms-api:${IMAGE_TAG}
  depends_on:
    sms-migrate:
      condition: service_completed_successfully
    redis:
      condition: service_healthy
    srs:
      condition: service_healthy
  restart: unless-stopped
```

**Why a separate service, not a container-boot script:**
- **Race-safe across multiple API instances** (we don't run multiple today, but v1.3 should not box us out of horizontal scaling later).
- **Single source of truth for "did the schema apply"** — the init container exit code is the gate.
- **Same image, different command** — no second build, no extra image to push, no drift between migrate-CLI version and runtime Prisma client. Reuses the api image's bundled `prisma` CLI from `node_modules/.bin/prisma`.
- **Aligns with our existing CLAUDE.md Prisma workflow** — that doc mandates "rebuild + restart every long-running API process" because the Prisma client lives in memory; an init container forces a full lifecycle gate on every deploy.

**Why `pnpm exec prisma migrate deploy`, not a custom script:** `migrate deploy` is the supported production command — it never prompts, never resets, only applies pending migrations from `prisma/migrations/`. Note: this **requires the migrations folder to exist in the image**, which means our Dockerfile must `COPY apps/api/src/prisma ./prisma` BEFORE the `pnpm deploy --prod` prune step (or copy it explicitly into the runtime stage).

**One-time cutover work for the roadmapper:** We are currently on `db:push` with NO migration history. v1.3 must include a "baseline migration" phase — generate `0_init/migration.sql` from current schema, mark it applied via `prisma migrate resolve --applied 0_init` against existing prod (if any), THEN switch the deploy pipeline to `migrate deploy`. This is a one-time cutover, not a per-deploy step. The existing `apps/api/src/prisma/migrations/*` SQL files (camera_stream_url_unique, camera_push_fields, recording_segment_has_keyframe, rls_apply_all) need to be reformatted into Prisma's `<timestamp>_<name>/migration.sql` layout.

### 4. Multi-arch: **`amd64` only for v1.3**

| Question | Answer |
|----------|--------|
| Does the prod target run amd64? | YES — typical VPS / bare metal Linux server is x86_64. |
| Do we have ARM users? | Devs on Apple Silicon (M-series) build & test locally — but they `docker build` for their own arch via Buildx, no ghcr push needed. |
| Cost of multi-arch CI | QEMU-emulated `arm64` build adds ~5–10 minutes per run. Native ARM runners (`ubuntu-24.04-arm`) are free for public repos but require split-job + manifest-merge complexity. |
| When to revisit | When a real prod target moves to AWS Graviton, Hetzner ARM, or RPi-class. Not v1.3. |

**Verdict:** Single-arch `linux/amd64` only. Document the "future: enable arm64" steps in the deploy README so it's a one-PR change, not a re-architecture.

### 5. Image-size budget (verified targets)

| Image | Budget | Composition (estimate) |
|-------|--------|------------------------|
| `sms-api` | **≤ 450 MB** | bookworm-slim (75) + ffmpeg (~110, full Debian package) + node_modules prod (~180) + dist (~5) + prisma engines (~50) + bash/curl (~5) |
| `sms-web` | **≤ 220 MB** | bookworm-slim (75) + Next standalone .next/standalone (~100) + .next/static + public (~30) + node 22 runtime extras (~15) |
| `sms-migrate` | shared with `sms-api` | Same image, different command — costs zero extra registry storage. |
| `caddy:2.11.2-alpine` | ~50 MB | Pulled from upstream. |

The api budget is conservative because of FFmpeg 7's full Debian package (codecs + libs). If we ever need to trim, the lever is **using a static FFmpeg build** (e.g. `mwader/static-ffmpeg` `COPY --from=...`) which can drop FFmpeg's contribution to ~85 MB and remove the apt-get dependency tree entirely. Defer this until size becomes a concrete pain.

### 6. Logging: json-file with rotation, structured stdout

```yaml
# Apply to every long-running service
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "5"
    compress: "true"
```

Then `logging: *default-logging` on `sms-api`, `sms-web`, `caddy`, `srs`, `postgres`, `redis`, `minio`. **Rejected `fluentd`** for v1.3 — adds an additional service to the critical path and we have no aggregation backend yet. **Rejected `local`** driver — non-portable, harder to `docker logs` from operators. **Rejected `awslogs`** — single-server self-hosted, no AWS dependency.

NestJS already logs structured JSON to stdout (when running `node dist/main`); Next.js standalone server does the same. No app code changes needed.

### 7. Compose secrets: `.env` file, **not** `secrets:`

**Why:** Compose top-level `secrets:` maps to either Swarm secrets or to bind-mounted files at `/run/secrets/<name>`. For a single-server self-hosted deploy with no Swarm, it adds a layer of "where did that file come from" without buying anything over a chmod 600 `.env`. The constraint from PROJECT.md is "minimal-config secrets — operator copies `.env.production.example` and fills it" — that maps directly to `.env`. We can revisit Docker Swarm secrets if we ever cluster.

**What goes in `.env.production.example`:**
- `DOMAIN=` (e.g. `streambridge.io`)
- `ACME_EMAIL=` (Let's Encrypt registration)
- `IMAGE_TAG=` (defaults to `latest`, allow pinning to git tag for rollback)
- `POSTGRES_PASSWORD=`
- `BETTER_AUTH_SECRET=` (32+ char random)
- `MINIO_ROOT_USER=` / `MINIO_ROOT_PASSWORD=`
- `SRS_API_TOKEN=` (existing v1.2 surface)
- `GHCR_USERNAME=` / `GHCR_TOKEN=` (only if private repo)

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Caddy 2.11.2 | Traefik 3.x | If we move to Docker Swarm or Kubernetes — Traefik's CRD/label-based discovery wins at scale. |
| Caddy 2.11.2 | Nginx + Certbot | Never for v1.3. Acceptable only if a corporate environment mandates Nginx (audited, hardening profiles exist). |
| Caddy 2.11.2 | Nginx Proxy Manager | If a non-developer operator needs a GUI to manage hosts. We have `git push` deploys; UI is overkill. |
| `node:22-bookworm-slim` | `node:22-alpine` | If image size becomes critical AND we drop FFmpeg from the api image (e.g. by extracting the FFmpeg pool to its own service). |
| `node:22-bookworm-slim` | `gcr.io/distroless/nodejs22` | If a security audit demands minimum attack surface AND we accept that debug/healthcheck tooling lives in a sidecar. |
| Separate `sms-migrate` init container | Migrate as part of `sms-api` boot | Only if we are 100% certain we'll never run multiple api replicas. Race risk. |
| `linux/amd64` only | Multi-arch (amd64 + arm64) | When a prod target lands on Graviton / Ampere / RPi. Use native runners (`ubuntu-24.04-arm`), not QEMU. |
| pnpm in Dockerfile | npm in Dockerfile | If we drop pnpm-workspaces. Currently a non-starter — `apps/api` and `apps/web` are workspaces. |
| `.env` file | Compose `secrets:` directive | If we move to Docker Swarm. v1.3 single-server doesn't benefit. |
| `.env` file | HashiCorp Vault / Bitwarden Secrets / sops-nix | When we have >1 operator who shouldn't see all secrets. v1.3 is single-operator. |
| ghcr.io | Docker Hub | If the org doesn't use GitHub for source. We do — ghcr is free, no rate limit on logged-in pulls. |
| ghcr.io | AWS ECR / GCP Artifact Registry | If we deploy on AWS/GCP. Self-hosted target → ghcr stays simpler. |
| json-file logging | Loki + Promtail | When we want centralized search across services. Defer to a later milestone — Prometheus-only for v1.3. |
| Build-time static FFmpeg | `apt-get install ffmpeg` | When size budget is breached. Currently within budget. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `npm ci` in the API Dockerfile | Loses pnpm-workspace symlink resolution; `package-lock.json` is stale relative to `pnpm-lock.yaml`. | `pnpm fetch` + `pnpm install --offline --frozen-lockfile` |
| `prisma db push` on container boot | Non-versioned, irreversible, no migration history, can data-loss with `--accept-data-loss`. | `prisma migrate deploy` in a separate init container |
| `node:22` (full image) | ~1.1 GB base, 88 unnecessary apt packages, larger CVE surface. | `node:22-bookworm-slim` (~75 MB base) |
| `latest` tag on production images | Non-reproducible deploys; can't roll back a known-good. | Pin to git tag (`v1.3.0`) or short-SHA via `docker/metadata-action` |
| Mounting `/var/run/docker.sock` into Caddy | Privilege escalation surface — Caddy doesn't need Docker discovery for our static topology. | Static Caddyfile in a bind mount; no Docker socket exposure |
| Running migrations in `RUN` (Dockerfile build stage) | DB isn't available at build time, leaves time gap between schema applied and container boot. | Run as `command:` in a separate compose service with `restart: "no"` |
| Cron + Certbot inside Caddy container | Caddy already does ACME in-process. Adding cron is a regression. | Caddy's built-in auto-TLS. Only set `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` if testing rate limits. |
| Hard-coded host ports in compose for prod app/web | Conflicts with Caddy's 443 ownership. | Caddy owns 80/443 only; SRS still exposes 1935 (RTMP), 8000/udp (WebRTC), 10080/udp (SRT) for camera ingest; api/web only `expose:` (internal-only). |
| `restart: always` | Will restart on `docker stop` after server reboot — operator can't drain. | `restart: unless-stopped` |
| `depends_on:` (short form, no condition) | Compose only waits for "started", not "ready". DB connection refused on boot. | Always use `condition: service_healthy` (or `service_completed_successfully` for the migrate init) |
| `MINIO_ROOT_PASSWORD: minioadmin` (current dev value) | Default credential; immediate breach if exposed. | Generated 32+ char secret, rotated per deploy. |
| Building images on the prod box | Defeats the "pull-only" goal; needs source code, devDeps, GH credentials. | `docker compose pull && docker compose up -d` only. |
| Single Dockerfile for both api and web | Forces a lowest-common-denominator image (FFmpeg in web image, sharp in api image — doubles size). | Two files: `deploy/api.Dockerfile`, `deploy/web.Dockerfile` |
| Bundling Prisma migrations into a separate "tools" image | Drift risk: migrations from version X applied by tools-image version Y. | Reuse the api image with a different `command:` |
| QEMU multi-arch on `ubuntu-latest` runner | 5–10× slower amd64-equivalent build time. | Either single-arch amd64, OR matrix native runners (`ubuntu-24.04-arm` + `ubuntu-24.04`) with manifest merge. |
| Public ghcr image without `org.opencontainers.image.source` label | Image isn't linked back to the source repo on the GH UI; supply chain audit pain. | Use `docker/metadata-action@v5` — it injects the OCI labels automatically. |
| Caddy with `tls internal` in production | Issues a self-signed cert; browsers will reject. | Real ACME via `email <ACME_EMAIL>` global directive. |

---

## Stack Patterns by Variant

**If the org repo is private:**
- Generate a fine-grained PAT with `read:packages` scope.
- Operator runs `echo $GHCR_TOKEN | docker login ghcr.io -u <user> --password-stdin` once.
- Compose `pull` succeeds without further auth as long as the daemon has the credential cached.

**If the org repo is public:**
- Set the package's "Inherit access from source repository" to public in the GH UI after first push.
- Operator can `docker compose pull` with no auth.
- **Do NOT** confuse "public ghcr image" with "embedded secret OK". Image content is still scanned by `docker scout`; never bake secrets into layers.

**If the deploy uses a wildcard certificate (`*.streambridge.io`):**
- Caddy needs DNS-01 challenge → requires a DNS provider plugin built into Caddy (`xcaddy build` with `caddy-dns/cloudflare` etc.) → custom Caddy image required.
- For v1.3 we use distinct hostnames (`api.`, `app.`, root) which are HTTP-01 / TLS-ALPN compatible — stays on the stock `caddy:2.11.2-alpine`.

**If the operator is behind Cloudflare:**
- Set Cloudflare to "Full (strict)" SSL mode AND tell Caddy to use `tls internal` only if proxying via CF (DNS-only mode is preferred for ACME). Otherwise ACME challenges loop.
- Document this in the deploy README; many self-hosters hit it.

**If we ever add a second app instance:**
- The migrate init container pattern protects against double-migrate races already.
- Caddy's `reverse_proxy api1:3001 api2:3001` round-robins for free, but Socket.IO sticky-session needs `lb_policy ip_hash` (or sticky cookie) — out of v1.3 scope.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `node:22-bookworm-slim` | NestJS 11, Next.js 15 | Both already require Node ≥ 20; Node 22 is current LTS until Apr 2027. |
| Prisma 6.19 (server CLI) | `@prisma/client` 6.19 | Must match exactly — mismatch causes silent client-engine version drift. Pin both in `apps/api/package.json` (already done). |
| `prisma migrate deploy` | Postgres 16 | First-class support; no compat caveats. |
| Caddy 2.11.2 | Docker engine ≥ 20.10 | Compose v2 requires engine 20.10+ anyway. |
| `docker/build-push-action@v7` | Buildx ≥ 0.13, BuildKit ≥ 0.13 | GH-hosted runners ship the right versions; self-hosted runners need explicit setup. |
| GH Cache Service v2 | `build-push-action@v6.19+` | v1 was shut down 2025-04-15. v6 < 6.19 will break silently (cache no-op, no error). |
| SRS `ossrs/srs:6` | Caddy reverse_proxy | SRS HLS at `:8080/<app>/<stream>.m3u8` proxies through Caddy fine. WebRTC (UDP 8000) bypasses Caddy entirely — that's correct, UDP doesn't go through HTTP proxies. |
| `node-fluent-ffmpeg` 2.x | FFmpeg 7.x in container | Confirmed working in dev; same binary path expected in prod (`/usr/bin/ffmpeg`). |
| pnpm 9.x | Node 22 | Match the developer's pnpm version in CI: `corepack enable && corepack prepare pnpm@9.x --activate`. |

---

## Sources

- [Caddy v2.11.2 release on GitHub (2026-03-06)](https://github.com/caddyserver/caddy/releases) — version + Go 1.26.1 build (HIGH)
- [Caddy Docker Hub `caddy:2.11.2-alpine` tag](https://hub.docker.com/_/caddy) — image variants confirmed (HIGH)
- [Caddy Automatic HTTPS docs](https://caddyserver.com/docs/automatic-https) — Let's Encrypt + ZeroSSL fallback default ON (HIGH)
- [`docker/build-push-action` v7.1.0 (2025-04-10)](https://github.com/docker/build-push-action/releases) — latest stable, GH Cache v2 only (HIGH)
- [Docker GitHub Actions cache backend docs](https://docs.docker.com/build/cache/backends/gha/) — `cache-from: type=gha` syntax (HIGH)
- [Docker multi-platform image with GH Actions](https://docs.docker.com/build/ci/github-actions/multi-platform/) — QEMU vs native runners trade-off (HIGH)
- [Next.js Docker example with standalone output](https://github.com/vercel/next.js/blob/canary/examples/with-docker/README.md) — three-stage pattern (HIGH)
- [Prisma Docker deployment guide](https://www.prisma.io/docs/guides/docker) — `migrate deploy` in container (HIGH)
- [Prisma deploy database changes](https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate) — separate-init-container pattern (HIGH)
- [pnpm `fetch` docs](https://pnpm.io/cli/fetch) + [`deploy` docs](https://pnpm.io/cli/deploy) — Docker-friendly install patterns (HIGH)
- [pnpm Docker guide](https://pnpm.io/docker) — official monorepo recipe (HIGH)
- [Docker Compose startup order docs](https://docs.docker.com/compose/how-tos/startup-order/) — `condition: service_healthy` + `service_completed_successfully` (HIGH)
- [Docker JSON-file logging driver docs](https://docs.docker.com/engine/logging/drivers/json-file/) — max-size + max-file rotation (HIGH)
- [Snyk: Choosing the best Node.js Docker image](https://snyk.io/blog/choosing-the-best-node-js-docker-image/) — slim vs distroless vs alpine comparison (MEDIUM, vendor blog)
- [iximiuz Labs: Node.js Docker images deep dive](https://labs.iximiuz.com/tutorials/how-to-choose-nodejs-container-image) — bookworm-slim base image breakdown 220 MB → 75 MB w/ slim (MEDIUM)
- [Reverse Proxy Comparison 2026 — programonaut](https://www.programonaut.com/reverse-proxies-compared-traefik-vs-caddy-vs-nginx-docker/) — feature matrix (MEDIUM)
- [NGINX Proxy Manager vs Traefik vs Caddy 2026 — earezki.com](https://earezki.com/ai-news/2026-04-23-nginx-proxy-manager-vs-traefik-vs-caddy-which-reverse-proxy-should-you-pick-in-2026/) — RAM + complexity comparison (MEDIUM)
- [Publishing Multi-Arch Images to GHCR with Buildx (DEV.to)](https://dev.to/pradumnasaraf/publishing-multi-arch-docker-images-to-ghcr-using-buildx-and-github-actions-2k7j) — workflow template (MEDIUM)
- Existing project files: `apps/api/Dockerfile`, `docker-compose.yml`, `.env.example`, `apps/web/next.config.ts` (already has `output: 'standalone'`), `apps/api/package.json` (Prisma 6.19, pnpm scripts) — reviewed in prep (HIGH)
- CLAUDE.md "Prisma schema change workflow" — drives the migrate-init-container decision (HIGH, project canon)
- PROJECT.md v1.3 milestone scope — confirms pull-only, single-server, auto-TLS, GHCR constraints (HIGH, project canon)

---

*Stack research for: SMS Platform v1.3 Production Ready (deploy surface only)*
*Researched: 2026-04-27*
*Confidence: HIGH — every version pinned in tables verified against official GitHub releases or Docker Hub within 24h.*
