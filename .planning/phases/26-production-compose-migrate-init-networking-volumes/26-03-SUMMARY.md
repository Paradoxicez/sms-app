---
phase: 26-production-compose-migrate-init-networking-volumes
plan: 03
subsystem: deploy/compose
tags: [deploy, docker-compose, networking, volumes, init-container, ga-blocker, sms-migrate, srs]
requirements: [DEPLOY-10, DEPLOY-11, DEPLOY-12, DEPLOY-13, DEPLOY-14, DEPLOY-15, DEPLOY-16]
dependency-graph:
  requires:
    - "26-01 — apps/api/src/scripts/{init-buckets,seed-stream-profile}.ts compiled to dist/scripts/*.js inside the api image (Phase 25 builder stage)"
    - "26-02 — deploy/.env.production.example variable surface (DOMAIN, GHCR_ORG, IMAGE_TAG, DB_PASSWORD, NEXTAUTH_SECRET, BETTER_AUTH_SECRET, JWT_PLAYBACK_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, POSTGRES_USER, POSTGRES_DB, REDIS_PASSWORD)"
    - "Phase 25 — apps/api/Dockerfile + apps/web/Dockerfile (image-side HEALTHCHECK on /api/health for both; api ENTRYPOINT tini --; api uid 1001 with WORKDIR /app/apps/api; api image bundles ffmpeg + tini + dist/ + src/prisma/migrations/ + node_modules/prisma)"
  provides:
    - "deploy/docker-compose.yml — single canonical production compose for v1.3 stack"
    - "Two-network topology (edge bridge + internal:true bridge) — service-DNS-only inter-service comms"
    - "5 named volumes: postgres_data, redis_data, minio_data, caddy_data (declared for Phase 27), hls_data (shared srs RW + api RO)"
    - "x-logging YAML anchor &default-logging — single source of truth for json-file rotation across 6 long-running services"
    - "sms-migrate boot contract: 3-step init chain (prisma migrate deploy → init-buckets.js → seed-stream-profile.js) with restart: \"no\" + service_completed_successfully gate"
    - "Phase 27 hand-off: caddy can attach to existing edge network + caddy_data volume without docker compose down -v"
    - "Phase 29 hand-off: bootstrap.sh / update.sh wrap docker compose --env-file deploy/.env up -d / pull"
  affects:
    - "26-04 (compose syntax validation — runs docker compose config --quiet against this file)"
    - "27-* (Caddy reverse proxy adds caddy service joining edge network, mounts caddy_data + Caddyfile bind)"
    - "29-* (operator UX scripts wrap this compose; bin/sms create-admin populates Organization rows that seed-stream-profile.js back-fills on next up)"
    - "30-* (clean-VM smoke test boots this compose with init-secrets-populated deploy/.env, runs 16-point ROADMAP §Phase 30 checklist)"
tech-stack:
  added:
    - "Compose v2 syntax (name: top-level, no version: key, depends_on long-form with condition: service_healthy / service_completed_successfully, YAML anchors)"
    - "MinIO pinned tag RELEASE.2025-04-22T22-12-26Z — last community tag before 2026-04-25 upstream archive"
  patterns:
    - "Two-network defense-in-depth: edge (bridge) + internal (bridge + internal:true). internal:true blocks egress so postgres/redis/minio cannot reach internet even if RCE'd."
    - "Init-container chain via sh -c heredoc + entrypoint override of image's tini — preserves zombie reaping during multi-step boot."
    - "$$VAR escaping inside healthcheck CMD-SHELL — single $ would interpolate at compose-load, $$ defers to container shell expansion."
    - "Image-side HEALTHCHECK trust (D-20) — Phase 25 already declared HEALTHCHECK for api/web; compose does NOT override (single source of truth)."
    - "stop_grace_period: 30s on api — overrides Docker's 10s default to give ResilienceService time to drain in-flight FFmpeg child processes."
    - "Volume forward-declaration (caddy_data) — declaring a volume one phase before its consumer prevents docker compose down -v during the 26→27 transition."
key-files:
  created:
    - deploy/docker-compose.yml
  modified: []
