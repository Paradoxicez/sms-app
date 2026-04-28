---
phase: 27-caddy-reverse-proxy-auto-tls
plan: 02
subsystem: infra
tags: [caddy, docker-compose, reverse-proxy, deploy, networking, volumes, healthcheck]

# Dependency graph
requires:
  - phase: 26-production-compose-migrate-init-networking-volumes
    provides: deploy/docker-compose.yml (7 services + 2 networks + 5 volumes; caddy_data forward-declared) + *default-logging YAML anchor
  - phase: 27-caddy-reverse-proxy-auto-tls/01
    provides: deploy/Caddyfile (single-site reverse-proxy + auto-TLS, validates clean under caddy:2.11)
provides:
  - deploy/docker-compose.yml caddy service (image caddy:2.11, ports 80+443/tcp, depends_on api+web service_healthy, networks edge+internal, volumes caddy_data + caddy_config + Caddyfile:ro, healthcheck wget --spider with start_period 30s)
  - caddy_config named volume (Caddy autosave config snapshots; transient, no driver/options)
  - DOMAIN + ACME_EMAIL + ACME_CA env-var contract from compose to caddy runtime (consumed by Caddyfile env-substitution at load time per plan 27-01 D-09/D-10)
affects: [27-03-mixed-content-relative-urls, 27-04-domain-setup-doc, 29-operator-ux-scripts, 30-ga-clean-vm-smoke]

# Tech tracking
tech-stack:
  added: [caddy:2.11 (Docker image, mounted Caddyfile :ro, runs ACME on first up)]
  patterns:
    - "Caddy joins BOTH edge + internal networks (D-17 — overrides Phase 26 D-06 service↔network table) so it can reach internal-only minio:9000 for /avatars/* and /snapshots/* proxy paths"
    - "Healthcheck uses busybox `wget --spider` (NOT curl — caddy:2.11 alpine image has wget but NOT curl per Research §A5)"
    - "start_period: 30s on caddy healthcheck — ACME first-issuance can take 30-60s and we don't want healthcheck to mark caddy unhealthy during cert provisioning"
    - "depends_on api + web with condition: service_healthy — prevents 502 spam during cold boot per Pitfall 8"
    - "Reuses *default-logging YAML anchor from Phase 26 (NOT redefined) — single logging config across all 8 long-running services"
    - "Caddyfile bind-mount uses :ro flag (defense-in-depth — even if container is compromised, Caddyfile cannot be rewritten in place)"

key-files:
  created: []
  modified:
    - deploy/docker-compose.yml (38 additions / 0 deletions; +37 lines for caddy service block, +1 line for caddy_config volume entry)

key-decisions:
  - "Inserted caddy service AFTER web (last service in alphabetical-after-orchestration boot order) and BEFORE networks block separator — keeps services contiguous, validates structurally"
  - "ACME_CA defaults to empty string via ${ACME_CA:-} in compose — empty value falls through to Caddyfile's `acme_ca` global option default (LE prod URL per plan 27-01 D-09); operators flip to staging by setting ACME_CA in .env"
  - "DOMAIN + ACME_EMAIL passed without :- default — both are operator-required (plan 27-01 D-10 + Phase 27-04 DOMAIN-SETUP.md); caddy refuses to start with empty DOMAIN (auto-TLS needs a real hostname)"
  - "caddy_config volume = default Docker named volume (no driver/options) — Caddy autosave snapshots are transient and small; persistence is nice-to-have, not critical"
  - "Compose validates with --env-file deploy/.env.production.example even though that file lacks ACME_EMAIL — compose emits a WARNING, not an error, and exits 0 (the env contract gap is closed by plan 27-04 which adds ACME_EMAIL/ACME_CA placeholders to the example env file)"

patterns-established:
  - "deploy/docker-compose.yml caddy service = canonical single-server reverse-proxy block (image pin minor, both networks, named volume + bind, healthcheck wget --spider, depends_on healthy gate)"
  - "Phase 26→27 compose patch convention: additions-only (38/0), reuse YAML anchors, never modify existing services/volumes — verified via `git diff --numstat`"
  - "Threat-model mitigation by config: T-27-ADMIN-API mitigated at TWO layers (admin off in Caddyfile + no :2019 port mapping in compose — defense in depth)"

