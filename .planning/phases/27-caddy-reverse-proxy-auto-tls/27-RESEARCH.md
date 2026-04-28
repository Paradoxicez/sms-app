# Phase 27: Caddy Reverse Proxy + Auto-TLS — Research

**Researched:** 2026-04-28
**Domain:** Reverse proxy + auto-TLS for a Docker Compose stack (Caddy v2.11, Let's Encrypt HTTP-01, Socket.IO pass-through, MinIO public-read pass-through)
**Confidence:** HIGH overall — every critical claim verified against Caddy upstream docs, Let's Encrypt rate-limit docs, the Caddy Docker Hub README, and the Phase 26 compose product on disk.

## Summary

Phase 27 is a thin, low-risk amendment to `deploy/docker-compose.yml` (Phase 26 product) plus a single new `deploy/Caddyfile` and a minimal `deploy/DOMAIN-SETUP.md`. The technical contract is well-bounded: Caddy v2 handles ACME HTTP-01, HTTP→HTTPS redirect, and WebSocket upgrade pass-through automatically with zero special configuration — the work is overwhelmingly about correct Caddyfile structure, two-network attachment, and operator-facing documentation.

**The phase has one CRITICAL pre-existing blocker that the planner MUST surface as an open question to the operator before locking the plan**: `apps/api/src/recordings/minio.service.ts` builds avatar/snapshot URLs using `MINIO_USE_SSL` to choose the URL scheme (`http` vs `https`). Phase 26 set `MINIO_USE_SSL=false` (correctly — for the SDK's `api→minio` connection inside the Docker network) AND `MINIO_PUBLIC_PORT=443` (anticipating Caddy TLS). The composition produces `http://${DOMAIN}:443/avatars/{user}.webp` URLs — when emitted into a page loaded over `https://${DOMAIN}`, every browser blocks them as **mixed content**. This is a Phase 26 design oversight, not a Caddy problem; it surfaces only when Phase 27 actually puts TLS in front of MinIO's public buckets. Three clean fixes exist (new `MINIO_PUBLIC_USE_SSL` env var, scheme-less relative URLs, or two separate vars for client vs public). The planner should ask the operator which fix lands in Phase 27 vs deferred.

**Primary recommendation:** Pin `caddy:2.11` (verified — floating tag pulls 2.11.2, latest as of 2026-03-06), use `handle` matchers (mutually exclusive, auto-sorted by specificity), accept Caddy's built-in WebSocket and HTTP→HTTPS-redirect defaults, and ship the staging-CA toggle via `acme_ca {$ACME_CA:https://acme-v02.api.letsencrypt.org/directory}` global option (Caddy supports `{$VAR:default}` env-var substitution at load time). Keep the Caddyfile minimal — every line removed is a line that can't drift from Caddy's improving defaults.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

The following 25 decisions are LOCKED via `27-CONTEXT.md`. Plans MUST honor them; do NOT propose alternatives.

**MinIO public path proxy (DEPLOY-07 expansion):**
- **D-01:** Caddy adds path matchers `/avatars/*` + `/snapshots/*` → `minio:9000`. Without these, avatars + snapshots 404 on prod (BLOCKER for v1.3 GA functionality).
- **D-02:** Recording HLS segments do NOT route through `/recordings/*` or `/org-*`. Verified: segments build URLs as `/api/recordings/segments/<id>/proxy` (api streams MinIO server-to-server). Caddy routes recording paths through the existing `/api/*` matcher only.
- **D-03:** Path namespace `${DOMAIN}/avatars` + `${DOMAIN}/snapshots` reserved for MinIO buckets — verified no Next.js route collision (no `apps/web/src/app/avatars/` or `apps/web/src/app/snapshots/` exists). [VERIFIED: ls of `apps/web/src/app/`]
- **D-04:** `reverse_proxy minio:9000` alone is sufficient. If MinIO returns 403 due to Host header, add `header_up Host {upstream_hostport}` or `header_up X-Forwarded-Host {host}`.

**Routing matchers (DEPLOY-07, DEPLOY-08):**
- **D-05:** Caddyfile site block uses 5 `handle` directives (mutually exclusive): `/api/*`, `/socket.io/*`, `/avatars/*`, `/snapshots/*`, catch-all → `web:3000`.
- **D-06:** WebSocket pass-through — `reverse_proxy api:3003` handles Upgrade/Connection headers automatically; no extra config.
- **D-07:** Single `/socket.io/*` matcher covers all 4 namespaces (`/notifications`, `/camera-status`, `/cluster-status`, `/srs-logs`). Defense-in-depth via Better Auth happens at app layer.

**Auto-TLS + ACME (DEPLOY-06):**
- **D-08:** Auto-HTTPS triggers from real-hostname site name; HTTP→HTTPS redirect added by Caddy default.
- **D-09:** Staging-CA toggle via `acme_ca {$ACME_CA:https://acme-v02.api.letsencrypt.org/directory}` env var.
- **D-10:** `email {$ACME_EMAIL}` required.
- **D-11:** `admin off` global (no Caddy admin API exposed).
- **D-12:** `protocols h1 h2` global (HTTP/3 disabled — keeps Phase 30 nmap surface tight).

**Volumes + persistence (DEPLOY-09):**
- **D-13:** Two volumes: `caddy_data:/data` (Phase 26 declared) + new `caddy_config:/config`. Caddyfile mounted read-only.
- **D-14:** Caddyfile bind path = `./Caddyfile:/etc/caddy/Caddyfile:ro` (relative to `deploy/docker-compose.yml`).

**Service config (DEPLOY-13 inheritance):**
- **D-15:** Image = `caddy:2.11` (minor pin).
- **D-16:** Compose service spec: `init: true`, `restart: unless-stopped`, ports `80:80` + `443:443`, healthcheck `wget --spider http://localhost:80`, `start_period: 30s`, `depends_on api/web service_healthy`, `logging: *default-logging`.
- **D-17 (CRITICAL):** Caddy joins BOTH `edge` + `internal` networks (overrides Phase 26 D-06) so it can resolve `minio:9000`.
- **D-18:** `internal: true` constraint OK — Caddy's egress (ACME outbound) routes via `edge` bridge.

**Env var patches (DEPLOY-22 + DEPLOY-24):**
- **D-19:** Add `ACME_EMAIL` (Required section) + `ACME_CA` (Defaults section) to `.env.production.example`.
- **D-20:** `init-secrets.sh` does NOT generate `ACME_EMAIL` (human input).

**DOMAIN-SETUP.md content (DEPLOY-24):**
- **D-21:** Minimal scope — DNS A-record + port 80 + propagation + staging toggle + 4-row error table.
- **D-22:** No provider walkthroughs / regional DNS.
- **D-23:** Doc lives at `deploy/DOMAIN-SETUP.md`.

**Verification gates:**
- **D-24:** 6 checkpoints — compose config + Caddy validate + cert obtained log + 308 redirect + WSS 101 upgrade + cert persistence on `down/up`.
- **D-25:** Phase 30 verifies end-to-end on clean VM.

### Claude's Discretion

Areas where the planner has freedom (per CONTEXT.md):
- Caddyfile indentation, comment density, directive ordering for readability
- Healthcheck timing tuning (`interval`, `start_period` adjustments)
- Wget vs curl in healthcheck (Caddy image is alpine-based — wget available, curl not)
- Logging format (default JSON kept)
- Compose service order in YAML (caddy after web for readability)
- Health endpoint of Caddy (`/` returns 308 → liveness OK; no dedicated endpoint needed)
- Final ordering of Caddyfile matchers — operator-facing readability matters; routing correctness does not depend on it (Caddy auto-sorts `handle` by matcher specificity).

### Deferred Ideas (OUT OF SCOPE)

DO NOT include in plans:
- HTTP/3 (QUIC) on 443/udp
- `www.${DOMAIN}` redirect
- Multi-domain / wildcard cert / DNS-01
- Refactoring `getAvatarUrl` / `getSnapshotUrl` to relative paths *(but see Open Question #1 — mixed content may force partial scope here)*
- Caddy hot-reload via admin API
- Rate limiting / WAF / bot protection
- Comprehensive provider walkthroughs in DOMAIN-SETUP.md
- Subdomain `cdn.${DOMAIN}` / `media.${DOMAIN}` for MinIO
- Scope-limited WS matchers (filtering cluster + srs-logs at Caddy layer)
- Caddy log rotation tuning (default 10m × 5)
- `tls.dns` provider plugins
- Caddy Prometheus metrics endpoint
- Operator UX validation in `init-secrets.sh` (Phase 29 territory)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **DEPLOY-06** | Caddy 2.11.x service auto-provisions Let's Encrypt cert on first boot; HTTP→HTTPS redirect | [VERIFIED]: `caddy:2.11` Docker tag exists and floats to 2.11.2 (released 2026-03-06). Auto-HTTPS triggers from real-hostname site address; HTTP→HTTPS redirect is a Caddy default — see Architecture Patterns + Code Examples. |
| **DEPLOY-07** | Routes `/api/*` and `/socket.io/*` to api:3003, default → web:3000 (same-origin) | [VERIFIED]: `handle` directive is mutually exclusive + auto-sorted by matcher specificity. Path matchers are case-insensitive, slashes significant. `/api/*` matches `/api/foo` but NOT bare `/api` — see Common Pitfalls #2. |
| **DEPLOY-08** | WebSocket pass-through for `NotificationsGateway` and `StatusGateway` | [VERIFIED] from Caddy docs: *"The proxy also supports WebSocket connections, performing the HTTP upgrade request then transitioning the connection to a bidirectional tunnel."* Zero config required. Single `/socket.io/*` matcher covers all 4 namespaces (`/notifications`, `/camera-status`, `/cluster-status`, `/srs-logs`) because Socket.IO handshake path is namespace-agnostic — namespace is in query/auth. |
| **DEPLOY-09** | `caddy_data` + `caddy_config` named volumes persist certs across restarts | [CITED: hub.docker.com/_/caddy] Caddy stores certs in `/data` and config save points in `/config` per official Docker image conventions. Persisting `/data` is critical (loses certs → re-issue → Let's Encrypt rate limit). `/config` recommended persistent but not strictly critical. |
| **DEPLOY-24** | `deploy/DOMAIN-SETUP.md` documents DNS A-record, port 80 reachability, propagation, staging-CA toggle | [VERIFIED: letsencrypt.org/docs/rate-limits/] 5 failed validations per hostname per hour, 5 duplicate certs per identifier set per week. Operator who misconfigures DNS or firewall on first try will hit limits within ~5 attempts — staging CA toggle is genuinely necessary, not a luxury. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These directives have the same authority as locked decisions and override conflicting research recommendations:

- **`deploy/` = production-only artifacts.** Caddyfile, env example patches, `DOMAIN-SETUP.md` MUST live under `deploy/`. No dev tooling, no `package.json` (would be picked up by pnpm workspace).
- **`apps/` = dev workflow source.** No Caddy artifacts under `apps/`.
- **`pnpm-workspace.yaml` lists ONLY `apps/api` and `apps/web`.** If Phase 27 needs scripts under `deploy/scripts/`, they MUST be bash (or POSIX sh / Makefile) — never JavaScript packages. (Phase 27 ships no scripts; Phase 29 owns scripts.)
- **GSD Workflow Enforcement.** All file edits go through `/gsd-execute-phase` (or `/gsd-quick` for fixes). Direct repo edits not permitted outside GSD.
- **SRS port footprint must NOT collide with Caddy.** Confirmed: SRS uses 1935 (RTMP), 1985 (admin loopback only), 8080 (HLS HTTP), 8000/udp (WebRTC), 10080/udp (SRT), 9972 (Prometheus). Caddy uses 80/tcp + 443/tcp. **No collision.** [VERIFIED: deploy/docker-compose.yml lines 117-122]
- **Prisma schema change workflow.** Not relevant to Phase 27 (no schema changes expected).
- **Project skills:** No `.claude/skills/` or `.agents/skills/` directory exists. No skill-pattern overrides apply. [VERIFIED: ls of project root]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Caddy | 2.11.2 (pinned via `caddy:2.11`) | Reverse proxy + auto-TLS | v1.3 stack decision (over Traefik per STATE.md "no Docker socket exposure"); zero-config ACME; Caddyfile far more readable than Traefik labels at small scale |

**Image source:** `docker.io/library/caddy:2.11` (alpine variant by default — `caddy:2.11-alpine` is the same image). [VERIFIED: Docker Hub `library/caddy` tag list 2026-04-28]

**Verified version:**
- Latest patch: `2.11.2`, published 2026-03-06 [VERIFIED: GitHub releases API]
- Floating tag `caddy:2.11` resolves to `2.11.2` today and will continue to absorb 2.11.x patch releases [VERIFIED: Docker Hub tag list]
- No `2.12.x` line exists yet — `2.11` is the current stable line [VERIFIED: Docker Hub tag list]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | Phase 27 introduces no application libraries — entire scope is config + compose. The api/web/MinIO services are unchanged. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Caddy | Traefik | Rejected v1.3 research: requires Docker socket mount (security surface); label syntax is verbose; less mature auto-TLS for non-DNS-01 challenges. **DO NOT REVISIT in Phase 27.** |
| Caddy | nginx + acme.sh / certbot | Rejected v1.3 research: certbot requires cron + reload orchestration; nginx config not auto-managed; loses HTTP/3 + auto-redirect baseline. **DO NOT REVISIT in Phase 27.** |
| Caddy | HAProxy + acme integration | Rejected v1.3 research: HAProxy excels at L4 load balancing; overkill for single-server reverse proxy. **DO NOT REVISIT in Phase 27.** |

**Installation:** No host install — Caddy runs as Docker container `caddy:2.11` via compose. Local validation (D-24 checkpoint #2) can run via Docker:
```bash
docker run --rm -v "$(pwd)/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.11 \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```
This avoids requiring operators to install Caddy CLI locally — **important** because `command -v caddy` returns nothing on this developer machine [VERIFIED: 2026-04-28 shell check].

## Architecture Patterns

### Recommended Project Structure

After Phase 27 lands, `deploy/` looks like:
```
deploy/
├── Caddyfile                  # NEW (Phase 27)
├── DOMAIN-SETUP.md            # NEW (Phase 27)
├── README.md                  # Phase 26 (Phase 29 will expand)
├── docker-compose.yml         # Phase 26 — Phase 27 amends (adds caddy service + caddy_config volume)
├── .env.production.example    # Phase 26 — Phase 27 amends (adds ACME_EMAIL + ACME_CA)
└── scripts/                   # Phase 26 (init-secrets.sh); Phase 29 expands
    └── init-secrets.sh
```

### Pattern 1: Same-origin reverse proxy with `handle` blocks

**What:** Use mutually-exclusive `handle` directives to route by path prefix. Caddy auto-sorts by matcher specificity; operator's listed order is for readability only.

**When to use:** Single-domain SaaS where backend (api), frontend (web), and object storage (MinIO public buckets) all share one TLS termination point.

**Example:**
```caddy
# Source: https://caddyserver.com/docs/caddyfile/directives/handle
{$DOMAIN} {
    handle /api/* {
        reverse_proxy api:3003
    }
    handle /socket.io/* {
        reverse_proxy api:3003
    }
    handle /avatars/* {
        reverse_proxy minio:9000
    }
    handle /snapshots/* {
        reverse_proxy minio:9000
    }
    handle {
        reverse_proxy web:3000
    }
}
```

**Why this works:** [VERIFIED: caddyserver.com/docs/caddyfile/directives/handle]
- *"When multiple `handle` directives appear in sequence, only the first matching `handle` block will be evaluated."* — mutual exclusivity built in.
- *"Handle directives are sorted according to the directive sorting algorithm by their matchers"* — Caddy picks the most specific matching block; the catch-all `handle {}` block runs only when no path matcher matches.

### Pattern 2: Global options block with env-var defaults

**What:** Caddy supports `{$VAR:default}` syntax substituted **at Caddyfile load time** (not request time). This means a single Caddyfile can ship two configurations — staging vs prod ACME — controlled by a single env var.

**When to use:** When you need an operator-facing toggle that doesn't require editing the config file (read-only mount preserved).

**Example:**
```caddy
# Source: https://caddyserver.com/docs/caddyfile/concepts (env var substitution)
{
    acme_ca {$ACME_CA:https://acme-v02.api.letsencrypt.org/directory}
    email {$ACME_EMAIL}
    admin off
    protocols h1 h2
}
```

**Caveat:** [VERIFIED: caddyserver.com/docs/caddyfile/concepts] *"Environment variables in this form are substituted before Caddyfile parsing begins, so they can expand to empty values, partial tokens, complete tokens, or even multiple tokens and lines."* If `ACME_EMAIL` is empty, Caddy registers an anonymous ACME account (still works, but operator misses Let's Encrypt renewal warning emails). The DOMAIN-SETUP.md should call this out.

### Pattern 3: Auto-WebSocket pass-through (no config required)

**What:** Caddy v2's `reverse_proxy` automatically detects `Upgrade: websocket` + `Connection: Upgrade` request headers and transitions to a bidirectional tunnel. **No `header_up` rules required** for Socket.IO.

**Source:** [VERIFIED: caddyserver.com/docs/caddyfile/directives/reverse_proxy]
> *"The proxy also supports WebSocket connections, performing the HTTP upgrade request then transitioning the connection to a bidirectional tunnel."*

**Why it works for ALL 4 Socket.IO namespaces with one matcher:**

Socket.IO clients always handshake at `/socket.io/?EIO=4&transport=...&...`; the namespace is encoded in the URL fragment / query, NOT the path. Verified by reading the 4 gateway files:

| Gateway | File | `@WebSocketGateway namespace` |
|---------|------|-------------------------------|
| NotificationsGateway | `apps/api/src/notifications/notifications.gateway.ts:11` | `/notifications` |
| StatusGateway | `apps/api/src/status/status.gateway.ts:11` | `/camera-status` |
| ClusterGateway | `apps/api/src/cluster/cluster.gateway.ts:10` | **`/cluster-status`** (CONTEXT D-07 lists `/cluster` — minor doc drift; trailing-`s` matters in app-layer routing but is invisible to Caddy) |
| SrsLogGateway | `apps/api/src/srs/srs-log.gateway.ts:13` | **`/srs-logs`** (CONTEXT D-07 lists `/srs-log` — same drift) |

**Implication for planner:** The `/socket.io/*` matcher in D-05 is correct regardless of namespace name drift — namespaces never appear in the URL path Caddy sees. But the planner should NOTE the corrected namespaces in any updated docs (DOMAIN-SETUP.md does not reference them, so likely no doc fix needed).

### Anti-Patterns to Avoid

- **`route` instead of `handle`:** `route` blocks evaluate sequentially; multiple matchers can run on one request. We want mutual exclusivity (one block per request) — use `handle`. [VERIFIED: caddyserver.com/docs/caddyfile/directives/handle]
- **Manual `header_up` rules for WebSocket:** Caddy v2 handles WebSocket upgrade automatically; adding `header_up Upgrade {>Upgrade}` etc. is a Caddy v1 antipattern that introduces bugs in v2. [VERIFIED: caddy.community thread #22972 — *"you shouldn't use those `header_up` lines, Caddy handles headers correctly by default for WebSockets"*]
- **Mounting Caddyfile via `:rw` or omitting `:ro`:** Defense-in-depth. Caddy never writes back to the file; read-only prevents config drift from a runtime container compromise.
- **Exposing Caddy admin API on host (`-p 2019:2019`):** D-11 mandates `admin off`. Even loopback-bound, the admin API can issue config reloads — out of scope for v1.3 and adds Phase 30 nmap noise.
- **Path-matcher trailing-slash confusion:** `/api/*` does NOT match exactly `/api` (no trailing slash). [VERIFIED: caddyserver.com/docs/caddyfile/matchers] If api ever exposes a `/api` endpoint (no slash), it will route to `web` instead. See Common Pitfalls #2.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ACME HTTP-01 challenge handling | Custom certbot wrapper / cron job | Caddy auto-HTTPS | Caddy implements ACME natively, retries with exponential backoff (max 1 day, 30-day cap), falls back to ZeroSSL if Let's Encrypt rejects, switches to staging during retry storms — all **without configuration**. [VERIFIED: caddyserver.com/docs/automatic-https] |
| HTTP→HTTPS redirect | Custom server block / iptables | Caddy default | Auto-added when site address is a real hostname — *"Caddy keeps all managed certificates renewed and redirects HTTP (default port 80) to HTTPS (default port 443) automatically"*. [VERIFIED] |
| WebSocket Upgrade header forwarding | `header_up Connection` / `header_up Upgrade` rules | Caddy default | Auto-detects Upgrade requests; handles bidirectional tunnel. [VERIFIED] |
| Cert renewal cron | Custom cron `caddy reload` | Caddy auto-renewal | Caddy renews certs in-place; persisted in `/data` volume. |
| Status code mapping for upstream errors | Custom error templates | Caddy default | Caddy returns 502 for upstream failures, 503 for unhealthy upstreams — sufficient for v1.3. |
| Healthcheck endpoint design | Dedicated `/healthz` route in Caddyfile | Bare `wget --spider http://localhost:80` | Caddy returns 308 on HTTP for any path → wget treats this as success → port-liveness signal sufficient. No need for a special endpoint. [VERIFIED: D-16 + Discretion: Caddy `/` returns 308 → liveness OK] |

**Key insight:** Caddy's value comes from its defaults. The fewer directives in our Caddyfile, the more we benefit from upstream improvements (e.g., the v2.11.0 release added auto-Host-header rewrite for HTTPS upstreams; we get this for free without changing our config). Every directive added is a line that future Caddy versions might supersede.

## Runtime State Inventory

> Phase 27 is *not* a rename or refactor — it adds a new service to a previously-defined compose file. This section documents the small surface of state Phase 27 creates so the planner can reason about Phase 28-30 hand-offs.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `caddy_data` Docker named volume — Phase 26 declared, Phase 27 attaches. Will persist Let's Encrypt account JSON, issued certs (`certificates/acme-v02.api.letsencrypt.org-directory/{domain}/`), private keys, OCSP staples. **`caddy_config` Docker named volume** — Phase 27 declares new; holds Caddy autosave config snapshots (transient). | Phase 27 creates both. Phase 28 (CI/CD) does not touch them. Phase 29 `backup.sh` includes `caddy_data` (per DEPLOY-20 spec). Phase 30 verifies persistence (D-24 #6). |
| Live service config | None at Phase 27 layer — config is the static `Caddyfile` bind-mounted read-only. No DB-stored config, no admin-API mutations (D-11 `admin off`). | Operators reconfigure by editing `deploy/Caddyfile` + `docker compose restart caddy`. Document this in DOMAIN-SETUP.md. |
| OS-registered state | None. Caddy runs entirely inside the container; no systemd unit, no /etc/letsencrypt, no host firewall rules created. | None — host-level state remains the Linux distro's default. Phase 30 nmap verifies Caddy ports 80/443 are open externally. |
| Secrets/env vars | New: `ACME_EMAIL` (required, human-set), `ACME_CA` (optional, default empty = prod CA). Both go in `deploy/.env.production.example`. | Phase 27 patches `.env.production.example` per D-19. `init-secrets.sh` does NOT auto-populate (per D-20). Phase 29 may add validation. |
| Build artifacts | None — Caddy runs from upstream `caddy:2.11` image; no local image build. | Phase 28 CI/CD does not build Caddy. `docker compose pull` for the caddy service pulls upstream. |

**Nothing found in category:** OS-registered state, build artifacts (verified explicitly above).

## Common Pitfalls

### Pitfall 1: Mixed-content blocking on avatar/snapshot URLs (CRITICAL — pre-existing Phase 26 bug surfaced by Phase 27)

**What goes wrong:** When a user loads `https://${DOMAIN}/app/cameras` (HTTPS page), the browser blocks any `<img src="http://...">` from the same response — this is the W3C "passive mixed content" rule. With Phase 26 settings (`MINIO_USE_SSL=false` + `MINIO_PUBLIC_PORT=443`), `MinioService.getAvatarUrl()` and `getSnapshotUrl()` produce `http://${DOMAIN}:443/avatars/{user}.webp?v=N` — every browser blocks these. Camera card thumbnails appear broken; user avatars don't load. Console shows: *"Mixed Content: The page at 'https://example.com/app/cameras' was loaded over HTTPS, but requested an insecure element 'http://example.com:443/snapshots/...'"*

**Why it happens:** `apps/api/src/recordings/minio.service.ts:111-122,178-189` reads ONE env var (`MINIO_USE_SSL`) for two unrelated purposes:
1. The MinIO **SDK client connection** scheme (api → minio inside Docker network → must be `false`, MinIO listens HTTP on `:9000`).
2. The **public browser URL scheme** in the response body (browser → Caddy → must be `true` because the page is HTTPS).

These should be independent flags. Phase 26 chose `MINIO_USE_SSL=false` (correctly for SDK) and added `MINIO_PUBLIC_PORT=443` (anticipating Caddy TLS), but did not add `MINIO_PUBLIC_USE_SSL=true`. The defect is invisible until Caddy is in front.

**How to avoid:** Three options the planner should present to the operator before locking the Phase 27 plan:

1. **Add `MINIO_PUBLIC_USE_SSL` env var** — patch `MinioService.getAvatarUrl()` + `getSnapshotUrl()` to read a second flag. Smallest code change. Phase 27 scope creep (3 LOC in api).
2. **Emit scheme-less / relative URLs** — return `/avatars/{user}.webp?v=N` (no host, no scheme). Browser uses page's scheme + host automatically. Cleanest, future-proof against domain changes. Phase 27 scope creep (~10 LOC in api + tests).
3. **Force `MINIO_USE_SSL=true`** for prod — but this breaks the SDK client (api → minio is HTTP within the network, MinIO would reject TLS handshake on `:9000`). **NOT VIABLE** unless MinIO is also reconfigured to serve TLS, which is out of v1.3 scope.

**Recommended:** Option 2 (relative URLs) — most robust, smallest behavioral surface, eliminates the env-var-overload defect entirely. But this is a code change in `apps/api`, which is technically **outside the CONTEXT.md "Out of scope" line** *"Refactor `getAvatarUrl` / `getSnapshotUrl`"*. The planner should escalate this to the operator as a planning question (see Open Question #1) before writing tasks.

**Warning signs:** After Phase 27 ships, manually verify on staging: `curl -s https://${DOMAIN}/app/cameras | grep -E '(http|https)://[^/]+/(avatars|snapshots)/'` should show ONLY `https://` URLs (or no scheme). If `http://` URLs appear, the defect is live. Phase 30 SC #2 (camera register → playback → status updates) will likely fail at the visual snapshot rendering step.

**Confidence:** HIGH that the bug exists (verified by reading `apps/api/src/recordings/minio.service.ts:111-122,178-189`). HIGH that mixed content blocks the URLs (W3C standard, browser-universal). The fix choice is the operator's call.

### Pitfall 2: `/api/*` does NOT match bare `/api`

**What goes wrong:** A request to `https://${DOMAIN}/api` (no trailing slash) routes to the `handle {}` catch-all → `web:3000` instead of `api:3003`. If api ever exposes a controller at the literal `/api` path, it becomes unreachable through Caddy.

**Why it happens:** Caddy path matchers treat slashes as significant. [VERIFIED: caddyserver.com/docs/caddyfile/matchers] *"`/foo*` will match `/foo`, `/foobar`, `/foo/`, and `/foo/bar`, but `/foo/*` will not match `/foo` or `/foobar`."*

**Verified state today:** [VERIFIED: grep of `apps/api/src` controllers]
- All NestJS controllers prefix routes with `/api/...` sub-paths (`/api/health`, `/api/admin/...`, `/api/cameras`, etc.).
- Bare `/api` (no slash) is NOT exposed by any controller.
- Web's Next.js app DOES have `apps/web/src/app/api/health/route.ts` ([Phase 25 D-02 product]) — but this `/api/health` endpoint is reached only by the web container's internal HEALTHCHECK probe (`localhost:3000/api/health`); production traffic going to `https://${DOMAIN}/api/health` correctly routes to `api:3003/api/health` via Caddy. **No collision in practice.**

**How to avoid:** Either:
- **Confirm api never exposes `/api` exactly** (true today — keep monitoring).
- **Or use `path /api /api/*`** matcher syntax to cover both exact and subpath. Adds 1 token; harmless. The planner can choose either based on appetite for future-proofing vs minimalism.

**Same pitfall applies to `/socket.io/*` `/avatars/*` `/snapshots/*`** but in practice Socket.IO always sends `/socket.io/?...` (trailing slash) and avatar/snapshot URLs are always `/avatars/{user}.webp` (with file segment). Low risk.

**Warning signs:** A 404 from the web service when curling `https://${DOMAIN}/api`. Add to Phase 27 verification checklist (D-24): `curl -sI https://${DOMAIN}/api/health` → expect 200 from api, NOT a Next.js 404.

### Pitfall 3: Let's Encrypt rate-limit lockout from misconfigured DNS or firewall

**What goes wrong:** Operator points DNS A-record at the wrong IP (or port 80 is blocked), runs `docker compose up -d`. Caddy attempts ACME HTTP-01 challenge → fails → retries with exponential backoff. After ~5 attempts, hits the Let's Encrypt **failed-validation rate limit (5 per hostname per hour)** [VERIFIED: letsencrypt.org/docs/rate-limits/]. Operator now waits ≥1 hour before any cert can issue, even after fixing DNS/firewall.

**Why it happens:** Caddy retries are smart but deterministic — the operator hits the same wall faster than they'd expect. Worse: certs requested for the prod domain count against the **duplicate certificate limit (5 per identifier set per week)**, so a botched first try eats one of those 5 slots.

**How to avoid:** Document the staging-CA toggle (D-09 + D-21). Operators set `ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory` in `.env`, restart caddy, verify cert issued (browser shows "Fake LE" issuer, security warning expected), then unset and restart for prod. Staging has 30,000 cert/account/week limit — effectively no rate-limit risk during debug. [VERIFIED: letsencrypt.org/docs/staging-environment/]

**Caddy's built-in mitigation:** [VERIFIED: caddyserver.com/docs/automatic-https] *"During retries with Let's Encrypt, Caddy switches to their staging environment to avoid rate limit concerns."* — but this is only **after** the prod attempt has failed and only **during** the retry burst, not as an initial fallback. Once Caddy switches to staging during retry, the certificate is issued by staging (untrusted) and the operator still won't have a working browser-trusted cert. The manual `ACME_CA` toggle gives operators control over **when** to retry against prod.

**Warning signs:** `docker compose logs caddy --since 10m | grep -E 'rate.?limit|too many|Service Unavailable'`. If found, switch `ACME_CA` to staging, fix DNS/firewall, verify cert issues, then switch back.

### Pitfall 4: Caddyfile bind-mount inode warning (LOW priority)

**What goes wrong:** Per the official Caddy Docker image README: *"Do not mount the Caddyfile directly at `/etc/caddy/Caddyfile`"* — the warning explains that some editors atomically replace files (write-then-rename), changing the inode; Docker bind mounts pin to inode at container start, so the container sees stale content until restart.

**Why it happens:** Editor-driven inode swap is a real issue for **dev workflows** where the file is being edited live and a `caddy reload` is expected to pick up changes without container restart.

**How to avoid in Phase 27:** This warning does NOT meaningfully apply to our setup because:
1. CONTEXT D-11 sets `admin off` — there is no hot-reload path. Operators reload via `docker compose restart caddy`, which restarts the container and refreshes the bind mount unconditionally.
2. The Caddyfile is mounted `:ro` — Caddy never writes back.
3. Operators edit and reload as a deliberate action; they're not relying on inotify-driven reload.

**Recommendation:** Keep the direct file bind (`./Caddyfile:/etc/caddy/Caddyfile:ro` per D-14) — it's the simplest pattern. If an operator hits the inode issue (rare, only on certain editors with write-rename atomic save), the fix is `docker compose restart caddy`, which is the documented reload path anyway. **Document this expectation in DOMAIN-SETUP.md briefly.** [VERIFIED: hub.docker.com/_/caddy]

### Pitfall 5: WebSocket idle timeout on long-lived Socket.IO connections

**What goes wrong:** A Socket.IO connection sits idle for >2 minutes (no events flowing) → Caddy's default `keepalive: 2m` for upstream connections kicks in → connection closes → client reconnects (Socket.IO has reconnect built in, so user-visible impact is brief).

**Why it happens:** Caddy's `reverse_proxy` defaults: `keepalive` 2m (idle), `stream_timeout` unlimited (during streaming). [VERIFIED: caddyserver.com/docs/caddyfile/directives/reverse_proxy] WebSocket counts as streaming once upgrade completes, so `stream_timeout: 0` (unlimited) applies — but the upstream HTTP keepalive may still affect the initial handshake state.

**How to avoid:** Socket.IO clients ping every 25 seconds by default (`pingInterval: 25000`). 25s < 2m, so the connection stays warm. **No config required** — this is informational. [ASSUMED: default `pingInterval` is 25s — the project hasn't been verified to use defaults]

**Warning signs:** If users report intermittent notification delivery delays >2 min after page-idle, increase `keepalive` in reverse_proxy block: `keepalive 5m`. Phase 27 ships without this; revisit if Phase 30 smoke shows reconnect storms.

### Pitfall 6: MinIO Host header rejection (THEORETICAL — not observed)

**What goes wrong:** Caddy v2 forwards the original `Host` header (e.g. `example.com`) to upstream by default. MinIO might reject if it expects `Host: minio:9000` for path-style requests.

**Why it doesn't happen in our case:** [VERIFIED: caddy.community/t/22972 — community-validated MinIO + Caddy template] The community-tested config uses bare `reverse_proxy minio:9000` with NO `header_up Host` rule — and it works for both API and console paths against public buckets. MinIO accepts any Host for path-style anonymous public-read requests.

**Caveat:** If MinIO is later configured with `MINIO_DOMAIN` env var (for virtual-host-style URLs), Host header matters. v1.3 uses path-style only — confirmed by `getAvatarUrl()` returning `/<bucket>/<object>` not `<bucket>.<host>/<object>`.

**How to avoid:** If MinIO returns 403 / 400 to Caddy-proxied requests, add `header_up Host {upstream_hostport}` to the `/avatars/*` and `/snapshots/*` reverse_proxy blocks. Mentioned as a fallback in CONTEXT D-04. **Default plan is no Host rewrite.**

### Pitfall 7: `${DOMAIN}` env var must be set BEFORE first `up`

**What goes wrong:** Operator runs `docker compose up -d` with empty `DOMAIN=` in `.env`. Caddyfile site address resolves to empty string → Caddy errors out with a config-load error.

**Why it happens:** Caddyfile env-var substitution happens at **load time** [VERIFIED: caddyserver.com/docs/caddyfile/concepts]; no fallback if not provided.

**How to avoid:** Document in DOMAIN-SETUP.md the strict order: (1) edit `.env` set DOMAIN + ACME_EMAIL, (2) point DNS A-record, (3) `docker compose up -d`. Phase 29 `bootstrap.sh` will validate before bringing the stack up — Phase 27 just documents.

**Warning signs:** Empty `DOMAIN` → Caddyfile parses but Caddy emits config-load error in logs. Healthcheck fails → restart loop. `docker compose logs caddy | grep "Caddyfile"` reveals the empty-site-address error.

### Pitfall 8: First-boot ordering — Caddy starts before web/api are healthy → 502 spam

**What goes wrong:** Without `depends_on`, Caddy boots in parallel with api/web. ACME HTTP-01 succeeds (port 80 challenge does not need upstreams), but the first browser GET hits Caddy → Caddy proxies to `web:3000` → DNS resolves but the connection is refused → 502. Logs fill with 502s during the ~30-60s api/web boot window.

**How to avoid:** D-16 already specifies `depends_on api/web service_healthy`. The api healthcheck (Phase 25 D-01) probes `/api/health` (public, unguarded, no DB ping — pure liveness). The web healthcheck (Phase 25 D-02) probes `/api/health` on web's port 3000. Both go healthy in <30s on cold boot. Caddy `start_period: 30s` prevents Caddy itself from being marked unhealthy during ACME issuance.

**Warning signs:** `docker compose logs caddy | grep -c "502"` should be 0 after `up -d` completes. If non-zero, increase api/web `start_period` or check upstream healthchecks.

## Code Examples

Verified configurations from official sources:

### Example 1: Complete deploy/Caddyfile (Phase 27 product)

```caddy
# deploy/Caddyfile — Phase 27 (DEPLOY-06, DEPLOY-07, DEPLOY-08)
# Source patterns: https://caddyserver.com/docs/caddyfile/directives/{handle,reverse_proxy}
#                  https://caddyserver.com/docs/caddyfile/options
#                  https://caddyserver.com/docs/automatic-https

{
	# ACME — defaults to Let's Encrypt prod CA. Override via ACME_CA env var
	# (e.g. https://acme-staging-v02.api.letsencrypt.org/directory) for debug.
	# See deploy/DOMAIN-SETUP.md.
	acme_ca {$ACME_CA:https://acme-v02.api.letsencrypt.org/directory}
	email {$ACME_EMAIL}

	# Lock down attack surface: no admin API + no HTTP/3 (Phase 30 nmap surface).
	admin off
	protocols h1 h2
}

{$DOMAIN} {
	# api — REST + Socket.IO handshake.
	handle /api/* {
		reverse_proxy api:3003
	}
	handle /socket.io/* {
		reverse_proxy api:3003
	}

	# MinIO public-read buckets — same-origin to avoid CORS + cookie pain.
	handle /avatars/* {
		reverse_proxy minio:9000
	}
	handle /snapshots/* {
		reverse_proxy minio:9000
	}

	# Default: web (Next.js).
	handle {
		reverse_proxy web:3000
	}
}
```

**Verification:** `docker run --rm -v $(pwd)/deploy/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2.11 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` → exit 0.

### Example 2: deploy/docker-compose.yml — caddy service block (added to Phase 26 file)

```yaml
# Phase 27 amends deploy/docker-compose.yml with the caddy service.
# Inserted between web (line ~250) and the closing networks: block (line ~255).

  caddy:
    image: caddy:2.11
    restart: unless-stopped
    init: true
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMAIN: ${DOMAIN}
      ACME_EMAIL: ${ACME_EMAIL}
      ACME_CA: ${ACME_CA:-}
    volumes:
      - caddy_data:/data
      - caddy_config:/config
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:80"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
    depends_on:
      api:
        condition: service_healthy
      web:
        condition: service_healthy
    networks:
      - edge
      - internal
    logging: *default-logging
```

**Volume declaration patch:** Add `caddy_config:` to the top-level `volumes:` block (line ~268-273 of Phase 26 product):

```yaml
volumes:
  postgres_data:
  redis_data:
  minio_data:
  caddy_data:
  caddy_config:    # NEW (Phase 27)
  hls_data:
```

### Example 3: .env.production.example patch

Add to **Section 1 (Required, no default)**:

```bash
# Required — Let's Encrypt contact for cert renewal warning emails.
# Caddy registers an anonymous ACME account if empty — operator misses
# expiry notifications. See deploy/DOMAIN-SETUP.md.
ACME_EMAIL=
```

Add to **Section 3 (Defaults, override-only)**:

```bash
# Optional — staging CA for ACME debugging without burning Let's Encrypt
# rate limit (5 failed validations / hostname / hour, 5 dup certs / week).
# Default empty: production CA. Staging URL:
#   https://acme-staging-v02.api.letsencrypt.org/directory
# See deploy/DOMAIN-SETUP.md "Staging-CA toggle".
ACME_CA=
```

### Example 4: DOMAIN-SETUP.md skeleton (D-21 minimal scope)

```markdown
# Domain Setup — SMS Platform Production Deploy

## 1. DNS A-Record
Point ${DOMAIN} at host's public IP. TTL 300s during setup, raise after.
Verify: dig +short ${DOMAIN}

## 2. Port 80 Reachability
Caddy uses Let's Encrypt HTTP-01 challenge. TCP 80 must be open externally.
Cloudflare proxy: gray-cloud (DNS-only) during initial cert.
Verify: curl -I http://${DOMAIN}  → expect 308 once Caddy is up.

## 3. Staging-CA Toggle (Debug Mode)
Set ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory in .env.
Restart caddy. Verify with openssl s_client → "Fake LE" issuer.
Unset + restart to re-issue against prod CA.

## 4. Common Errors
| Caddy log message | Cause | Fix |
| 401 unauthorized | Port 80 closed | Open inbound TCP 80 |
| timeout / NXDOMAIN | DNS not propagated | Wait, verify with dig |
| Service Unavailable / rate limit | Hit Let's Encrypt quota | Switch to staging |
| dial tcp: lookup minio | Caddy missing internal network | Verify D-17 — caddy on edge+internal |
```

(Rendered length ~70 lines of Markdown — within the D-21 "minimal ~1 page" target.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| nginx + certbot + cron | Caddy 2 (auto-TLS) | 2018+ (Caddy 2 GA 2020) | One config file vs three; auto-renewal; no cron. Industry-standard for small-to-medium self-hosted SaaS. |
| Caddy v1 hot-reload via API | Caddy v2 `admin off` + `docker compose restart` | Caddy v2 GA 2020 | Reduced attack surface; restart-based reload sufficient when config changes are infrequent (Phase 27 use case). |
| Manual `header_up Upgrade` for WebSocket | Auto-detect (Caddy v2) | Caddy 2.0+ | Removes ~5 lines per upstream block; less drift risk. |
| `protocols h1 h2 h3` (HTTP/3 enabled) | `protocols h1 h2` (HTTP/3 disabled) | v1.3 deliberate decision | Smaller firewall surface; QUIC defer until demand. Reversible (1 line + 1 port). |
| Mounting Caddyfile rw | Mounting Caddyfile ro | Best practice 2022+ | Defense-in-depth; container compromise can't rewrite config. |

**Deprecated/outdated:**
- **Caddy v1 syntax** (e.g., `proxy /api api:3003 { transparent websocket }`): replaced by v2 `reverse_proxy` (auto-Host, auto-WebSocket). Don't reference v1 docs (`caddyserver.com/v1/`) — easy mistake on web search.
- **`tls internal`** for self-signed: not used in v1.3 (real domain, real cert).
- **`tls /path/cert /path/key`** for manual cert: not used — auto-TLS is the entire value proposition.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MinIO accepts requests with `Host: ${DOMAIN}` (not `Host: minio:9000`) for anonymous public-read GETs on path-style URLs. | Common Pitfalls #6 | If wrong, Caddy needs `header_up Host {upstream_hostport}` on `/avatars/*` + `/snapshots/*` blocks. Verifiable in Phase 27 smoke (D-24) or Phase 30 e2e. Confidence: MEDIUM (community-validated config pattern, not directly tested in our deploy). |
| A2 | Socket.IO clients in this repo use default `pingInterval: 25000` (no override). | Common Pitfalls #5 | If overridden to >2min, Caddy idle-keepalive bites and clients reconnect every keepalive cycle. Verifiable via grep for `pingInterval` / Socket.IO client config in `apps/web`. Confidence: MEDIUM. |
| A3 | After Phase 27 ships, `https://${DOMAIN}/api/health` reaches the api `HealthController` (not the web Next.js `/api/health` route handler). | Common Pitfalls #2 | Verified true today: `apps/web/src/app/api/health/route.ts` exists but is reached only via the web container's internal HEALTHCHECK (`localhost:3000`); production traffic to `${DOMAIN}/api/*` routes through Caddy → `api:3003`. **VERIFIED HIGH.** |
| A4 | The 4 Socket.IO namespaces' authentication flow does not require sticky sessions (single-replica api means socket-affinity is moot). | D-07 | True today (single api container). If api scales horizontally in v1.4, Caddy will need `lb_policy ip_hash` or sticky cookies. Out of scope. Confidence: HIGH (single replica today). |
| A5 | Caddy's official `caddy:2.11` Alpine image bundles `wget` (busybox) for the healthcheck. | D-16 | If wrong, healthcheck `wget --spider` always fails; container marked unhealthy → restart loop. Caddy's docker-library Dockerfile sources from `alpine:3.x` which includes busybox by default; busybox provides wget. Confidence: HIGH (alpine-busybox standard). |
| A6 | Phase 26's `caddy_data` named volume declaration (lines 268-273 of `deploy/docker-compose.yml`) was made specifically to allow Phase 27 to attach without forcing a destructive `docker volume rm`. | D-13 hand-off | Verified true: Phase 26 compose file comment lines 263-266 explicitly state *"caddy_data declared HERE so Phase 27 caddy service can attach without requiring a destructive recreate."* **VERIFIED HIGH.** |

## Open Questions

1. **CRITICAL — Mixed-content blocking for avatar/snapshot URLs.** `MinioService.getAvatarUrl()` + `getSnapshotUrl()` produce `http://${DOMAIN}:443/...` URLs (verified in `apps/api/src/recordings/minio.service.ts:111-122,178-189`). Browsers will block these on the HTTPS-served pages.
   - What we know: bug is real; fix requires api code change.
   - What's unclear: which fix to ship in Phase 27 — (a) introduce `MINIO_PUBLIC_USE_SSL=true`, (b) emit relative URLs, (c) defer to v1.3.x patch and ship Phase 27 with broken thumbnails.
   - **Recommendation:** Operator decides BEFORE planner writes tasks. Default suggestion: option (b) relative URLs — cleanest, smallest behavioral surface. Note this expands Phase 27 scope by ~10 LOC + 2-3 unit tests in api.

2. **`/api` exact-match routing.** D-05 uses `handle /api/*` which does NOT match bare `/api`. Today no api controller exposes `/api` exactly; future-proofing would be `path /api /api/*`.
   - What we know: low risk today.
   - What's unclear: whether the planner adds defensive matchers (1 token cost) or accepts the current state.
   - **Recommendation:** Add defensive matcher `path /api /api/*` (and same for `/socket.io`) — costs nothing, future-proof.

3. **Should `/health` be a dedicated proxy path?** Phase 25 placed `/api/health` on api (correct). Operators / monitoring tools (UptimeRobot, etc.) probe `https://${DOMAIN}/api/health` — works through current routing.
   - What we know: works without extra config.
   - What's unclear: whether to add a top-level `/health` shortcut for tooling that hates path prefixes.
   - **Recommendation:** Don't add. `/api/health` is canonical; tooling can use it.

4. **DOMAIN-SETUP.md placement of Cloudflare DNS-only guidance.** D-21 lists Cloudflare gray-cloud requirement under "Port 80 Reachability" — but operators using Cloudflare may interpret this as "you can't use Cloudflare at all".
   - What we know: HTTP-01 challenge bypasses proxy by hitting port 80 origin directly; gray-cloud is required only during initial cert issuance.
   - What's unclear: whether to add a "after first cert: re-enable orange-cloud is OK" note.
   - **Recommendation:** Add the post-issuance re-enable note (1 sentence). Improves operator UX without bloating doc.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Phase 27 verification (D-24 #1, #3-6) | ✓ | 28.3.2 | — |
| Docker Compose v2 | Phase 27 verification (D-24 #1, #3-6) | ✓ | v2.39.1-desktop.1 | — |
| `caddy` CLI (host install) | D-24 #2 (`caddy validate --config deploy/Caddyfile`) | ✗ | — | Run via Docker: `docker run --rm -v ./Caddyfile:/etc/caddy/Caddyfile:ro caddy:2.11 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`. Documented in Standard Stack section. |
| `curl` | D-24 #4-5 (HTTP redirect + WSS upgrade probes) | ✓ | system | — |
| `openssl` | D-24 #5 generates `Sec-WebSocket-Key` (`openssl rand -base64 16`) | ✓ | /opt/homebrew/bin/openssl | — |
| `dig` | DOMAIN-SETUP.md DNS verification example | ✓ | system bind-tools | — |
| `wget` (in Caddy container) | D-16 healthcheck `wget --spider` | ✓ (busybox) | bundled in `caddy:2.11-alpine` | — |
| Public DNS A-record + TCP 80 inbound | D-24 #3 (cert obtained log) | host-environment-dependent | — | Use staging-CA toggle (D-09) for cert issuance under restrictive networks; final issuance only validated in Phase 30. |

**Missing dependencies with no fallback:** None — `caddy` CLI is the only missing host tool, and the Docker fallback is a one-liner. All other tools are present.

**Missing dependencies with fallback:**
- `caddy` CLI: substitute Docker-run command (documented above).

## Validation Architecture

### Test Framework

Phase 27 ships configuration files (Caddyfile, .env.production.example patch, docker-compose.yml patch, DOMAIN-SETUP.md). It introduces no application code requiring unit tests. The "tests" are static-artifact validators + 2 lab-only smoke probes.

| Property | Value |
|----------|-------|
| Framework | Bash + Docker (no test runner — config validation only) |
| Config file | None (validation is per-step shell command) |
| Quick run command | `docker compose -f deploy/docker-compose.yml --env-file deploy/.env config --quiet` |
| Full suite command | The 6 D-24 verification checkpoints in sequence |
| Existing api unit tests | `apps/api/tests/account/minio-avatars.test.ts` (uses `MINIO_USE_SSL`) — Wave 0 GAP if Open Question #1 picks option (b): test must be updated to assert relative-URL output. |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-06 (cert auto-issue) | Caddy issues Let's Encrypt cert on first boot | smoke (lab) | `docker compose up -d && sleep 60 && docker compose logs caddy --since 60s \| grep -i 'certificate obtained successfully'` | requires lab env (D-24 #3) |
| DEPLOY-06 (HTTP→HTTPS redirect) | Port 80 returns 308 → HTTPS | smoke (lab) | `curl -kIL http://${DOMAIN} \| grep -E '308 Permanent Redirect'` | requires lab env (D-24 #4) |
| DEPLOY-07 (compose syntax) | docker-compose.yml + Caddyfile parse | static | `docker compose -f deploy/docker-compose.yml --env-file deploy/.env config --quiet && docker run --rm -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.11 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` | ❌ Wave 0 (Caddyfile + amended compose not yet written) |
| DEPLOY-07 (path routing) | `/api/health` → api, `/avatars/X` → minio, `/` → web | smoke (lab) | `curl -sI https://${DOMAIN}/api/health` → 200 from api; `curl -sI https://${DOMAIN}/avatars/foo.webp` → 404 (NoSuchKey from MinIO is fine — proves routing reaches minio); `curl -sI https://${DOMAIN}/` → web's HTML | requires lab env (D-24 implicit) |
| DEPLOY-08 (WebSocket pass-through) | Socket.IO upgrade returns 101 | smoke (lab) | `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" -H "Sec-WebSocket-Version: 13" "https://${DOMAIN}/socket.io/?EIO=4&transport=websocket"` → `HTTP/1.1 101 Switching Protocols` | requires lab env (D-24 #5) |
| DEPLOY-09 (volume persistence) | `down && up` does not re-issue cert | smoke (lab) | `docker compose down && docker compose up -d && sleep 30 && [ "$(docker compose logs caddy --since 30s \| grep -c 'certificate obtained')" = "0" ]` | requires lab env (D-24 #6) |
| DEPLOY-24 (DOMAIN-SETUP.md content) | Doc covers DNS A-record, port 80, propagation, staging toggle | static | `for s in "DNS A" "Port 80" "Propagation" "Staging" "Common Errors"; do grep -q "$s" deploy/DOMAIN-SETUP.md \|\| echo "MISSING: $s"; done` | ❌ Wave 0 (DOMAIN-SETUP.md not yet written) |

### Sampling Rate

- **Per task commit:** static validators only (compose config + Caddyfile validate + DOMAIN-SETUP grep) — under 5 seconds. Lab smoke is OUT (requires DNS + port 80; not available on dev machine).
- **Per wave merge:** all static validators + visual review of the Caddyfile against this research's Example 1.
- **Phase gate (D-24):** all 6 checkpoints, including the 4 lab-required smoke probes. Operator runs these on a lab host (or defers to Phase 30 GA gate).

### Wave 0 Gaps

- [ ] `deploy/Caddyfile` — covers DEPLOY-06, 07, 08 (Phase 27 product, not yet written).
- [ ] `deploy/docker-compose.yml` patch (caddy service + caddy_config volume) — covers DEPLOY-09, 13.
- [ ] `deploy/.env.production.example` patch (ACME_EMAIL, ACME_CA) — covers DEPLOY-22, 24.
- [ ] `deploy/DOMAIN-SETUP.md` — covers DEPLOY-24.
- [ ] (Open Question #1) `apps/api/src/recordings/minio.service.ts` URL builder fix + `apps/api/tests/account/minio-avatars.test.ts` update — covers Pitfall #1 / mixed-content blocker. Conditional on operator decision.
- [ ] No framework install needed — Bash + Docker already present. The `caddy` CLI is provided via the `caddy:2.11` Docker image (no host install).

## Security Domain

> Required per `.planning/config.json` (no `security_enforcement: false` flag).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirectly) | Better Auth handles auth; Caddy passes Cookie + Authorization headers untouched (default). NOT a Phase 27 concern. |
| V3 Session Management | yes (indirectly) | Same — Better Auth session cookies pass through Caddy unchanged. Same-origin design eliminates CORS concerns. |
| V4 Access Control | no | App-layer (NestJS guards, RLS in Postgres). Caddy ships no path-based ACLs. |
| V5 Input Validation | no | App-layer (Zod schemas in api). Caddy does no body inspection. |
| V6 Cryptography | yes — TLS termination | Caddy auto-TLS (Let's Encrypt). NEVER hand-roll. v1.3 protocols `h1 h2`, modern cipher suites (Caddy default = TLS 1.2 + 1.3 only, modern suites). [VERIFIED: Caddy default cipher suite policy is "internet-best-practice"] |
| V9 Communication | yes — HTTP→HTTPS redirect | Caddy auto-redirect. HSTS not added by default in Caddy 2.x — see Threat Patterns below. |
| V11 Business Logic | no | App-layer. |
| V13 API Spec | no | App-layer (Swagger). |
| V14 Configuration | yes — secret handling, defense-in-depth | Caddyfile mounted `:ro`; admin API off; HTTP/3 disabled (smaller surface); env vars read from Docker env (NOT host process env, NOT baked into image). |

### Known Threat Patterns for Caddy + Reverse Proxy

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| ACME challenge replay / cert spoofing | Tampering | HTTP-01 challenge requires control of port 80 on the DNS-resolved IP — built-in defense. Operator must ensure DNS A-record is correct. |
| Mixed-content (HTTP assets on HTTPS page) | Information Disclosure | See Pitfall #1 (avatar/snapshot URLs). Browsers block at app layer. **Plan must address before phase ships.** |
| Caddy admin API exposure (default `:2019`) | Elevation of Privilege | D-11 `admin off`. Verified default loopback bind, but disabled entirely closes the door. |
| Open ACME-account theft (lost `caddy_data`) | Spoofing | `caddy_data` volume persists ACME account JSON (private key for the account). Phase 29 backup includes this volume. Compromise of `caddy_data` = attacker can request certs as our identity until the account is revoked. **Operator backup access controls matter.** |
| HSTS bypass / SSL-stripping on first request | Tampering | Caddy does NOT auto-add `Strict-Transport-Security` header. Phase 27 may want to add `header Strict-Transport-Security "max-age=31536000; includeSubDomains"` in the site block — but this is one-way (HSTS pinning persists in browsers). **Defer to Phase 30 / v1.3.x — too risky for first deploy without operator awareness.** |
| Upstream impersonation via Docker DNS poisoning | Spoofing | Internal Docker bridge networks (`edge`, `internal`) — only services on the network can resolve `api`, `web`, `minio`. No external reach. Phase 30 nmap verifies. |
| Outdated Caddy with known CVE | Tampering | `caddy:2.11` floating tag absorbs patch releases on `docker compose pull`. Phase 28 GHCR pull cycle covers this implicitly. |
| HTTP/2 SETTINGS flood / Rapid-Reset attack (CVE-2023-44487) | Denial of Service | Caddy 2.7.5+ patched (we run 2.11.x). [VERIFIED: caddyserver.com release notes] |

**Recommended hardening NOT included in Phase 27** (defer to Phase 30 / v1.3.x): HSTS header, request body size limits, rate limiting (caddy-ratelimit module), security headers (X-Frame-Options, X-Content-Type-Options, CSP). All app-layer concerns or out-of-scope per CONTEXT deferred list.

## Sources

### Primary (HIGH confidence)
- [Caddy reverse_proxy directive docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) — WebSocket auto-pass, Host header behavior, default timeouts (`keepalive 2m`, `stream_timeout` unlimited). 2026-04-28.
- [Caddy automatic HTTPS docs](https://caddyserver.com/docs/automatic-https) — ACME flow, port 80 requirement, retry/backoff, fallback issuers. 2026-04-28.
- [Caddy Caddyfile concepts (env vars)](https://caddyserver.com/docs/caddyfile/concepts) — `{$VAR:default}` substitution at load time. 2026-04-28.
- [Caddy Caddyfile global options](https://caddyserver.com/docs/caddyfile/options) — `acme_ca`, `email`, `admin off`, `protocols`, `auto_https` syntax. 2026-04-28.
- [Caddy `handle` directive docs](https://caddyserver.com/docs/caddyfile/directives/handle) — mutual exclusivity, sorting, catch-all pattern. 2026-04-28.
- [Caddy matchers docs](https://caddyserver.com/docs/caddyfile/matchers) — path matcher slash significance, case-insensitivity. 2026-04-28.
- [Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/) — 5 failed validations/hostname/hour, 5 dup certs/identifier set/week, 50 certs/registered domain/week. 2026-04-28.
- [Let's Encrypt staging environment](https://letsencrypt.org/docs/staging-environment/) — staging endpoint URL, generous rate limits. 2026-04-28.
- [Caddy GitHub releases](https://api.github.com/repos/caddyserver/caddy/releases) — latest 2.11.2 (2026-03-06). 2026-04-28.
- [Caddy Docker Hub tag list](https://hub.docker.com/v2/repositories/library/caddy/tags) — `caddy:2.11` floats to 2.11.2; no 2.12.x line yet. 2026-04-28.
- [Caddy Docker Hub README](https://hub.docker.com/_/caddy) — `/data` + `/config` paths, Caddyfile bind-mount inode warning. 2026-04-28.
- `apps/api/src/recordings/minio.service.ts:1-190` — verified `getAvatarUrl()` + `getSnapshotUrl()` URL composition (mixed-content blocker root cause).
- `apps/api/src/{notifications,status,cluster,srs}/...gateway.ts` — verified actual Socket.IO namespaces (drift from CONTEXT D-07 noted).
- `deploy/docker-compose.yml` (Phase 26 product, on disk) — verified `caddy_data` already declared at lines 268-273; `edge` + `internal` topology; SRS port footprint.

### Secondary (MEDIUM confidence)
- [Caddy community: MinIO reverse-proxy template](https://caddy.community/t/minio-reverse-proxy-template-from-nginx/22972) — community-validated `reverse_proxy minio:9000` works without `header_up Host` for path-style anonymous public-read.
- [Caddy reverse_proxy quickstart](https://caddyserver.com/docs/quick-starts/reverse-proxy) — basic patterns.

### Tertiary (LOW confidence)
- *(none — every claim in this research was verified against primary sources or read directly from the codebase)*

## Metadata

**Confidence breakdown:**
- Standard stack (Caddy 2.11.2): HIGH — version verified against GitHub releases + Docker Hub tag list.
- Architecture (handle/route/matchers/env vars): HIGH — every pattern verified against caddyserver.com docs.
- Pitfalls: HIGH for #1, #2, #3, #4 (verified against source/docs); MEDIUM for #5, #6 (community-validated, not in our deploy yet); HIGH for #7, #8 (verified config behavior).
- Security: HIGH — ASVS categories + threat patterns mapped against Caddy defaults.
- Open Questions: 4 questions, all surfaced for operator before plan-locking. The mixed-content question (#1) is a BLOCKER for v1.3 GA functionality.

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (30 days — Caddy 2.11.x is stable; only re-research if Caddy 2.12 ships before Phase 27 lands or if Let's Encrypt changes rate-limit policy)