key-decisions:
  - "Honored every D-XX from CONTEXT.md verbatim. No deviations from the 25-decision lock-set; the plan author had already reconciled all known tensions (e.g., D-04 vs Pitfall 8, D-09 vs operator HLS direct fetch)."
  - "Used `node node_modules/prisma/build/index.js migrate deploy` rather than `npx prisma migrate deploy` — api image USER=app (uid 1001) lacks HOME write-perm for npx cache. Direct JS entrypoint dodges the npx layer."
  - "Single $ vs $$ in pg_isready healthcheck — chose $$ so $POSTGRES_USER expands inside the postgres container (where it IS set) rather than at compose load time (where it would resolve from the host shell)."
  - "MinIO tag RELEASE.2025-04-22T22-12-26Z — the last community-licensed tag before MinIO Inc. archived the open-source repo on 2026-04-25. Documented in CONTEXT.md (line 13) and SUMMARY 26-01 was already aware. Future pinning decisions (e.g., AGPL fork) deferred to v1.3.x DEPLOY-31."
  - "caddy_data volume declared in Phase 26 (not Phase 27) — Compose recreates volumes on declaration changes; pre-declaring lets Phase 27 add the caddy service without volume churn."
patterns-established:
  - "Production compose lives at deploy/docker-compose.yml (per CLAUDE.md Deploy Folder Convention). Future compose changes land here, NEVER alter the root docker-compose.yml (dev only)."
  - "Operator boot one-liner: docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d. Phase 29 bootstrap.sh wraps this; documentation in deploy/README.md (Phase 29) cross-references it."
  - "Service-DNS-only addressing inside compose: api references postgres as `postgres:5432`, redis as `redis://redis:6379`, srs API as `http://srs:1985`. NO `host.docker.internal` (Pitfall 5 — fails on Linux)."
metrics:
  duration: "~2m"
  tasks: 1
  files_created: 1
  files_modified: 0
  completed: "2026-04-28"
---

# Phase 26 Plan 03: Production Docker Compose (Migrate-init + Networking + Volumes) Summary

**One-liner:** Single 273-line `deploy/docker-compose.yml` brings up the entire v1.3 stack — Postgres + Redis + MinIO + SRS + sms-migrate + api + web — with two-network isolation (edge + internal:true), five named volumes (incl. caddy_data forward-declared for Phase 27), an init-container chain that runs prisma migrate deploy + init-buckets.js + seed-stream-profile.js exactly once, and a YAML-anchor logging contract that rotates 10m × 5 across every long-running service.

## Topology

### Service / Network / Volume Graph

```
                           ┌──────────────────────────┐
                           │   Internet (Phase 27)    │
                           └────────────┬─────────────┘
                                        │ TLS via Caddy (Phase 27 attaches here)
                          ┌─────────────▼──────────────┐
                          │       edge (bridge)        │
                          │  ┌───────┐ ┌──────┐ ┌───┐  │
                          │  │  web  │ │ api  │ │srs│  │
                          │  └───┬───┘ └───┬──┘ └─┬─┘  │
                          └──────┼─────────┼──────┼────┘
                                 │         │      │
                                 │   ┌─────┘      │
                                 │   │            │ srs:1935 RTMP / 8000 udp /
                                 │   │            │ 10080 udp / 8080 HLS / 1985 (loopback only)
                                 │   ▼
                          ┌──────┼────────────────────────────┐
                          │      │   internal (bridge,        │
                          │      │   internal:true — no egress)│
                          │  ┌───┴───┐ ┌──────┐ ┌──────┐ ┌─────────────┐
                          │  │  api  │ │ pg   │ │redis │ │ minio       │
                          │  │ (also │ │ :5432│ │:6379 │ │ :9000/:9001 │
                          │  │ on    │ └──────┘ └──────┘ └─────────────┘
                          │  │ edge) │      ▲                    ▲
                          │  └───────┘      │                    │
                          │             ┌───┴───┐                │
                          │             │ sms-  │  prisma migrate│
                          │             │migrate│  deploy →      │
                          │             │ (init)│  init-buckets──┘
                          │             └───────┘  → seed-profile
                          └────────────────────────────────────────┘

Volumes (named, persistent across `docker compose up -d`):
  postgres_data → postgres:/var/lib/postgresql/data
  redis_data    → redis:/data
  minio_data    → minio:/data
  caddy_data    → (declared; Phase 27 caddy service mounts /data)
  hls_data      → srs:/usr/local/srs/objs/nginx/html  (RW)
                → api:/srs-hls                         (RO — D-09)

Bind mount (single, read-only):
  ../config/srs.conf → srs:/usr/local/srs/conf/srs.conf:ro
```

### Network Membership Matrix