requirements-completed: [DEPLOY-06, DEPLOY-09]

# Metrics
duration: 6min
completed: 2026-04-28
---

# Phase 27 Plan 02: Compose Caddy Service + caddy_config Volume Summary

**Patches `deploy/docker-compose.yml` to add the `caddy` reverse-proxy service (image caddy:2.11, ports 80+443/tcp, both networks, named volume + Caddyfile bind, wget healthcheck with ACME-grace start_period, depends_on api+web service_healthy) plus the new `caddy_config` named volume — additions-only diff (38/0), validates clean under `docker compose config --quiet`, mitigates 5 STRIDE threats including no admin :2019 + Caddyfile :ro defense-in-depth.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-28T05:58:55Z (immediately after plan 27-01 completion)
- **Completed:** 2026-04-28T06:04:13Z
- **Tasks:** 1
- **Files modified:** 1 (`deploy/docker-compose.yml`)

## Accomplishments

- Inserted 37-line `caddy:` service block in `deploy/docker-compose.yml` between `web:` and the `networks:` separator — exact spec from D-13/D-15/D-16/D-17 (image caddy:2.11, ports 80+443/tcp, env DOMAIN/ACME_EMAIL/ACME_CA, volumes caddy_data + caddy_config + Caddyfile:ro, healthcheck wget --spider with start_period 30s, depends_on api+web service_healthy, networks edge + internal, logging *default-logging anchor)
- Added 1-line `caddy_config:` entry to top-level `volumes:` block between `caddy_data:` and `hls_data:` — preserves existing 5 Phase 26 volume declarations
- All 18 acceptance grep criteria PASS (16 expect-1 / expect-2 positive checks + 2 expect-0 negative checks for admin:2019 and 443/udp)
- `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config --quiet` exits 0 (with expected WARNING about ACME_EMAIL not being set in the example env — closed by plan 27-04)
- Diff is additions-only: 38 insertions, 0 deletions (verified via `git diff --numstat` and `git diff | grep -E '^-[^-]' | wc -l == 0`)
- 5 of 5 STRIDE threats from this plan's threat model mitigated at compose layer

## Task Commits

Each task was committed atomically (--no-verify per parallel-execution context):

1. **Task 1: Insert caddy service block + caddy_config volume into deploy/docker-compose.yml** — `1d15d2f` (feat)

**Plan metadata commit:** _pending — orchestrator owns final commit including SUMMARY.md after wave merge._

## Files Created/Modified

- `deploy/docker-compose.yml` (modified, +38 / -0)
  - **Patch 1 (line ~252-289):** new `caddy:` service block (image caddy:2.11, ports 80+443/tcp, env block, volumes [caddy_data:/data, caddy_config:/config, ./Caddyfile:/etc/caddy/Caddyfile:ro], healthcheck [wget --spider, start_period 30s], depends_on api+web service_healthy, networks [edge, internal], logging *default-logging anchor)
  - **Patch 2 (line ~310):** added `  caddy_config:` line to volumes block (preserves all 5 existing entries)

## Decisions Made

- **Insert position: after `web:`, before `networks:` separator** — keeps services contiguous (matches Phase 26 ordering convention: postgres → redis → minio → srs → sms-migrate → api → web → caddy). Caddy is the natural "last" service in cold-boot order because it gates on api+web health.
- **ACME_CA default-empty (`${ACME_CA:-}`)** — empty value flows through Caddyfile's `acme_ca {$ACME_CA:https://acme-v02.api.letsencrypt.org/directory}` substitution and falls back to LE prod URL. Operators flip to staging by setting `ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory` in `deploy/.env`. Single-knob staging toggle, no Caddyfile edit required.
- **Reuse `*default-logging` YAML anchor (NOT redefine)** — Phase 26 D-16 declared the anchor at lines 34-38; redefining would be a YAML anti-pattern (duplicate keys) and divergent log config across services. Reuse keeps json-file driver + 10m × 5 rotation consistent across all 8 long-running services.
- **Both `edge` + `internal` networks (D-17)** — without `internal`, the caddy container's DNS resolver cannot find `minio:9000`, and the Caddyfile's `/avatars/*` + `/snapshots/*` `reverse_proxy minio:9000` directives would fail with "no such host". D-17 explicitly amends the Phase 26 D-06 service↔network table for caddy.
- **Healthcheck uses `wget --spider`, NOT curl** — `caddy:2.11` is built on alpine which bundles busybox (wget present) but NOT curl. Using curl would make the healthcheck always fail. The `--spider -q` combo emits no output, just an HTTP HEAD-equivalent and an exit code (0 on 2xx/3xx, non-zero on 4xx/5xx/connection-error). `start_period: 30s` is the critical knob — first-boot ACME issuance can take 30-60s and we don't want healthcheck failures during cert provisioning to flap the container.

