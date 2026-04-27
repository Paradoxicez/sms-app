# Architecture Research: v1.3 Production Deployment

**Domain:** Production deployment topology for existing Docker-Compose-based CCTV SaaS (NestJS API + Next.js Web + SRS + Postgres + Redis + MinIO)
**Researched:** 2026-04-27
**Confidence:** HIGH (Caddy/Prisma/Next.js findings cross-verified with official docs; folder-naming is reasoned convention rather than RFC)

## TL;DR (load-bearing decisions)

1. **Folder name:** `deploy/` at repo root. Justified vs `infra/`, `ops/`, `prod/`, `compose/` below.
2. **Dockerfiles:** `apps/api/Dockerfile` and `apps/web/Dockerfile` — co-located with their app; production-only multi-stage. Dev `Dockerfile` (current) becomes `apps/api/Dockerfile.dev`. **Do not** centralize Dockerfiles under `deploy/dockerfiles/` — breaks "image owns its app" mental model and forces every PR touching app code to also touch deploy.
3. **Reverse proxy:** **Caddy** (not Traefik). Single Caddyfile, zero-config TLS, no Docker socket exposure, ~30 MB RAM. Static set of services (5–6) — Traefik's label-based auto-discovery is overkill and adds Docker socket attack surface.
4. **Migrations:** **Dedicated one-shot `migrate` service** in compose with `restart: "no"` and `depends_on: postgres (healthy)`; the API service `depends_on: migrate (service_completed_successfully)`. Avoids race conditions when API restarts (no migration replay), keeps API entrypoint clean, single audit trail of migration runs.
5. **Network topology:** Two networks — `edge` (Caddy + web + api, ingress) and `internal` (postgres, redis, minio, api). Postgres / Redis / MinIO have **no host port published** in production. SRS stays on the host network ports it needs (1935, 8080, 8000/udp, 10080/udp) because cameras and viewers connect from the public internet.
6. **CI/CD:** Tag push (`v1.3.*`) → build both images → push to `ghcr.io/<org>/sms-{api,web}:<semver>` and `:latest`. Single-arch `linux/amd64` only for v1.3 (FFmpeg perf + the prod box is x86_64).
7. **Build phase order:** Dockerfile (api) → Dockerfile (web) → compose + Caddy + .env wiring → migrate service → CI/CD workflows → operator README + bootstrap script → smoke test on a clean VM.

## System Overview (Production Topology)

```
                            INTERNET
                               |
                   80,443 TCP / 443 UDP (HTTP/3)
                               |
   1935 RTMP                   |                   8080 HLS
   8000/udp WebRTC             |                   1985 SRS API (ADMIN ONLY,
   10080/udp SRT               |                   blocked at proxy or firewall)
        |                      |                        |
        |                      v                        |
        |          +----------------------+             |
        |          |        Caddy         |             |
        |          | (reverse proxy + TLS)|             |
        |          | network: edge        |             |
        |          +----------+-----------+             |
        |                     |                         |
        |        +------------+------------+            |
        |        |                         |            |
        |        v                         v            |
        |  +----------+              +----------+       |
        |  |   web    |              |   api    |       |
        |  | (Next.js |              | (NestJS) |       |
        |  | standalone)             |  :3003   |       |
        |  |  :3000   |              |          |       |
        |  | edge     |              | edge,    |       |
        |  +----------+              | internal |       |
        |                            +----+-----+       |
        |                                 |             |
        |       +-------------------------+             |
        |       |          internal network            |
        |       |     (no host port published)         |
        |       v             v          v             |
        |  +---------+   +---------+  +--------+       |
        |  |postgres |   |  redis  |  | minio  |       |
        |  |  :5432  |   |  :6379  |  | :9000  |       |
        |  +---------+   +---------+  +--------+       |
        |                                               |
        v                                               v
   +-----------+                                  +-----------+
   |    SRS    |<---- on_publish/on_play -------->|    api    |
   |  (host)   |       HTTP callbacks             |           |
   +-----------+                                  +-----------+
        ^
        |
   FFmpeg processes (spawned by api inside api container)
   pull RTSP cameras and push RTMP to srs:1935
```

### Why SRS does NOT sit behind Caddy

- RTMP (1935), SRT (10080/udp), WebRTC (8000/udp) are non-HTTP protocols — Caddy cannot terminate them.
- HLS on 8080 *could* go through Caddy (HTTP), but the Phase 19/20 architecture relies on SRS serving `.m3u8` directly with `hls_ctx` session tracking. Add Caddy as an HLS reverse-proxy only if a future phase requires HLS over a custom domain (`hls.example.com`). For v1.3 keep it direct.
- SRS's HTTP API on 1985 is admin-only. **Do NOT expose it publicly.** Bind `1985:1985` to `127.0.0.1:1985` (host-loopback only) or block at firewall. Compose syntax: `"127.0.0.1:1985:1985"`.

## Folder Layout: `deploy/` (justified)

### Recommendation: `deploy/`

