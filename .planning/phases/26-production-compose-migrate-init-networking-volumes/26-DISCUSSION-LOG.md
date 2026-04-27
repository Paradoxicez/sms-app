# Phase 26: Production Compose + Migrate Init + Networking + Volumes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `26-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 26-production-compose-migrate-init-networking-volumes
**Areas discussed:** First-run init pipeline, Network topology, HLS volume strategy, Seed defaults + bucket policy, init-secrets.sh ergonomics, Logging + restart policy

---

## Gray area selection

**User selected:** All 4 primary + both secondary (full coverage).

| Area | Selected | Notes |
|------|----------|-------|
| First-run init pipeline | ✓ | sms-migrate composition |
| Network topology | ✓ | edge vs internal |
| HLS volume strategy | ✓ | named volume vs bind |
| Seed defaults + bucket policy | ✓ | Stream Profile + MinIO policy |
| init-secrets.sh ergonomics | ✓ | idempotency + algorithm |
| Logging + restart policy | ✓ | DEPLOY-13 specifics |

---

## First-run init pipeline

### Q1: Number of init services

| Option | Description | Selected |
|--------|-------------|----------|
| 1 init container, all 3 jobs | sms-migrate runs prisma + buckets + seed in sequence | ✓ |
| 3 init services (split) | Separate sms-migrate / sms-init-buckets / sms-init-seed | |
| api self-init on boot | api handles all init in NestJS bootstrap | |

**User's choice:** 1 init container

**Rationale:** Composability (1 service depends_on), unified log, single image pull. Failure isolation trade-off acceptable since logs identify which step failed.

### Q2: init image source

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse api image | `ghcr.io/${GHCR_ORG}/sms-api:${IMAGE_TAG}` — has prisma + node + scripts | ✓ |
| Lightweight `node:22-bookworm-slim` | Install Prisma CLI + mc on boot | |
| Two images (api + minio/mc) | Split migrate (api image) and bucket-create (mc image) | |

**User's choice:** Reuse api image

**Rationale:** Phase 25 Dockerfile ships `prisma client + migrations + node`; init scripts compile via SWC. 1 image pull, smaller surface.

### Q3: failure mode

| Option | Description | Selected |
|--------|-------------|----------|
| `restart: "no"` + exit non-zero | Operator handles via compose ps + logs (DEPLOY-14 compliant) | ✓ |
| `restart: on-failure:3` | Auto-retry transient | |

**User's choice:** restart: "no" + exit non-zero (DEPLOY-14 compliant)

---

## Network topology

### Q1: Network names

| Option | Description | Selected |
|--------|-------------|----------|
| edge + internal | Per ROADMAP DEPLOY-11 spec | ✓ |
| frontend + backend | Generic | |
| public + private | Exposure semantic | |

**User's choice:** edge + internal

### Q2: api network membership

| Option | Description | Selected |
|--------|-------------|----------|
| Both edge + internal | Caddy reaches via edge; postgres/redis/minio via internal | ✓ |
| edge only + host loopback for stateful | Postgres binds to 127.0.0.1 | |

**User's choice:** Both edge + internal

### Q3: srs network + ports

| Option | Description | Selected |
|--------|-------------|----------|
| edge only; 1935+8080+10080+8000/udp public; 1985 → 127.0.0.1 | RTMP/SRT camera ingress + HLS public; admin port host-loopback only | ✓ |
| edge + internal (api ↔ srs:1985 internal) | api hits srs admin via internal network | |

**User's choice:** edge only with 1985 → 127.0.0.1

---

## HLS volume strategy

### Q1: Storage backend

| Option | Description | Selected |
|--------|-------------|----------|
| Named volume `hls_data` | SRS rw + api ro share | ✓ |
| Bind mount `./docker-data/srs-hls` | Operator-visible directory | |
| Hybrid (override.yml) | Named volume + dev override for debug | |

**User's choice:** Named volume

### Q2: api mount mode

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only (`:ro`) | Defense-in-depth; SRS owns writes | ✓ |
| Read-write | api can also clean up | |

**User's choice:** Read-only

### Q3: `recordings` bucket policy

| Option | Description | Selected |
|--------|-------------|----------|
| Private + signed URL via api | Browser requests signed URL after auth | ✓ |
| Public-read + obscure URL | Public bucket, UUID v4 keys | |

**User's choice:** Private + signed URL

### Q4: `avatars` bucket policy

| Option | Description | Selected |
|--------|-------------|----------|
| Public-read | Anonymous read; CDN-friendly | ✓ |
| Private + signed URL | Sign URL per render | |

**User's choice:** Public-read

---

## Seed defaults

### Q1: Stream Profile seed quantity

| Option | Description | Selected |
|--------|-------------|----------|
| 1 generic 1080p H.264 | name=default, h264, 1920x1080, 2500k, 25fps | ✓ |
| 3 profiles (Low/Med/High) | Tiered options | |
| Empty seed | Operator creates manually | |

**User's choice:** 1 generic 1080p H.264 default

---

## init-secrets.sh ergonomics

### Q1: Idempotency + algorithm

| Option | Description | Selected |
|--------|-------------|----------|
| Idempotent + base64 | Skip already-set; `openssl rand -base64 32` | ✓ |
| Always regenerate + hex | Fresh every run; `openssl rand -hex 16` | |
| Generate from template + ask before overwrite | Template-driven with confirmation | |

**User's choice:** Idempotent + base64

---

## Logging + restart policy

### Q1: Logging scope + restart

| Option | Description | Selected |
|--------|-------------|----------|
| json-file 10m×5 stack-wide + restart: unless-stopped | DEPLOY-13 compliant; YAML anchor pattern | ✓ |
| json-file stateful only | App services (api/web/srs) use Docker default | |
| No logging block | Default daemon driver, no rotation | |

**User's choice:** json-file 10m×5 stack-wide + restart: unless-stopped

---

## Claude's Discretion (deferred to planning/implementation)

- Exact YAML formatting (anchor placement, indentation)
- Healthcheck timing tuning per service (start_period values)
- init-buckets.js exact code (MinIO client error handling)
- init-secrets.sh shebang + portability
- Network MTU, DNS resolver (defaults)
- Compose project name (`name: sms-platform`)
- Whether to add `extra_hosts` block (Phase 27 may need)
- IP address ranges for networks (Docker auto-assigns)

## Deferred Ideas (out of scope)

- `docker-compose.override.yml` for dev/debug bind mounts
- Resource limits (CPU/memory caps)
- Compose profiles for selective service enable/disable
- External database support (DATABASE_URL → managed Postgres)
- Multi-arch image pull (Phase 26 amd64-only deployment)
- `secrets:` block (Docker Swarm) — not using swarm
- Named network IP pinning
- Watchtower auto-update
- Vault/sops integration for secrets
- Compose `extends:` for env inheritance
