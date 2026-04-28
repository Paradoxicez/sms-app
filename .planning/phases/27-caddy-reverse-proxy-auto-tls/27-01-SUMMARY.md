---
phase: 27-caddy-reverse-proxy-auto-tls
plan: 01
subsystem: infra
tags: [caddy, reverse-proxy, tls, acme, lets-encrypt, websocket, socket.io, minio, http2, deploy]

# Dependency graph
requires:
  - phase: 26-production-compose-migrate-init-networking-volumes
    provides: deploy/docker-compose.yml service DNS names (api:3003, web:3000, minio:9000) + edge/internal networks + caddy_data volume forward-declared
provides:
  - deploy/Caddyfile (single-site reverse-proxy + auto-TLS config, ~50 lines, validates clean under caddy:2.11)
  - Same-origin routing (5 mutually-exclusive handle blocks: @api / /socket.io/* / /avatars/* / /snapshots/* / catch-all)
  - ACME staging-CA toggle via {$ACME_CA:default} env-var substitution (operators debug DNS/firewall without burning Let's Encrypt prod rate limits)
  - WebSocket auto-pass for all 4 Socket.IO namespaces (notifications, camera-status, cluster-status, srs-logs) — no header_up rules needed
  - Hardened global options: admin off (no :2019 admin endpoint) + servers { protocols h1 h2 } (HTTP/3 disabled per D-12)
affects: [27-02-compose-caddy-service, 27-03-mixed-content-relative-urls, 27-04-domain-setup-doc, 27-05-acme-troubleshooting, 28-ghcr-ci-provenance, 30-ga-clean-vm-smoke]

# Tech tracking
tech-stack:
  added: [caddy:2.11 (Docker image, Phase 27-02 will mount this Caddyfile :ro)]
  patterns:
    - "Single-site Caddy 2 config: global options block first, then {$DOMAIN} site block — order is canonical"
    - "Defensive @api matcher: `path /api /api/*` covers bare `/api` (Pitfall 2 — Caddy `/api/*` does NOT match `/api` without trailing slash)"
    - "Env-var substitution at Caddyfile load time: `{$VAR:default}` syntax — empty ACME_CA falls through to Let's Encrypt prod URL"
    - "WebSocket auto-pass via Caddy 2.x default reverse_proxy (no header_up Upgrade/Connection rules needed)"
    - "MinIO public-read same-origin: anonymous bucket policy + no Host rewrite (Pitfall 6) → eliminates CORS + mixed-content headaches in 27-03"

key-files:
  created:
    - deploy/Caddyfile (49 lines, validates clean under caddy:2.11 caddy validate)
  modified: []

key-decisions:
  - "Wrapped `protocols h1 h2` in `servers { ... }` block — Caddy 2.11 rejects bare-global `protocols` (research D-12 transcription drift); same intent (no HTTP/3, no 443/udp), valid syntax"
  - "Used `{$ACME_CA:https://acme-v02.api.letsencrypt.org/directory}` env-var with default → operators flip to staging by setting ACME_CA, default falls through to prod LE without operator action (D-09)"
  - "`email {$ACME_EMAIL}` left without default → operator must supply per D-10; empty value = anonymous ACME account (works, but operator misses Let's Encrypt renewal warnings)"
  - "5 handle blocks ordered for human readability (api → socket.io → avatars → snapshots → catch-all); Caddy auto-sorts by matcher specificity at runtime"
  - "No `route`, no `header_up`, no site-level `tls` directives — all 3 are anti-patterns per Research §Anti-Patterns + D-06"

patterns-established:
  - "deploy/Caddyfile = static, env-substituted, mounted :ro by 27-02 — never rewritten by container"
  - "ACME staging toggle = single env var (ACME_CA), no Caddyfile edit required for debug runs"
  - "Defensive path matcher (D-27): always cover both bare and trailing-slash forms when proxying API roots"

requirements-completed: [DEPLOY-06, DEPLOY-07, DEPLOY-08]

# Metrics
duration: 3min
completed: 2026-04-28
---

# Phase 27 Plan 01: Caddyfile Reverse-Proxy + Auto-TLS Summary

**Single-site Caddyfile (~50 lines, validates clean under caddy:2.11) with same-origin path routing to api/web/minio, ACME auto-TLS via Let's Encrypt + staging-CA env-var toggle, WebSocket auto-pass for 4 Socket.IO namespaces, and hardened globals (admin off + HTTP/3 disabled).**

## Performance

- **Duration:** 3 min 10s
- **Started:** 2026-04-28T05:55:45Z
- **Completed:** 2026-04-28T05:58:55Z
- **Tasks:** 1
- **Files created:** 1 (`deploy/Caddyfile`)

## Accomplishments

- `deploy/Caddyfile` authored as the source-of-truth reverse-proxy + auto-TLS config (Phase 27-02 will mount this file `:/etc/caddy/Caddyfile:ro` into the caddy service)
- `caddy validate --adapter caddyfile` exits 0 with "Valid configuration" output (gold-standard verification per plan line 175)
- 5 mutually-exclusive `handle` blocks pinned per D-05/D-09/D-27: defensive `@api path /api /api/*` (covers bare `/api` per Pitfall 2), `/socket.io/*` for all 4 namespaces, `/avatars/*` + `/snapshots/*` to MinIO public-read buckets, catch-all to web
- Global options harden the surface: `admin off` (no Caddy admin :2019 endpoint), `servers { protocols h1 h2 }` (no HTTP/3 / no 443/udp), `acme_ca` with prod-LE default, `email` from `ACME_EMAIL`
- 5 of 5 STRIDE threats mitigated: T-27-CADDYFILE-RW (file is :ro source-of-truth), T-27-ADMIN-API (admin off), T-27-WS-MITM (TLS termination forces wss://), T-27-ACME-DOS (staging toggle), T-27-CADDY-CVE (image pin in 27-02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Author deploy/Caddyfile with global options + 5 handle blocks** — `9fa1e42` (feat)

**Plan metadata commit:** _pending — orchestrator owns final commit including SUMMARY.md after wave merge._

## Files Created/Modified

- `deploy/Caddyfile` (created, 49 lines) — single-site reverse-proxy + auto-TLS config; global options block (acme_ca env-var with prod-LE default, email from ACME_EMAIL, admin off, servers { protocols h1 h2 }) + `{$DOMAIN}` site block with 5 handle blocks (`@api` / `/socket.io/*` / `/avatars/*` / `/snapshots/*` / catch-all to `web:3000`)

## Decisions Made

- **`servers { protocols h1 h2 }` wrapping (vs bare global per plan/research D-12)** — Caddy 2.11 rejects `protocols` as a top-level global option; the directive lives under the `servers { ... }` sub-block per current Caddy options docs. Wrapping preserves the D-12 intent (HTTP/3 disabled, no 443/udp QUIC binding, smaller Phase 30 nmap surface) with valid syntax. Reversible: if QUIC demand emerges, swap `h1 h2` → `h1 h2 h3` and add `443/udp` to the compose ports list.
- **`acme_ca` default = prod LE URL** (not staging) — operators get cert issuance on first `up` without flipping a flag; staging toggle is opt-in (`ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory` in `.env`). Per D-09 (Phase 27-04 DOMAIN-SETUP.md will document the staging-debug flow).
- **No site-level `tls`, no `header_up`, no `route`** — all 3 are anti-patterns. Caddy auto-HTTPS handles cert from real-hostname site address (D-08), Caddy 2.x auto-passes WebSocket Upgrade/Connection headers (D-06), and `handle` blocks (mutually exclusive) are correct vs `route` (sequential, would break exclusivity).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `protocols h1 h2` invalid as bare global option in Caddy 2.11**
- **Found during:** Task 1 verification step (`caddy validate --adapter caddyfile`)
- **Issue:** Plan's pinned Caddyfile body (lines 117-126 of `27-01-PLAN.md`) and research doc (line 210 of `27-RESEARCH.md`) both place `protocols h1 h2` as a bare line inside the global options block `{ ... }`. Caddy 2.11 rejects this with `Error: adapting config using caddyfile: /etc/caddy/Caddyfile:15: unrecognized global option: protocols` — `protocols` is a `servers` sub-option in Caddy 2.x, not a top-level global.
- **Fix:** Wrapped the directive in `servers { protocols h1 h2 }` inside the global options block. Confirmed via `docker run --rm caddy:2.11 caddy validate ...` exit 0 with "Valid configuration" output. Same intent (D-12: HTTP/3 disabled, no 443/udp), valid Caddy 2.11 syntax.
- **Files modified:** `deploy/Caddyfile` (lines 17-19 — replaced bare `protocols h1 h2` with `servers { protocols h1 h2 }` block + 2-line explanatory comment)
- **Verification:** `docker run --rm -e DOMAIN=example.com -e ACME_EMAIL=admin@example.com -v "$(pwd)/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.11 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` exits 0; stderr ends with `Valid configuration`.
- **Committed in:** `9fa1e42` (Task 1 commit)

**2. [Plan acceptance-criteria typo — no file change required] grep #1 missing leading tab**
- **Found during:** Task 1 acceptance-grep verification
- **Issue:** Plan acceptance criterion line 180 is `grep -c '^acme_ca {$ACME_CA:https://acme-v02.api.letsencrypt.org/directory}' deploy/Caddyfile` returns 1 — but `acme_ca` is inside the global options block `{ ... }`, so it MUST be tab-indented per Caddyfile concepts (and per the plan's own `<action>` block which shows tab-indented content). Criterion #2 (`^\temail`) has the tab, confirming this is a transcription typo on criterion #1, not a real file requirement.
- **Fix:** No file change. The structurally-correct Caddyfile content is tab-indented; the typo's literal regex (no leading tab) cannot match Caddy-valid syntax. Documented here so verifier knows to expect grep #1 to read 0 against the structurally-correct file.
- **Verification:** `grep -cP '^\tacme_ca \{\$ACME_CA:https://acme-v02.api.letsencrypt.org/directory\}' deploy/Caddyfile` returns 1 (tab-indented form).
- **Committed in:** N/A (no file change; documented for verifier).

**3. [Plan acceptance-criteria drift — caused by deviation #1] grep #4 single-tab anchor no longer matches**
- **Found during:** Task 1 acceptance-grep verification (after fix #1)
- **Issue:** Plan acceptance criterion line 183 is `grep -c '^	protocols h1 h2' deploy/Caddyfile` returns 1 (single tab indentation, expecting bare-global form). After fix #1 wraps the directive in `servers { ... }`, the `protocols` line is at double-tab indentation, so the single-tab regex returns 0.
- **Fix:** No further file change — fix #1 is the correct resolution; the plan's acceptance regex is downstream of the broken syntax. Verified the corrected form passes `caddy validate` (the plan's primary verification per line 175, which takes precedence over derivative greps).
- **Verification:** `grep -cP '^\t+protocols h1 h2' deploy/Caddyfile` returns 1 (depth-agnostic match).
- **Committed in:** `9fa1e42` (cascade of Task 1 commit; called out in commit body).

---

**Total deviations:** 1 file change (Rule 1 - Bug fix) + 2 documentation-only acceptance-criteria notes
**Impact on plan:** Critical — without fix #1, `caddy validate` fails (plan's primary verification command line 175 cannot exit 0). The plan's acceptance grep #1 + #4 anchors are downstream artifacts that have transcription drift relative to actually-valid Caddy 2.11 syntax. The fix preserves the D-12 (no HTTP/3) intent fully; only the syntactic wrapper changes (bare → `servers { ... }`). No scope creep, no functional change to routing behavior. The verifier should treat `caddy validate` exit 0 as authoritative.

## Issues Encountered

- Caddy 2.11 syntax discrepancy with research/plan transcription (deviation #1 above) — resolved inline via Rule 1.
- Initial validation attempt without `ACME_EMAIL` env var set produced an unrelated parse error (`'email': wrong argument count or unexpected line ending`); injecting `-e DOMAIN=example.com -e ACME_EMAIL=admin@example.com` into the Docker run mimics the production compose runtime (where `caddy` service inherits these from `.env`) and the issue cleared. This is expected per D-10 ("operator must supply ACME_EMAIL") and does not require a Caddyfile change — Phase 27-04 DOMAIN-SETUP.md will document the env-var requirement.

## User Setup Required

None for this plan. Phase 27-04 will produce `deploy/DOMAIN-SETUP.md` with operator-facing instructions for DNS A-record + port 80 + ACME_EMAIL setup before first `docker compose up`.

## Hand-off to Plan 27-02

- **File path:** `deploy/Caddyfile` (committed in `9fa1e42`)
- **Bind-mount expectation:** `./Caddyfile:/etc/caddy/Caddyfile:ro` (relative to `deploy/docker-compose.yml`, per D-14)
- **Caddy image:** `caddy:2.11` (per D-22 — same tag used for validation in this plan)
- **Required env vars in compose `caddy` service:** `DOMAIN`, `ACME_EMAIL`, optional `ACME_CA` (defaults to LE prod). Plan 27-02 must inject all three from `.env`.
- **Required ports in compose `caddy` service:** `80:80/tcp` + `443:443/tcp` only — NOT `443/udp` (HTTP/3 disabled per D-12, fix #1 above).
- **Required volumes in compose `caddy` service:** `caddy_data:/data` (declared in 26 forward-decl) + `caddy_config:/config` (Plan 27-02 declares).
- **Networks:** caddy must join both `edge` (public 80/443) and `internal` (reach api/web/minio service DNS).

## Next Phase Readiness

- ✅ `deploy/Caddyfile` ready for Phase 27-02 to bind-mount.
- ✅ All 5 STRIDE threats from this plan's threat model mitigated at file level (T-27-CADDYFILE-RW, T-27-ADMIN-API, T-27-WS-MITM, T-27-ACME-DOS, T-27-CADDY-CVE).
- ⚠️ **For verifier:** Plan acceptance grep #1 (line 180) and grep #4 (line 183) will fail against the structurally-correct file (transcription drift in the plan; see deviations #2 + #3). The plan's primary verification command (line 175 — `caddy validate --adapter caddyfile`) exits 0 cleanly. Treat `caddy validate` as authoritative.
- ⚠️ **For Phase 27-02 author:** when validating the integrated compose+Caddyfile via `docker compose config && caddy validate`, ensure DOMAIN + ACME_EMAIL are set in `deploy/.env` (or pass `--env-file deploy/.env`) — Caddyfile uses substitution-at-load-time and empty ACME_EMAIL parses as zero arguments → validate failure. The runtime path always has these vars per Phase 26 `.env.production.example` defaults.

## Self-Check: PASSED

Verifying claims before handing off to orchestrator.

### Files Created
- `deploy/Caddyfile` — FOUND (49 lines)

### Commits Made
- `9fa1e42` — FOUND (`feat(27-01): add deploy/Caddyfile reverse-proxy + auto-TLS config`)

### Gold-standard Verification
- `caddy:2.11 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` exit 0 with "Valid configuration" (with DOMAIN + ACME_EMAIL env vars set, mimicking compose runtime)

---
*Phase: 27-caddy-reverse-proxy-auto-tls*
*Plan: 01*
*Completed: 2026-04-28*