```
sms-app/
├── apps/
│   ├── api/
│   │   ├── Dockerfile              # NEW (production multi-stage)
│   │   ├── Dockerfile.dev          # RENAMED from current Dockerfile
│   │   ├── .dockerignore           # NEW
│   │   └── ...                     # existing source untouched
│   └── web/
│       ├── Dockerfile              # NEW (Next.js standalone)
│       ├── .dockerignore           # NEW
│       └── ...                     # existing source untouched
├── config/
│   └── srs.conf                    # DEV — keep unchanged
├── docker-compose.yml              # DEV — keep unchanged
├── deploy/                         # NEW — production-only artifacts
│   ├── README.md                   # operator runbook (clone → up)
│   ├── docker-compose.yml          # production compose (image: refs only)
│   ├── docker-compose.override.example.yml  # optional operator overrides
│   ├── .env.production.example     # every required var, documented
│   ├── Caddyfile                   # production reverse proxy config
│   ├── srs/
│   │   └── srs.conf.production     # prod SRS (callback URLs use api:3003)
│   ├── scripts/
│   │   ├── bootstrap.sh            # first-run: gen secrets, pull images, up
│   │   ├── update.sh               # pull new images + recreate
│   │   ├── backup.sh               # pg_dump + minio mirror + caddy_data tar
│   │   └── restore.sh              # inverse of backup
│   └── docs/
│       ├── DOMAIN-SETUP.md
│       ├── BACKUP-RESTORE.md
│       └── TROUBLESHOOTING.md
└── .github/
    └── workflows/
        ├── build-images.yml        # NEW — build on tag + main
        ├── ci.yml                  # EXISTING (do not touch)
        └── release.yml             # NEW — semver gate + GH release
```

### Why `deploy/` over alternatives