## Deviations from Plan

None — plan executed exactly as written.

The plan's Patch 1 + Patch 2 specs were applied verbatim. All 18 acceptance criteria pass on first try. `docker compose config --quiet` exits 0 cleanly. No deviations needed.

The expected ACME_EMAIL WARNING under `--env-file deploy/.env.production.example` (because that file does not yet contain ACME_EMAIL/ACME_CA placeholders — plan 27-04 work) is documented in plan 27-01's hand-off and is NOT a deviation: compose emits a warning + uses empty string + exits 0. Validation passes.

## Authentication Gates

None — all work was static file edits + compose validation. No CLI auth required.

## Issues Encountered

- **Expected WARNING during compose validation:** `level=warning msg="The \"ACME_EMAIL\" variable is not set. Defaulting to a blank string."` — the `deploy/.env.production.example` file does not currently declare ACME_EMAIL or ACME_CA. This is plan 27-04's scope (DEPLOY-07 will add them). Compose still exits 0; validation passes. The runtime path (`deploy/.env` after operator runs `init-secrets.sh` + `deploy/scripts/init-secrets.sh` + manual edit per Phase 27-04 docs) will have these values set.

## Threat-Model Coverage

5 of 5 STRIDE threats from this plan's `<threat_model>` block mitigated:

| Threat ID | Category | Mitigation Applied | Verification |
|-----------|----------|---------------------|--------------|
| T-27-CERT-PRIV | Information Disclosure | `caddy_data:/data` is a Docker named volume (NOT a host-path bind) — Phase 29 backup.sh will include it under controlled access; no accidental world-readable cert files | `grep -c '      - caddy_data:/data' deploy/docker-compose.yml == 1` (named volume mount, no host path) |
| T-27-CADDYFILE-RW | Tampering | Bind-mount line uses `:ro` flag — even if container is compromised, Caddyfile cannot be rewritten in place | `grep -c '      - ./Caddyfile:/etc/caddy/Caddyfile:ro' deploy/docker-compose.yml == 1` |
| T-27-ADMIN-API | Elevation of Privilege | NO `:2019` port mapping in caddy ports block; combined with `admin off` in plan 27-01's Caddyfile, the admin endpoint is disabled at TWO layers (config + network) | `grep -cE '^\s+admin:.*\b2019\b' deploy/docker-compose.yml == 0` |
| T-27-HTTP3-SURFACE | DoS / firewall surface | Ports list is `"80:80"` + `"443:443"` (TCP only); no `"443:443/udp"` for QUIC; aligns with plan 27-01's `servers { protocols h1 h2 }` Caddyfile directive | `grep -cE '443:443/udp' deploy/docker-compose.yml == 0` |
| T-27-BOOT-502 | Availability | `depends_on api + web` both gated on `condition: service_healthy` (image-side curl /api/health from Phase 25 D-04); caddy `start_period: 30s` protects against unhealthy-marker during ACME issuance | `awk '/^  caddy:$/{p=1; print; next} p && /^  [a-z][a-z]*:$/{exit} p' deploy/docker-compose.yml \| grep -c 'condition: service_healthy' == 2` (api + web both gates) |

## User Setup Required

None for this plan. Operator-facing setup happens in plan 27-04 (DOMAIN-SETUP.md) which will document:
- Setting `DOMAIN` + `ACME_EMAIL` in `deploy/.env`
- Optional `ACME_CA` staging toggle for debug runs
- DNS A-record + port 80 firewall requirements before first `docker compose up`

## Hand-off to Plan 27-03 (mixed-content + relative URLs)