| Service       | edge | internal | Why                                                                                       |
| ------------- | :--: | :------: | ----------------------------------------------------------------------------------------- |
| postgres      |  no  |   yes    | DB; only api + sms-migrate need to reach it                                               |
| redis         |  no  |   yes    | Queue/cache; only api + sms-migrate need it                                               |
| minio         |  no  |   yes    | Object store; api signs URLs (browser uses public DOMAIN via Caddy in Phase 27)           |
| sms-migrate   |  no  |   yes    | One-shot init; needs postgres + minio only                                                |
| srs           | yes  |    no    | Public ingest/delivery; api reaches it via edge                                           |
| api           | yes  |   yes    | Both — DB/cache/storage on internal, srs + Caddy reach on edge                            |
| web           | yes  |    no    | Browser-facing via Caddy; SSR calls api on edge                                           |
| caddy (P27)   | yes  |    no    | Public-only; no DB/cache access                                                           |

### Port Surface (host-bound)

| Port           | Bind              | Protocol | Purpose                                  |
| -------------- | ----------------- | -------- | ---------------------------------------- |
| 1935           | 0.0.0.0           | TCP      | RTMP camera ingest                       |
| **127.0.0.1:1985** | **loopback only** | TCP      | SRS admin API (operator SSH-tunnel only) |
| 8000           | 0.0.0.0           | UDP      | WebRTC                                   |
| 8080           | 0.0.0.0           | TCP      | HLS direct (Phase 27 reverse-proxies)    |
| 10080          | 0.0.0.0           | UDP      | SRT                                      |

postgres / redis / minio / sms-migrate / api / web have **NO** host ports — they're reachable only inside the compose project. Phase 27 adds 80/443 via Caddy.

## Init Chain (sms-migrate)

The single deferred-cost init container that prevents api from booting against an unmigrated DB:

```
sms-migrate (restart: "no") starts when postgres + redis + minio are healthy
  │
  ├─ Step 1/3: node node_modules/prisma/build/index.js migrate deploy
  │            └─ Replays apps/api/src/prisma/migrations/ via Phase 23 0_init baseline
  │
  ├─ Step 2/3: node dist/scripts/init-buckets.js  (Plan 01 contract)
  │            ├─ avatars     → makeBucket + setBucketPolicy s3:GetObject (public-read, D-11)
  │            └─ recordings  → makeBucket only (private, D-10)
  │
  └─ Step 3/3: node dist/scripts/seed-stream-profile.js  (Plan 01 contract)
               ├─ Reads DATABASE_URL_MIGRATE ?? DATABASE_URL
               └─ For every Organization with 0 profiles, INSERT default 1080p H.264 / 2500kbps / 25fps profile

Exit 0 → api transitions Created → Running (depends_on condition: service_completed_successfully)
Exit 1 → api stays at Created; operator reads `docker compose logs sms-migrate` (D-03 fail-fast)
```

The chain is idempotent on every dimension:
- `prisma migrate deploy` — replays only unapplied migrations; safe to re-run
- `init-buckets.js` — guards on `bucketExists()` before `makeBucket()` (Plan 01)
- `seed-stream-profile.js` — guards on per-org `count() > 0` before `create()` (Plan 01)

So `docker compose up -d` after a `bin/sms create-admin` (Phase 29) re-runs the chain and back-fills the default StreamProfile for the freshly-created org without touching anything else.

## Hand-off Contracts

### Phase 27 (Caddy reverse proxy) — what to add

```yaml
# Phase 27 will add this BLOCK to deploy/docker-compose.yml — DO NOT modify
# anything else. caddy_data already exists in Plan 03; just attach.
services:
  caddy:
    image: caddy:2.11-alpine   # decision in Phase 27
    restart: unless-stopped
    init: true
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"   # HTTP/3
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro    # bind, repo-tracked
      - caddy_data:/data                        # ALREADY DECLARED in Plan 03
      - caddy_config:/config                    # NEW volume in Phase 27
    environment:
      DOMAIN: ${DOMAIN}
    depends_on:
      api:
        condition: service_healthy
      web:
        condition: service_healthy
    networks:
      - edge
    logging: *default-logging
```

Phase 27 must:
- Reuse the `*default-logging` anchor (no per-service logging config drift).
- Join `edge` only (Caddy never needs DB/cache).
- Add `caddy_config` to the top-level `volumes:` block (caddy_data is already there).
- NOT modify any of the 7 services already in this compose — strictly additive.

### Phase 29 (operator UX scripts) — what to wrap

`deploy/scripts/bootstrap.sh` runs once on a fresh VM:

```bash
# Phase 29 bootstrap.sh outline (NOT in this plan's scope)
deploy/scripts/init-secrets.sh         # Phase 26 Plan 02 — fills change-me-* placeholders
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
# Wait for sms-migrate to exit 0
deploy/scripts/bin-sms create-admin    # Phase 29 — populates Organization
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d  # idempotent re-run; back-fills default profile
```