| Name | Verdict | Reason |
|------|---------|--------|
| **`deploy/`** | chosen | Action-oriented; matches user mental model ("how do I deploy?"); narrowest scope (deployment artifacts, not infrastructure-as-code or operations tooling); no ambiguity with K8s/Terraform conventions |
| `infra/` | rejected | Implies IaC (Terraform, Pulumi, CDK). For v1.3 there is **no** infrastructure provisioning — operator brings their own VPS. Using `infra/` invites future contributors to put Terraform there, expanding scope beyond compose-only |
| `ops/` | rejected | Implies operational concerns (monitoring, alerting, runbooks for incidents). v1.3 is shipping-the-app, not running-the-app at scale. Confuses dev with day-2 ops |
| `prod/` | rejected | Mirror of "dev" environment naming, but compose files in `prod/` suggest there's also a `staging/`, `qa/` etc. We have one environment in v1.3 — single self-hosted server |
| `compose/` | rejected | Tied to Docker Compose specifically — locks future evolution (e.g., if Phase N adds K3s, you'd need a second folder) |
| `.deploy/` (hidden) | rejected | Hiding production artifacts is exactly the wrong signal — operators must discover this folder via README pointer |

**Verification:** This is conventional reasoning, not a hard standard. WebSearch findings show `infra/` is also common in IaC-heavy monorepos; `deploy/` is more common in app-deploy monorepos. Confidence: MEDIUM (judgment call, but well-justified for this project's scope).

### Dev workflow preservation (the user's hard constraint)

- Root `docker-compose.yml` stays exactly as-is. `pnpm dev` continues to work.
- Existing `apps/api/Dockerfile` is renamed to `apps/api/Dockerfile.dev` — root compose updated to reference `dockerfile: Dockerfile.dev` (one-line change).
- The new production `apps/api/Dockerfile` is **never** referenced by root `docker-compose.yml`.
- Production compose lives under `deploy/docker-compose.yml`, which uses `image: ghcr.io/...` references — **not** `build: .`. This means the operator never sees a build step on the production server.
- `apps/web/Dockerfile` is new (no current dev Dockerfile to conflict with — web runs directly via `pnpm dev:web`).

## Dockerfile Strategy

### `apps/api/Dockerfile` (production, multi-stage)

```dockerfile
# Stage 1: deps — install ALL deps to enable build
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN corepack enable && pnpm install --frozen-lockfile

# Stage 2: builder — generate Prisma client + nest build (SWC)
FROM deps AS builder
COPY apps/api/ ./apps/api/
WORKDIR /app/apps/api
RUN pnpm prisma generate
RUN pnpm build

# Stage 3: prod-deps — re-install only production deps (smaller layer)
FROM node:22-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN corepack enable && pnpm install --frozen-lockfile --prod

# Stage 4: runtime — slim final image
FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    tini \
    curl \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r app && useradd -r -g app -u 1001 app

WORKDIR /app
ENV NODE_ENV=production

# Copy production deps + built code + Prisma client + migrations
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=prod-deps --chown=app:app /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=app:app /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=app:app /app/apps/api/src/prisma ./apps/api/src/prisma
COPY --from=builder --chown=app:app /app/apps/api/package.json ./apps/api/

USER app
WORKDIR /app/apps/api
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3003/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main"]
```

**Key choices, with reasoning:**

| Choice | Why |
|--------|-----|
| `node:22-slim` (Debian) over Alpine | FFmpeg + Sharp + native modules battle-tested on glibc; Alpine's musl causes Sharp/Prisma surprises (covered in PITFALLS) |
| Multi-stage with separate `prod-deps` | Smaller final image; dev tooling never reaches runtime; build artifacts cached separately from deps |
| `prisma generate` at **build** time | Required before `nest build` (TypeScript needs generated types). Schema also copied to runtime so `migrate deploy` can run |
| FFmpeg installed in **runtime** stage | api spawns FFmpeg child processes (Phase 15 ResilienceService); FFmpeg must be on `PATH` |
| `tini` as PID 1 | NestJS swallows SIGTERM in some startup paths; tini reaps zombies (FFmpeg children) and forwards signals correctly. Critical for graceful shutdown (Phase 15) |
| Non-root user `app:app` (uid 1001) | Defense-in-depth; required for security scans; `chown` on copies prevents permission errors |
| `HEALTHCHECK` calls `/health` | Compose `depends_on.condition: service_healthy` works only with healthchecks; powers `migrate → api → web` startup ordering |
| `curl` in runtime | Healthcheck command; ~2 MB cost vs writing a custom Node healthcheck script |
| `openssl + ca-certificates` | Prisma engines need OpenSSL; HTTPS calls to MinIO/external services need CA bundle |

### `apps/web/Dockerfile` (Next.js 15 standalone)

```dockerfile
# Stage 1: deps
FROM node:22-slim AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/
RUN corepack enable && pnpm install --frozen-lockfile

# Stage 2: builder — Next build with standalone output
FROM deps AS builder
COPY apps/web/ ./apps/web/
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Stage 3: runtime — minimal
FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r app && useradd -r -g app -u 1001 app

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output: server.js + minimal node_modules
COPY --from=builder --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /app/apps/web/public ./apps/web/public

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web/server.js"]
```

**Required `next.config.ts` adjustment:**

`output: 'standalone'` is already set (verified in repo). For monorepos add:

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'), // monorepo root
  // ... existing rewrites preserved
};
```

The `outputFileTracingRoot` is REQUIRED for pnpm monorepos — without it, the standalone output misses workspace symlinks and crashes at runtime with "Cannot find module" (covered in PITFALLS).

**Health endpoint:** Next.js doesn't ship one. Add a trivial `apps/web/src/app/api/health/route.ts` returning `{ ok: true }`. Phase responsibility: web Dockerfile phase.

### Why Dockerfiles stay co-located, not centralized

WebSearch surfaced both patterns. Co-location wins for this project because:

1. **Locality of reference** — when an api dev edits `apps/api/`, the Dockerfile is right there. Centralized `deploy/dockerfiles/api.Dockerfile` forces context-switch.
2. **Build context simplicity** — `docker build -f apps/api/Dockerfile .` from repo root reads the workspace lockfile; no path gymnastics.
3. **Convention** — Next.js, NestJS, Vercel, and the official Docker Node samples all co-locate Dockerfiles with their app.
4. **The `deploy/` folder still owns** the *production* compose, Caddyfile, env example, scripts. Dockerfiles are app-shape concerns, not deployment-shape concerns.

## Production Network Topology

### Two-network split

```yaml
networks:
  edge:        # public-facing — Caddy reaches web/api here
    driver: bridge
  internal:    # private — postgres/redis/minio NOT on edge
    driver: bridge
    internal: true   # blocks egress to internet from this network
```

| Service | Networks | Host ports published |
|---------|----------|----------------------|
| caddy | `edge` | `80:80`, `443:443`, `443:443/udp` |
| web | `edge` | none (Caddy reaches it via DNS) |
| api | `edge`, `internal` | none (Caddy reaches it via edge DNS) |
| postgres | `internal` | none |
| redis | `internal` | none |
| minio | `internal` | none |
| migrate | `internal` | none (one-shot, exits after migrations) |
| srs | `edge` (with port publish to host) | `1935`, `8080`, `1985:127.0.0.1`, `8000/udp`, `10080/udp` |

**Why SRS lives on `edge`:**

- It must publish raw TCP/UDP ports (RTMP/SRT/WebRTC) to the host, bypassing Caddy entirely.
- The api → SRS HTTP API call (`/api/v1/streams` etc) needs SRS DNS-resolvable from api. Putting SRS on `edge` keeps api ↔ srs traffic inside Docker.
- HTTP API port 1985 is published only on `127.0.0.1` (host loopback) so external scanners cannot reach it.
- HLS port 8080 is published on `0.0.0.0` so viewers can connect (no Caddy in path for v1.3).

### Internal service health checks

Compose health checks run **inside** each container, so they don't depend on network exposure:

| Service | Health command |
|---------|----------------|
| postgres | `pg_isready -U $POSTGRES_USER` |
| redis | `redis-cli ping` |
| minio | `mc ready local` (already in dev compose) |
| api | `curl -fsS http://localhost:3003/health` |
| web | `curl -fsS http://localhost:3000/api/health` |
| caddy | `wget --spider http://localhost:80` (Caddy ships busybox wget) |
| srs | (existing bash + /dev/tcp probe — keep) |

Operator-side health check from outside:

```bash
# from host
curl -fsS https://app.example.com/api/health
curl -fsS https://app.example.com/  # web
```

## Volume Strategy

### Critical (must back up)

| Volume | Mount | Purpose | Backup mechanism |
|--------|-------|---------|------------------|
| `postgres_data` | `/var/lib/postgresql/data` | All app data | `pg_dump` (logical) — see `deploy/scripts/backup.sh` |
| `minio_data` | `/data` | Avatars + recording archives + bulk imports | `mc mirror` to a backup bucket / external storage |
| `caddy_data` | `/data` | Let's Encrypt certificates + ACME state | `tar czf` — losing this means re-issuing certs (rate-limited!) |

### Recoverable (recreate from source)

| Volume | Mount | Purpose | Recovery |
|--------|-------|---------|----------|
| `srs_data` | `/usr/local/srs/objs` | Logs, ephemeral HLS index | None needed — regenerated on next stream |
| `srs_hls` | `/usr/local/srs/objs/nginx/html` | HLS segments (live) | None needed — segments rotate, archived recordings live in MinIO |
| `caddy_config` | `/config` | Caddy auto-generated config | Regenerated from Caddyfile |

### Operator-supplied (bind mounts in compose)

```yaml
volumes:
  - ./caddy:/etc/caddy:ro                                  # directory containing Caddyfile
  - ./srs/srs.conf.production:/usr/local/srs/conf/srs.conf:ro
```

**Caddyfile mount pattern (per official docs):** mount the **directory** containing the Caddyfile at `/etc/caddy/`, not the file directly — graceful reloads break when text editors swap inodes.

### Named volumes vs bind mounts

| Pattern | Use for | Why |
|---------|---------|-----|
| **Named volume** | postgres_data, minio_data, caddy_data | Docker manages lifecycle; survives `docker compose down`; portable to any backup tool |
| **Bind mount** | Caddyfile, srs.conf, .env | Operator edits these; need to be visible on host; under version control via the deploy/ folder |

**Anti-pattern:** Bind-mounting postgres data (`./postgres-data:/var/lib/postgresql/data`) — permission bugs on rootless setups, slower I/O on macOS for dev (irrelevant in prod Linux but bad habit). Use named volume.

## Migration Architecture

### Recommended pattern: dedicated one-shot `migrate` service

```yaml
services:
  postgres:
    # ...
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]

  migrate:
    image: ghcr.io/<org>/sms-api:${IMAGE_TAG:-latest}
    restart: "no"
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: ${DATABASE_URL}
    command: >
      sh -c "npx prisma migrate deploy --schema=src/prisma/schema.prisma"
    networks:
      - internal

  api:
    image: ghcr.io/<org>/sms-api:${IMAGE_TAG:-latest}
    depends_on:
      migrate:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    # ...
```

### Why this over alternatives

| Pattern | Pros | Cons | Verdict |
|---------|------|------|---------|
| **Dedicated migrate service** (recommended) | Migrations run exactly once per deploy; api restarts don't replay; clear logs (`docker compose logs migrate`); same image so identical Prisma engines | One extra service in compose; operator must understand `service_completed_successfully` condition | chosen |
| Entrypoint script in api image | Simplest; Prisma docs example | Replays migration check on every api restart (idempotent but wasteful); race if multiple api replicas; harder to debug failures | rejected |
| Separate CI/CD step (run migrations before deploy) | No db access needed in compose; validation happens early | Requires DB exposed to CI/CD network — hard for self-hosted server behind NAT; adds deploy complexity | rejected for v1.3 |
| Build-time migration | (none) | Image is environment-specific; CI needs prod DB; impossible to roll back | never |

**Locking caveat (out of scope for v1.3 single-server):** If we ever scale to multiple api replicas, Prisma `migrate deploy` already takes a Postgres advisory lock. The dedicated `migrate` service guarantees only one runner anyway.

### Migration workflow PRECONDITION

The existing `apps/api/package.json` has a custom `db:push` script that runs raw SQL files (`camera_stream_url_unique`, `rls_apply_all`, etc.) outside Prisma's migration history. **This is dev-only**. For production, the team needs to:

1. Convert raw SQL files to proper Prisma migrations: `prisma migrate dev --create-only` then move SQL into the generated migration folder.
2. Commit `apps/api/src/prisma/migrations/*` directories.
3. Production `migrate` service runs `prisma migrate deploy` (no-op `dev`, applies any unapplied migrations from history).

**This is a v1.3 PHASE 0 / pre-Dockerfile prerequisite.** Without it, `migrate deploy` on a fresh prod DB will leave RLS unconfigured and silently break multi-tenancy. PITFALLS researcher should flag this loud.

## Image Layering Detail

### `apps/api` image

```
Layer (cached longest → shortest)
─────────────────────────────────
1. Base node:22-slim                           ← rarely changes
2. apt: openssl, ca-certs, ffmpeg, tini, curl  ← changes with FFmpeg upgrades
3. corepack enable                             ← rare
4. Workspace package.json + lockfile           ← changes when deps added
5. pnpm install --prod                         ← rebuilt only when above changes
6. Application source (built via SWC)          ← changes every commit
7. Prisma generated client                     ← changes when schema.prisma changes
```

**Estimated final size:** ~450 MB (FFmpeg alone is ~250 MB; Node + slim base ~120 MB; deps ~80 MB).

**Optimization opportunities for later phases (NOT v1.3):**
- Use distroless/nonroot for runtime (saves ~30 MB) — adds debug friction now.
- Strip FFmpeg with `--disable-everything --enable-protocol=...` — fragile, defer.

### `apps/web` image

```
Layer
─────
1. Base node:22-slim                           ← rare
2. apt: tini, curl                             ← rare
3. Workspace package.json + lockfile           ← occasional
4. pnpm install                                ← rebuild on dep change
5. Source + .next/standalone build output      ← every commit
```

**Estimated final size:** ~180 MB. Standalone mode keeps only the Next.js modules actually traced as imports.

### `.dockerignore` (both apps share template)

```
# anywhere
node_modules
.next
dist
.git
.env
.env.*
*.log
coverage
.planning
docker-data
.claude
.cursor
.github
**/Dockerfile.dev
**/.DS_Store

# at repo root
docker-compose.yml
deploy/
```

**Critical:** without `.dockerignore`, every `docker build` copies ~2 GB of `node_modules` into context — slow, breaks reproducibility, leaks dev artifacts.

## CI/CD Architecture

### `.github/workflows/build-images.yml`

```yaml
name: Build & Publish Images

on:
  push:
    branches: [main]
    tags: ['v*.*.*']
  workflow_dispatch:

permissions:
  contents: read
  packages: write

env:
  REGISTRY: ghcr.io
  IMAGE_NAMESPACE: ${{ github.repository_owner }}/sms

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        app: [api, web]
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAMESPACE }}-${{ matrix.app }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable={{is_default_branch}}

      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/${{ matrix.app }}/Dockerfile
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=${{ matrix.app }}
          cache-to: type=gha,mode=max,scope=${{ matrix.app }}
```

### Trigger matrix

| Trigger | Tags pushed | Promotion |
|---------|-------------|-----------|
| `push: main` | `:main`, `:latest` | Operators on `:latest` get bleeding edge |
| `push: tags v1.3.0` | `:v1.3.0`, `:1.3`, `:1`, `:latest` (if main) | Production operators pin `:v1.3.0` |
| `pull_request` | none — build only, smoke test the Dockerfile | PR validation, no registry pollution |
| `workflow_dispatch` | manual | Hotfix builds |

### Architecture: amd64 only for v1.3

- The user's prod box is x86_64 Linux (per project context).
- ARM64 builds via QEMU triple build time and have FFmpeg perf concerns (NEON SIMD differs).
- Native ARM runners (`ubuntu-24.04-arm`) became GA in late 2025 — feasible for v1.4+ if Apple Silicon dev parity is wanted.

### `.github/workflows/release.yml` (separate)

```yaml
name: Release
on:
  push:
    tags: ['v*.*.*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          body: |
            Images:
            - `ghcr.io/${{ github.repository_owner }}/sms-api:${{ github.ref_name }}`
            - `ghcr.io/${{ github.repository_owner }}/sms-web:${{ github.ref_name }}`
            
            Update existing deploy:
            ```sh
            export IMAGE_TAG=${{ github.ref_name }}
            docker compose pull
            docker compose up -d
            ```
```

## Secret Flow

### Operator's mental model

```
deploy/.env.production.example
     │ copy
     ▼
deploy/.env  (operator fills, gitignored, perms 600)
     │ env_file
     ▼
docker compose up -d   →   each service env-injects
     │
     ▼
container env vars  ←  read by app at boot (Better Auth, Prisma, MinIO SDK)
```

### `.env.production.example` (deduped, documented)

```bash
# === Required: domain & TLS ===
DOMAIN=app.example.com               # Caddy auto-issues TLS for this
ACME_EMAIL=ops@example.com           # Let's Encrypt account email

# === Required: image tag ===
IMAGE_TAG=v1.3.0                     # ghcr.io tag to pull

# === Required: Postgres ===
POSTGRES_USER=sms
POSTGRES_PASSWORD=                   # generate: openssl rand -hex 24
POSTGRES_DB=sms_platform
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public

# === Required: Redis ===
REDIS_URL=redis://redis:6379

# === Required: Better Auth ===
BETTER_AUTH_SECRET=                  # generate: openssl rand -base64 32
BETTER_AUTH_URL=https://${DOMAIN}

# === Required: MinIO ===
MINIO_ROOT_USER=                     # generate: openssl rand -hex 8
MINIO_ROOT_PASSWORD=                 # generate: openssl rand -hex 24
MINIO_ENDPOINT=minio:9000
MINIO_USE_SSL=false

# === Required: SRS ===
SRS_HTTP_API_URL=http://srs:1985
SRS_CALLBACK_HMAC_SECRET=            # generate: openssl rand -hex 32

# === Required: Web → API ===
NEXT_PUBLIC_API_URL=https://${DOMAIN}

# === Optional ===
LOG_LEVEL=info
NODE_ENV=production
SENTRY_DSN=
```

### Auto-generation on first run

`deploy/scripts/bootstrap.sh` should:

1. Check `deploy/.env` exists; copy from `.env.production.example` if not.
2. For every blank `*_SECRET` / `*_PASSWORD` field, run `openssl rand` and substitute.
3. Prompt operator for `DOMAIN` and `ACME_EMAIL` (the two genuinely-human-required fields).
4. Set `chmod 600 deploy/.env`.
5. `docker compose -f deploy/docker-compose.yml pull`.
6. `docker compose -f deploy/docker-compose.yml up -d`.
7. Tail logs of `migrate` until `service_completed_successfully`.
8. Print final URL: `https://${DOMAIN}`.

### Secret distribution per service

| Service | Reads |
|---------|-------|
| postgres | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| redis | (none — internal-only network is the protection) |
| minio | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` |
| migrate | `DATABASE_URL` |
| api | All Better Auth, DB, Redis, MinIO, SRS, log vars |
| web | `NEXT_PUBLIC_API_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (server-side calls) |
| caddy | `DOMAIN`, `ACME_EMAIL` (passed via Caddyfile env interpolation) |
| srs | `SRS_CALLBACK_HMAC_SECRET` (via srs.conf env-template if used) |

Use `env_file: ../deploy/.env` per service AND `environment:` block to expose only the subset each service needs (principle of least privilege).

## Caddyfile (production)

```caddyfile
{
    email {$ACME_EMAIL}
    # automatic_https on   # default
}

{$DOMAIN} {
    encode zstd gzip

    # API routes
    handle /api/* {
        reverse_proxy api:3003
    }

    # Socket.IO (must preserve trailing slash — see next.config.ts notes)
    handle /socket.io/* {
        reverse_proxy api:3003
    }

    # Better Auth callbacks
    handle /auth/* {
        reverse_proxy api:3003
    }

    # Everything else → web
    handle {
        reverse_proxy web:3000
    }

    log {
        output stdout
        format json
    }
}
```

**Notes:**
- `automatic_https` is on by default — Caddy hits Let's Encrypt staging on first boot. Operator must point DNS A record at the server BEFORE first `up`, or first cert request fails.
- Socket.IO upstream pattern matches the existing dev setup (`apps/web/next.config.ts`) — keeps same-origin cookie domain semantics.
- Add `https://api.{$DOMAIN}` site block ONLY if a future phase splits api to a subdomain. v1.3: same-origin, simpler CORS.

## Build Order: Phase Dependency Graph

This determines the natural ordering for v1.3 phases. Each phase produces an artifact the next phase needs.

```
Phase 0: PRE-DEPLOYMENT PREREQS (tech debt + foundation)
  ├── Convert dev SQL files → Prisma migrations (apps/api/src/prisma/migrations/)
  ├── Add /health endpoint to NestJS api (controller + module)
  ├── Add /api/health route to Next.js web
  ├── StreamProcessor undefined cameraId guard (carry-over tech debt)
  └── outputFileTracingRoot in next.config.ts
                  ↓
Phase 1: APP IMAGES
  ├── apps/api/Dockerfile (multi-stage, non-root, tini, healthcheck)
  ├── apps/api/.dockerignore
  ├── apps/web/Dockerfile (Next standalone)
  ├── apps/web/.dockerignore
  ├── Rename existing apps/api/Dockerfile → Dockerfile.dev
  ├── Update root docker-compose.yml to reference Dockerfile.dev (one-line)
  └── Local validation: docker build both images, `docker run` smoke test
                  ↓
Phase 2: DEPLOY FOLDER + COMPOSE
  ├── deploy/docker-compose.yml (image: refs, two networks, migrate service)
  ├── deploy/srs/srs.conf.production (callback URLs use api:3003)
  ├── deploy/.env.production.example
  ├── deploy/scripts/bootstrap.sh (secret gen + first up)
  └── Local validation: deploy/ folder up on dev machine using locally-built images
                  ↓
Phase 3: REVERSE PROXY + TLS
  ├── deploy/Caddyfile
  ├── Caddy service in deploy/docker-compose.yml
  ├── Validate ACME with letsencrypt staging on a real domain
  └── Document DNS prerequisites in deploy/docs/DOMAIN-SETUP.md
                  ↓
Phase 4: CI/CD
  ├── .github/workflows/build-images.yml (build-push on tag + main)
  ├── .github/workflows/release.yml (GH Release with image tags)
  ├── First test tag (e.g., v1.3.0-rc1) → verify ghcr push
  └── Update deploy/docker-compose.yml to use ghcr image refs by default
                  ↓
Phase 5: OPERATOR EXPERIENCE
  ├── deploy/scripts/update.sh (compose pull + up -d)
  ├── deploy/scripts/backup.sh (pg_dump + minio + caddy_data)
  ├── deploy/scripts/restore.sh
  ├── deploy/README.md (clone → bootstrap → done, in 10 lines)
  └── deploy/docs/{BACKUP-RESTORE.md,TROUBLESHOOTING.md}
                  ↓
Phase 6: SMOKE TEST ON CLEAN VM
  ├── Provision DigitalOcean/Hetzner droplet
  ├── git clone, run bootstrap.sh, configure DNS
  ├── Verify: HTTPS works, login works, camera registers, HLS plays
  ├── Capture timing: clone → first user-login should be < 10 minutes
  └── Document any drift in deploy/README.md
                  ↓
Phase 7: TECH DEBT CARRYOVER (parallelizable with above)
  ├── Pre-existing API test failures triage
  ├── Phase 22 ↔ Phase 17 metadata gap
  └── (Other v1.2 carryovers)
```

**Critical insight for Roadmapper:** Phase 0 is non-negotiable. The current `db:push` chain that runs raw SQL files outside Prisma history will silently break in prod. Schedule Phase 0 BEFORE Dockerfile work, not after.

## Architectural Patterns

### Pattern 1: Pull-only deployment

**What:** Production server holds a single `docker-compose.yml` (and `.env`, `Caddyfile`, `srs.conf`). It NEVER builds images. `docker compose pull && up -d` is the whole update flow.

**When to use:** Self-hosted single-server SaaS where operator is non-developer; security-sensitive (no source on prod box); image immutability matters.

**Trade-offs:**
- Pro: Reproducible (same image SHA everywhere)
- Pro: Fast updates (image pull is bandwidth-bound, not CPU-bound)
- Pro: Auditable (image tag = release version)
- Con: Requires CI/CD (can't `git pull && rebuild` if CI is down)
- Con: Registry uptime is now a dependency (mitigate: ghcr is GitHub's, multiple regions)

### Pattern 2: One-shot init service for migrations

**What:** A service in compose with `restart: "no"` runs migrations and exits; downstream services use `depends_on.condition: service_completed_successfully`.

**When to use:** Any compose-based deployment with stateful migrations; replaces entrypoint scripts.

**Trade-offs:**
- Pro: Single source of truth for migration runs
- Pro: Logs are isolated (`docker compose logs migrate`)
- Pro: api restarts don't replay migration check
- Con: Operator must understand the success-condition wait (documented in README)

### Pattern 3: Edge/internal network split

**What:** Two Docker networks. Public services on `edge`. Stateful services on `internal` (with `internal: true` to block egress).

**When to use:** Multi-service compose where some services should never reach the internet (DBs, caches).

**Trade-offs:**
- Pro: Defense-in-depth — even if MinIO is RCE'd, it can't exfiltrate
- Pro: No host port published for internal services
- Con: Slightly more compose verbosity
- Con: Some services (api) need both networks — explicit listing required

### Pattern 4: Caddy over Traefik (for fixed-services deployments)

**What:** Choose a static-config reverse proxy when the service set is fixed and small. Choose label-based auto-discovery (Traefik) when services are dynamic.

**When to use:** v1.3 has 6 services, set-in-stone. Caddy is the right tool.

**Trade-offs (Caddy):**
- Pro: Zero-config TLS — no JSON, no certResolvers config block
- Pro: No Docker socket exposure (Traefik's biggest CVE surface)
- Pro: ~30 MB RAM vs Traefik's ~80 MB
- Pro: HTTP/3 by default (`udp 443`)
- Con: No auto-discovery (don't care — services are static)
- Con: No native dashboard (don't care — `caddy reload` from a script is fine)

### Pattern 5: Multi-stage Dockerfile with prod-deps re-install

**What:** Stage 1 installs ALL deps for build. Stage 3 re-installs only `--prod` deps in a fresh layer that runtime copies. Avoids carrying dev dependencies into production image.

**When to use:** Any TypeScript/JS project where dev and prod deps differ significantly.

**Trade-offs:**
- Pro: Smaller image (no @types, no testing libs, no build tools)
- Pro: Tighter security surface
- Con: Slightly slower CI build (deps installed twice)
- Con: More Dockerfile complexity (4 stages)

## Data Flows (Production Specific)

### First-time deployment

```
operator                                          fresh VM
   │                                                 │
   ├── ssh prod-vm                                   │
   ├── git clone github.com/<org>/sms-app            │
   ├── cd sms-app/deploy                             │
   ├── ./scripts/bootstrap.sh                        │
   │       │                                         │
   │       ├── prompt: DOMAIN, ACME_EMAIL            │
   │       ├── openssl rand → fill secrets           │
   │       ├── chmod 600 .env                        │
   │       ├── docker compose pull (api,web,...)     │
   │       └── docker compose up -d                  │
   │                                                 │
   │            postgres (healthcheck wait)          │
   │                  │                              │
   │                  ▼                              │
   │            migrate (prisma migrate deploy)      │
   │                  │ (exit 0)                     │
   │                  ▼                              │
   │            api + web + caddy + srs (parallel)   │
   │                  │                              │
   │                  ▼                              │
   │            caddy → ACME challenge → Let's Encrypt
   │                  │                              │
   │                  ▼                              │
   ├── browse https://${DOMAIN}                      │
   └── login → register first org via super-admin    │
```

### Update flow

```
1. dev pushes git tag v1.3.1
2. GH Actions builds + pushes ghcr.io/...:v1.3.1
3. operator: cd deploy && IMAGE_TAG=v1.3.1 ./scripts/update.sh
   ├── docker compose pull
   ├── docker compose up -d   (recreates only changed services)
   │     ├── postgres unchanged → no restart
   │     ├── migrate runs again with new image (no-op if no new migrations)
   │     ├── api recreated with new image
   │     ├── web recreated with new image
   │     └── caddy unchanged
   └── docker compose ps → all healthy
```

### RTSP camera → viewer (unchanged from v1.2 architecture)

```
RTSP camera (public IP)
       │ pull
       ▼
api (FFmpeg child) ──→ srs:1935 (RTMP push)
                              │
                              ▼
                        srs:8080 (HLS m3u8 + .ts)
                              │
                              │ direct (NOT through Caddy)
                              ▼
                        viewer browser (hls.js)
```

## Scaling Considerations

| Scale | Architecture posture |
|-------|----------------------|
| **v1.3 target: 1 server, ~50 cameras, ~100 viewers** | Single-server compose. All services on one box. Sufficient. |
| 200 cameras / 1k viewers | Same compose, bigger box (32 GB RAM, 8 vCPU, NVMe). FFmpeg is the bottleneck. |
| 1k cameras / 10k viewers | Split SRS to dedicated box (origin + 2 edges). API + Postgres + Redis stay together. Caddy → terminate at edge nodes for HLS. |
| Multi-region | Out of scope per PROJECT.md. Architecture would change fundamentally (managed Postgres, S3 instead of MinIO, K8s). |

**v1.3 scope:** Don't over-architect. The compose stack is fine until ~500 cameras.

## Anti-Patterns (Production-Specific)

### Anti-Pattern 1: Bind-mounting source code in production compose

**What people do:** Copy dev compose to prod, leaving `volumes: - ./apps/api:/app` mounts.
**Why wrong:** Prod box has no source; bind would fail OR (worse) succeed on a stale clone and run wrong code.
**Do instead:** Production compose uses `image:` only — no `build:`, no source bind mounts.

### Anti-Pattern 2: Running migrations in api entrypoint with multiple replicas

**What people do:** `command: sh -c "prisma migrate deploy && node dist/main"` — fine for single replica, breaks at 2+.
**Why wrong:** Race condition. Prisma takes a Postgres advisory lock, but a failed migration leaves both replicas crashing in a loop.
**Do instead:** Dedicated `migrate` service with `restart: "no"`.

### Anti-Pattern 3: Exposing internal services on host ports "for debugging"

**What people do:** `ports: - "5432:5432"` on postgres in prod, "just in case I need to connect with a GUI".
**Why wrong:** Anyone can scan the IP and try `sms:weakpassword`. RCE-equivalent risk.
**Do instead:** SSH tunnel from operator's laptop: `ssh -L 5432:localhost:5432 prod-vm`. No host port published.

### Anti-Pattern 4: Letting `:latest` be the only tag

**What people do:** Operator's compose pins `image: ...:latest`. New CI build → silent surprise.
**Why wrong:** No way to roll back; can't audit what's running.
**Do instead:** Operator pins `IMAGE_TAG=v1.3.0` in `.env`; `:latest` exists only for non-production sandboxes.

### Anti-Pattern 5: Caddy + Traefik both for "more flexibility"

**What people do:** Read both blogs, decide to use both for different services.
**Why wrong:** Two reverse proxies, two TLS managers, two failure modes, two cert stores.
**Do instead:** Pick one. Caddy for v1.3.

### Anti-Pattern 6: Mounting Docker socket into a container

**What people do:** Traefik label-based auto-discovery requires `/var/run/docker.sock:/var/run/docker.sock`.
**Why wrong:** Container with Docker socket = root on host. Top CVE category.
**Do instead:** Caddy doesn't need it. If using Traefik, use a docker-socket-proxy (additional service). Avoid for v1.3.

### Anti-Pattern 7: Single Dockerfile for dev AND prod

**What people do:** One `Dockerfile` toggles behavior on `NODE_ENV`. Saves a file.
**Why wrong:** Build context, layer cache, dependency install, healthcheck all differ. The toggle becomes a maintenance burden.
**Do instead:** `Dockerfile` (prod) and `Dockerfile.dev` (dev). Different concerns, different files.

## Integration Points

### External services

| Service | Integration | Notes |
|---------|-------------|-------|
| Let's Encrypt | Caddy ACME (port 80 + DNS) | Operator must point DNS at server BEFORE first up; cert lives in `caddy_data` named volume — back it up |
| GitHub Container Registry | `docker compose pull` | Public images for OSS; private images need `docker login ghcr.io` once on prod box |
| SMTP (future) | Better Auth password reset | v1.3 OUT OF SCOPE — flag for v1.4 |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| caddy → api | HTTP `api:3003` | Same `edge` network |
| caddy → web | HTTP `web:3000` | Same `edge` network |
| api → postgres | TCP `postgres:5432` | Internal network |
| api → redis | TCP `redis:6379` | Internal network |
| api → minio | HTTP `minio:9000` | Internal network |
| api → srs | HTTP `srs:1985` | Edge network (so SRS DNS resolves) |
| srs → api | HTTP `api:3003/srs/callbacks/*` | Edge network — SRS dials api for `on_publish`, `on_play` |
| web → api | HTTPS `https://${DOMAIN}/api/*` | Through Caddy (NOT direct, so cookies stay same-origin) |
| migrate → postgres | TCP `postgres:5432` | Internal network; runs once and exits |

## Verification Checklist (for Pitfalls researcher to cross-check)

- [ ] Prisma migration history is committed BEFORE Dockerfile phase
- [ ] `next.config.ts` has `outputFileTracingRoot` set for monorepo standalone
- [ ] `.dockerignore` excludes `.env*`, `.git`, `.planning/`
- [ ] SRS HTTP API (1985) bound to `127.0.0.1`, not `0.0.0.0`
- [ ] Postgres / Redis / MinIO have NO `ports:` directive in production compose
- [ ] Caddy is mounted with directory (not file) at `/etc/caddy/`
- [ ] DNS A record points at server BEFORE first `docker compose up -d`
- [ ] `caddy_data` volume is in the backup list (losing certs = LE rate limit)
- [ ] `migrate` service uses `service_completed_successfully` condition
- [ ] api uses `tini` as ENTRYPOINT (FFmpeg child reaping)
- [ ] api Dockerfile installs FFmpeg in runtime stage (not just build)
- [ ] amd64-only build is documented (not silently chosen)
- [ ] `IMAGE_TAG` env var is mandatory in prod compose (not defaulted to `:latest`)
- [ ] Better Auth `BETTER_AUTH_URL` matches `https://${DOMAIN}` exactly (no trailing slash)
- [ ] Socket.IO trailing-slash rewrite preserved at Caddy layer (matches `next.config.ts` pattern)

## Sources

- [Caddy on Docker Hub — official image guidance](https://hub.docker.com/_/caddy) — volumes (`/data`, `/config`), Caddyfile mount pattern, ports (HIGH confidence, official)
- [Prisma deployment with Docker — official docs](https://www.prisma.io/docs/guides/deployment/docker) — entrypoint vs init pattern trade-offs (HIGH confidence, official)
- [Next.js standalone monorepo Discussion #35437](https://github.com/vercel/next.js/discussions/35437) — `outputFileTracingRoot` requirement for monorepos (HIGH confidence, official discussion)
- [docker/build-push-action GitHub](https://github.com/docker/build-push-action) — buildx + GHA cache patterns (HIGH confidence, official)
- [Docker GHA cache backend docs](https://docs.docker.com/build/cache/backends/gha/) — `cache-from: type=gha` configuration (HIGH confidence, official)
- [Reverse Proxy Comparison: Traefik vs Caddy vs Nginx (Docker)](https://www.programonaut.com/reverse-proxies-compared-traefik-vs-caddy-vs-nginx-docker/) — feature/RAM/security comparison (MEDIUM confidence, blog but consistent with multiple sources)
- [Nginx Proxy Manager vs Traefik vs Caddy 2026](https://earezki.com/ai-news/2026-04-23-nginx-proxy-manager-vs-traefik-vs-caddy-which-reverse-proxy-should-you-pick-in-2026/) — current-year comparison (MEDIUM confidence, blog)
- [Next.js 15 Standalone Mode & Docker Optimization](https://ketan-chavan.medium.com/next-js-15-self-hosting-with-docker-complete-guide-0826e15236da) — multi-stage standalone Dockerfile reference (MEDIUM confidence, blog)
- [kristiyan-velkov/nextjs-prod-dockerfile](https://github.com/kristiyan-velkov/nextjs-prod-dockerfile) — production Dockerfile reference repo (MEDIUM confidence, community)
- [Prisma migrate deploy with Docker — notiz.dev](https://notiz.dev/blog/prisma-migrate-deploy-with-docker/) — entrypoint script example (MEDIUM confidence, blog matching official guidance)
- [SRS HTTP API v6 docs](https://ossrs.net/lts/en-us/docs/v6/doc/http-api) — confirms admin API at 1985 should not be public (HIGH confidence, official, from STACK.md)
- [SRS HLS docs v7](https://ossrs.net/lts/en-us/docs/v7/doc/hls) — HLS direct serving on 8080 (HIGH confidence, official, from STACK.md)

---

*Architecture research for: v1.3 Production Deployment of SMS Platform*
*Researched: 2026-04-27*
*Builds on existing codebase: NestJS 11 + Next.js 15 + Postgres 16 + Prisma 6 + Redis 7 + SRS v6 + FFmpeg 7 + MinIO + Better Auth*