- **No file dependency** — plan 27-03 modifies frontend code (NEXT_PUBLIC_API_URL handling, http→https migration) and does not need to touch this compose file.
- **Runtime context:** the new caddy service is the SAME-ORIGIN edge for `/api/*`, `/socket.io/*`, `/avatars/*`, `/snapshots/*`, and catch-all to web — plan 27-03's relative-URL refactor lands inside this routing topology.

## Hand-off to Plan 27-04 (DOMAIN-SETUP.md + env example patches)

- **Required `.env` placeholders to add (DEPLOY-07):**
  - `ACME_EMAIL=` — operator-supplied, no default. Caddyfile `email {$ACME_EMAIL}` substitution requires non-empty value (otherwise `caddy validate` fails with `'email': wrong argument count or unexpected line ending` per plan 27-01 deviations §3).
  - `ACME_CA=` — optional, default-empty. Empty falls through to LE prod URL (plan 27-01 Caddyfile `acme_ca {$ACME_CA:https://acme-v02.api.letsencrypt.org/directory}`). Set to `https://acme-staging-v02.api.letsencrypt.org/directory` for staging-debug runs.
- **Compose env-block already wired** (this plan's commit `1d15d2f`):
  ```yaml
  environment:
    DOMAIN: ${DOMAIN}
    ACME_EMAIL: ${ACME_EMAIL}
    ACME_CA: ${ACME_CA:-}
  ```
- **Validation contract for plan 27-04:** after adding ACME_EMAIL/ACME_CA placeholders to `deploy/.env.production.example`, the compose validation should run WITHOUT the current ACME_EMAIL warning:
  ```
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config --quiet
  ```
  Expected: exit 0, no WARNING messages.

## Next Plan Readiness

- ✅ `deploy/docker-compose.yml` ready for plan 27-04 (env-example patches) and plan 27-05 (DOMAIN-SETUP.md + smoke script).
- ✅ All 5 STRIDE threats from this plan's threat model mitigated at compose layer.
- ✅ Diff is additions-only (38/0 verified via `git diff --numstat` + `git diff | grep -E '^-[^-]' | wc -l == 0`); no existing service or volume entry was modified.
- ✅ 18/18 acceptance grep criteria pass; `docker compose config --quiet` exits 0.
- 📐 **For plan 27-04 author:** the only remaining gap to close before `docker compose config --quiet` runs warning-free is adding `ACME_EMAIL=` + `ACME_CA=` to `deploy/.env.production.example`. The compose env-block is already wired to consume both via `${VAR}` / `${VAR:-}` substitution.
- 📐 **For Phase 30 verifier:** when running the clean-VM smoke test, the operator MUST set `DOMAIN` + `ACME_EMAIL` in `deploy/.env` BEFORE `docker compose up -d`. Empty DOMAIN → caddy refuses to start (auto-TLS needs a real hostname). Empty ACME_EMAIL → caddy starts but ACME registration is anonymous (works, but operator misses Let's Encrypt expiry notifications).

## Self-Check: PASSED

Verifying claims before handing off to orchestrator.

### Files Modified
- `deploy/docker-compose.yml` — FOUND (311 lines, +38 from Phase 26's 274; verified via `wc -l deploy/docker-compose.yml`)

### Commits Made
- `1d15d2f` — FOUND (`feat(27-02): add caddy service + caddy_config volume to deploy compose`; verified via `git log --oneline | grep 1d15d2f`)

### Acceptance Criteria
- 18/18 grep criteria PASS (16 positive expect-1/expect-2 + 2 negative expect-0)
- `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config --quiet` → exit 0 (with expected ACME_EMAIL warning closed by plan 27-04)
- `git diff --numstat deploy/docker-compose.yml` → `38   0   deploy/docker-compose.yml` (additions-only)
- `git diff deploy/docker-compose.yml | grep -E '^-[^-]' | wc -l` → `0` (no deletions outside diff context markers)
- Resolved compose contains caddy: `docker compose config | grep -E 'caddy_data|caddy_config|image: caddy:2.11' | wc -l` → `7` (≥3 required by plan AC #18)

---
*Phase: 27-caddy-reverse-proxy-auto-tls*
*Plan: 02*
*Completed: 2026-04-28*