`deploy/scripts/update.sh` for ongoing image pulls:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
# Compose detects new image digest, recreates api/web/srs in place; sms-migrate
# re-runs migrate deploy on the new schema (idempotent)
```

Both scripts are POSIX bash per CLAUDE.md Deploy Folder Convention rule 4.

## CONTEXT.md Decision Honor Audit

Every D-XX from CONTEXT.md `<decisions>` was honored exactly:

| Decision | How honored                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------- |
| D-01     | One canonical compose file at `deploy/docker-compose.yml` — no overrides yet                      |
| D-02     | sms-migrate reuses `ghcr.io/${GHCR_ORG}/sms-api:${IMAGE_TAG}` (same image as api)                  |
| D-03     | sms-migrate `restart: "no"`; non-zero exit visible in `docker compose logs sms-migrate`            |
| D-04     | api/web image-side HEALTHCHECK trusted; no compose override                                       |
| D-05     | Two networks: `edge` (bridge) + `internal` (bridge + internal:true)                               |
| D-06     | Service membership: srs+web on edge; postgres+redis+minio+sms-migrate on internal; api on both    |
| D-07     | SRS 1985 → `127.0.0.1:1985:1985` (loopback only)                                                  |
| D-08     | 5 named volumes — postgres_data, redis_data, minio_data, caddy_data, hls_data                     |
| D-09     | hls_data RW on srs (`/usr/local/srs/objs/nginx/html`), RO on api (`/srs-hls:ro`)                  |
| D-10     | recordings bucket private (no setBucketPolicy in init-buckets.js per Plan 01)                     |
| D-11     | avatars bucket public-read (init-buckets.js calls setBucketPolicy s3:GetObject per Plan 01)       |
| D-13     | Every long-running service: healthcheck with start_period; api/web exempt per D-20                |
| D-14     | All secrets via `${VAR}` from `--env-file deploy/.env`; no hardcoded values                       |
| D-15     | Operator-fillable: DOMAIN, GHCR_ORG, ADMIN_EMAIL marked required (no defaults) in Plan 02 .env    |
| D-16     | x-logging YAML anchor `&default-logging`; sms-migrate intentionally excluded                      |
| D-17     | All long-running services: `restart: unless-stopped`                                              |
| D-18     | All long-running services: `init: true`                                                           |
| D-19     | api: `stop_grace_period: 30s`                                                                     |
| D-20     | api/web NO compose-level healthcheck override (image-side wins)                                   |
| D-21     | api `depends_on.sms-migrate.condition: service_completed_successfully`                            |
| D-22     | Compose v2 syntax — `name: sms-platform` top-level, no `version:` field                           |
| D-23     | All images: `ghcr.io/${GHCR_ORG}/sms-{api,web}:${IMAGE_TAG:-latest}` (DEPLOY-10)                   |
| D-24     | NO `build:` directive anywhere                                                                    |
| D-25     | deploy/.env (Plan 02) groups variables in 4 sections; this plan consumes the surface              |

## MinIO Image Tag Pinning

**Pinned to:** `minio/minio:RELEASE.2025-04-22T22-12-26Z`

**Rationale:** MinIO Inc. archived the open-source `minio/minio` repository on 2026-04-25 and is moving the project to a non-OSS-friendly license. The April 22 2025 tag is the last community-licensed release before the archive. Pulling `:latest` would risk landing on a future tag with license terms incompatible with self-hosted SaaS resale. Documented in CONTEXT.md (line 13) and aligned with v1.3 research consensus.

**Future migration path (deferred to v1.3.x):** evaluate AGPL forks (e.g., `cubefs/minio`, `garage`) or migrate to `s3-compatible` providers. Tracked under DEPLOY-31 in REQUIREMENTS.md (post-GA backlog).

## Threat Mitigations Implemented

| Threat ID | Disposition | How mitigated in this plan                                                                                                                |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| T-26-10   | mitigate    | `ports:` block ONLY on srs (verified by `grep -E "^\s+ports:" \| wc -l` == 1); SRS 1985 line literally `127.0.0.1:1985:1985`               |
| T-26-11   | mitigate    | sms-migrate `depends_on.{postgres,redis,minio}.condition: service_healthy`; api `depends_on.sms-migrate.condition: service_completed_successfully` |
| T-26-12   | accept      | x-logging anchor + per-step `[sms-migrate] Step N/3:` echoes; `docker compose logs sms-migrate` is the audit trail                         |
| T-26-13   | mitigate    | Phase 24 root .dockerignore + Phase 25 per-app .dockerignore exclude `.env*`; this compose only injects via `--env-file`, never bakes      |
| T-26-14   | mitigate    | `init: true` on all 6 long-running services (postgres, redis, minio, srs, api, web); api also has Phase 25 image-side ENTRYPOINT tini     |
| T-26-15   | mitigate    | api `stop_grace_period: 30s` (verified literal in compose)                                                                                 |
| T-26-16   | mitigate    | `internal: true` on internal network — postgres/redis/minio cannot egress under any circumstances                                          |
| T-26-17   | mitigate    | hls_data mounted `:ro` on api (verified literal `/srs-hls:ro` in compose)                                                                  |
| T-26-18   | mitigate    | Plan 01's init-buckets.js does NOT call setBucketPolicy on recordings; this compose runs that script unchanged                             |

All 9 threats accounted for. T-26-13 specifically depends on Phase 24/25 closures and was not re-implemented here (correct — defense-in-depth would only add risk).

## Verification

### Automated checks (per `<verify>` block)

| Check                                                        | Result |
| ------------------------------------------------------------ | ------ |
| `test -f deploy/docker-compose.yml`                          | PASS   |
| 25-substring/forbidden-substring check (Node script)         | PASS — "OK" |
| `grep -c '^  postgres:\|...' == 7`                           | PASS — 7 services |
| `grep -E "^\s+ports:" \| wc -l == 1`                         | PASS — only srs has ports |
| `grep host.docker.internal \| wc -l == 0`                    | PASS                       |
| `grep "version:\s*['\"]?3" \| wc -l == 0`                    | PASS                       |
| Network block exact-match (Node script)                      | PASS — "OK"                |

### Bonus structural validation (not in plan, but ran for sanity)

```
docker compose -f deploy/docker-compose.yml --env-file /tmp/test-26-03.env config --quiet
exit=0
```

`docker compose config --quiet` parses the file with full YAML + interpolation + dependency-condition validation; exit 0 means **the file would compose-up cleanly given a valid env file.** This is a stronger signal than substring greps. Plan 04 will run the same command with stub env values as part of formal verification.

### Acceptance Criteria — All 27 PASS

(Each bullet from the plan's `<acceptance_criteria>` block was verified against the file contents — see Verification table above plus the exhaustive substring check.)

## Deviations from Plan

**None — plan executed exactly as written.**

The plan author's content prescription was byte-precise (the entire YAML appeared verbatim in the `<action>` block); the executor wrote it verbatim. Every D-XX honored. Every threat mitigation present. Every acceptance criterion passes. The optional `docker compose config --quiet` sanity check (not required by the plan) also passes.

## Authentication Gates

None — Plan 03 is pure file authoring (no auth APIs, no remote services, no secrets minted). Operators will encounter auth gates only at Phase 30 smoke test (deploy/.env operator-populated) and Phase 28 GHCR push (`gh auth login` for GitHub).

## Stub / Threat-flag Scan

- **Stubs:** None. `deploy/docker-compose.yml` is fully wired against Plans 01 and 02; no `TODO`, no `placeholder`, no empty service blocks.
- **Threat flags:** None. The compose introduces `internal:true`-blocked egress + read-only bind mounts + read-only HLS share + service-DNS-only addressing — every new surface is intentionally narrowed, not widened. No additional threat-register entries needed beyond the 9 already documented in the plan's `<threat_model>`.

## Self-Check

- `deploy/docker-compose.yml` — FOUND (committed in `5cf2d4c`)
- Commit `5cf2d4c` — FOUND in `git log --oneline -3`
- All 25 plan-prescribed substring checks — PASS (Node script returned "OK")
- All 27 acceptance criteria — PASS
- `docker compose config --quiet` syntax check — PASS (exit 0)
- Working tree clean (`git status --short` empty)

## Self-Check: PASSED

## Commits

| Task | Commit    | Files                          |
| ---- | --------- | ------------------------------ |
| 1    | `5cf2d4c` | `deploy/docker-compose.yml`    |

## Next Plan Hand-off

Plan 04 (compose syntax validation — wave 3 of Phase 26) can now run:

```bash
# Plan 04's automated verification command
docker compose -f deploy/docker-compose.yml --env-file <stub-env> config --quiet
# exit 0 expected (already verified during Plan 03 sanity check)
```

Plan 04 will additionally parse the resolved compose JSON for:
- Service count (== 7)
- Network membership per service
- Volume declarations (== 5 named)
- Dependency-condition correctness (api → sms-migrate → postgres+redis+minio)

No carryover blockers, no deferred items.

---
*Phase: 26-production-compose-migrate-init-networking-volumes*
*Plan: 03*
*Completed: 2026-04-28*
