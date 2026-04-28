---
phase: 27-caddy-reverse-proxy-auto-tls
verified: 2026-04-28T08:30:00Z
status: human_needed
score: 5/5 must-haves verified (static); 3 success criteria deferred to Phase 30 live-cluster smoke
re_verification: false
human_verification:
  - test: "Live Let's Encrypt cert issuance on real DNS"
    expected: "First `docker compose up -d` (with DOMAIN A-record + port 80 reachable) produces a valid LE cert within 60s; `https://${DOMAIN}` loads web; `http://${DOMAIN}` 308-redirects to HTTPS"
    why_human: "Requires public DNS + port 80 reachability + real Let's Encrypt servers; cannot be verified statically. Roadmap SC #1. Explicitly scoped to Phase 30 cluster smoke per DOMAIN-SETUP.md footer + 27-05 SUMMARY."
  - test: "Live wss:// upgrade through caddy to NotificationsGateway + StatusGateway"
    expected: "`curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Key: ...' -H 'Sec-WebSocket-Version: 13' https://${DOMAIN}/socket.io/?EIO=4&transport=websocket` returns HTTP/1.1 101 Switching Protocols; logging into the deployed app and triggering a camera status change delivers events via NotificationsGateway and StatusGateway end-to-end"
    why_human: "Requires running stack with valid TLS cert + Socket.IO client. Roadmap SC #3. Explicitly scoped to Phase 30."
  - test: "Cert persistence across docker compose down/up"
    expected: "After first `up` produces a valid cert, `docker compose down && docker compose up -d` does NOT trigger ACME re-issuance (`docker compose logs caddy | grep -c 'certificate obtained'` = 0 on second boot)"
    why_human: "Requires complete down/up cycle on a host where the cert was actually issued. Roadmap SC #4. Explicitly scoped to Phase 30."
  - test: "Run `bash deploy/scripts/verify-phase-27.sh` on a host with healthy Docker daemon"
    expected: "Exit 0; output ends with `All N static checks passed.`; checkpoints [1/4] compose config + [2/4] caddy validate both PASS in addition to the structural greps"
    why_human: "Host Docker daemon was unresponsive during Plan 27-05 execution + the orchestrator-side verification window (Docker Desktop on macOS hung). Plan 27-05 SUMMARY captured 22-25/22-25 structural greps PASS via manual fallback, and the [1/4] compose-config check passed before the daemon hung. Operator should re-run on Phase 30 clean Linux VM to confirm."
---

# Phase 27: Caddy Reverse Proxy + Auto-TLS Verification Report

**Phase Goal:** A single hostname terminates TLS automatically via Let's Encrypt, routes `/api/*` and `/socket.io/*` to api:3003 and everything else to web:3000 (same-origin pattern eliminates cookie/CORS pain), and persists certificates across container restarts so `docker compose down/up` does not trigger ACME rate-limit lockout. WebSocket pass-through works for both NotificationsGateway and StatusGateway.

**Verified:** 2026-04-28T08:30:00Z
**Status:** human_needed (3 live-cluster checks deferred to Phase 30; static layer 100% green)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria 1-5)

| # | Truth (from ROADMAP.md) | Status | Evidence |
|---|-------------------------|--------|----------|
| 1 | Setting `DOMAIN=example.com` in `.env`, pointing example.com's A-record at the host, and running `docker compose up -d` results in a valid Let's Encrypt certificate within 60s; `https://example.com` loads the web app and `http://example.com` 301-redirects to HTTPS | ? UNCERTAIN (static layer ✓) | Caddyfile has `acme_ca` with prod LE default + `email {$ACME_EMAIL}` (D-09/D-10); compose caddy service exposes :80+:443; auto-HTTPS is on by virtue of real-hostname site address (D-08 — no `tls` directive). Live cert issuance + 308 redirect = Phase 30 cluster smoke. |
| 2 | Staging-CA toggle works (operator can debug DNS/firewall without burning prod quota) | ✓ VERIFIED | Caddyfile global block: `acme_ca {$ACME_CA:https://acme-v02.api.letsencrypt.org/directory}` — empty `ACME_CA` falls through to prod; setting `ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory` in `.env` flips to staging. Compose caddy service env block exports `ACME_CA: ${ACME_CA:-}`. DOMAIN-SETUP.md §4 documents the operator workflow including 4-step swap to prod CA. |
| 3 | WebSocket reaches `NotificationsGateway` and `StatusGateway` via Caddy: `wss://example.com/socket.io/?EIO=4&transport=websocket` upgrades successfully and receives notify/status events | ? UNCERTAIN (static layer ✓) | Caddyfile has `handle /socket.io/* { reverse_proxy api:3003 }` covering all 4 namespaces (D-07 — namespace lives in query/auth, not URL). Caddy 2.x `reverse_proxy` auto-passes WebSocket Upgrade/Connection headers (D-06 — no `header_up` rules needed). Live wss:// 101 upgrade + actual gateway events = Phase 30 cluster smoke. |
| 4 | `caddy_data` + `caddy_config` named volumes persist certs across `docker compose down/up` cycles; second `up` does not trigger ACME re-issuance | ? UNCERTAIN (static layer ✓) | compose `caddy` service mounts `caddy_data:/data` + `caddy_config:/config`; top-level volumes block declares both as named volumes (no host-path bind, no `external`). Phase 26 already declared `caddy_data` (preserves operator data through Phase 26→27 transition). Live down/up cert-reuse test = Phase 30 cluster smoke. |
| 5 | `deploy/DOMAIN-SETUP.md` documents DNS A-record + port 80 reachability + propagation expectations + staging-CA toggle | ✓ VERIFIED | File exists at `deploy/DOMAIN-SETUP.md` (NOT `deploy/docs/`); 113 lines; 5 H2 sections matching D-21 (DNS A-Record / Port 80 Reachability / Propagation Expectations / Staging-CA Toggle / Common Errors); D-28 Cloudflare gray→orange addendum present; 7-row Common Errors table (9 pipe rows incl. header+divider). |

**Static-layer score:** 5/5 truths have all supporting artifacts in place and structurally correct.
**Live-layer score:** 0/3 (SC #1, #3, #4) — explicitly deferred to Phase 30 per DOMAIN-SETUP.md footer ("End-to-end smoke (Phase 30 territory — requires real DNS)") and 27-05 SUMMARY hand-off.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `deploy/Caddyfile` | Single-site reverse-proxy + auto-TLS config; global ACME options + 5 mutually-exclusive handle blocks | ✓ VERIFIED | 49 lines, tab-indented per Caddy convention. `acme_ca` with prod LE default; `email {$ACME_EMAIL}`; `admin off`; `servers { protocols h1 h2 }` (Caddy 2.11 nests `protocols` under `servers`, NOT bare global — Plan 27-01 fix #1). 5 handle blocks: `@api path /api /api/*` (D-27 defensive), `/socket.io/*`, `/avatars/*`, `/snapshots/*`, catch-all `handle { ... }`. Zero `route`, zero `header_up`, zero site-level `tls`, zero `acme_dns` (HTTP-01 only). 2× `reverse_proxy api:3003`, 2× `reverse_proxy minio:9000`, 1× `reverse_proxy web:3000`. |
| `deploy/docker-compose.yml` (caddy service + caddy_config volume) | caddy service: image caddy:2.11, ports 80+443/tcp, env DOMAIN/ACME_EMAIL/ACME_CA, volumes caddy_data + caddy_config + Caddyfile:ro, healthcheck wget --spider start_period 30s, depends_on api+web service_healthy, networks edge+internal, logging *default-logging | ✓ VERIFIED | Caddy service block at lines 259-288; image pinned to `caddy:2.11`; ports `"80:80"` + `"443:443"` only (no `/udp` — HTTP/3 disabled per D-12); env block exports DOMAIN+ACME_EMAIL (no default) + ACME_CA (`:-` default-empty); 3 volume mounts in correct order; healthcheck uses `wget --spider` (Caddy alpine-image bundles busybox wget, NOT curl); start_period 30s for ACME grace; depends_on api+web both with `condition: service_healthy` (count=2); networks include both `edge` AND `internal` (D-17 — required for minio:9000 DNS resolution); logging anchor reused. Top-level `volumes:` block declares `caddy_config:` (NEW Phase 27) preserving Phase 26's `caddy_data:`. |
| `deploy/.env.production.example` (3 new vars) | ACME_EMAIL + MINIO_PUBLIC_URL in Section 1 (Required); ACME_CA in Section 3 (Defaults) | ✓ VERIFIED | `ACME_EMAIL=` (empty, Section 1); `MINIO_PUBLIC_URL=` (empty, Section 1); `ACME_CA=` (empty, Section 3). Comment blocks reference `deploy/DOMAIN-SETUP.md` (×2) and `apps/api/src/recordings/minio.service.ts` (×1). Existing entries (DOMAIN, DB_PASSWORD, GHCR_ORG, REDIS_PASSWORD, etc.) byte-identical. |
| `deploy/DOMAIN-SETUP.md` | Operator-facing minimal-scope setup doc per DEPLOY-24 | ✓ VERIFIED | 113 lines (within D-21 60-200 range); 5 H2 sections matching D-21 names exactly; D-28 Cloudflare gray-cloud (×2 mentions) + orange-cloud (×1) addendum present; staging URL `acme-staging-v02.api.letsencrypt.org/directory` referenced; 7-row Common Errors table covers 8 research pitfalls; references all 3 env vars (ACME_EMAIL ×1, ACME_CA ×3, MINIO_PUBLIC_URL ×1); references caddy edge+internal networks (D-17); zero Thai-language strings (English-only operator doc per memory rule); NOT under `deploy/docs/`. |
| `deploy/scripts/verify-phase-27.sh` | Bash bundle for D-24 #1+#2 + structural grep guards | ✓ VERIFIED | Exists, mode 0755 (executable), `#!/usr/bin/env bash` shebang, `set -euo pipefail`. Bundles 27 `check` calls: [1/4] compose config + [2/4] caddy validate + [3/4] 12 Caddyfile greps + [4/4] 13 compose+env+DOMAIN-SETUP greps. Uses repo-relative SCRIPT_DIR/DEPLOY_DIR resolution. References all 4 Phase 27 artifacts via variable names (CADDYFILE, COMPOSE_FILE, ENV_EXAMPLE, DOMAIN_SETUP). No lab-only `curl ${DOMAIN}` or `docker compose up` commands (those live in DOMAIN-SETUP.md). No JS/package.json in `deploy/scripts/` (CLAUDE.md Deploy Folder Convention). Acme_ca regex anchor relaxed to `^[[:space:]]*` matching the precedent for admin-off/protocols (Plan 27-05 deviation #1). |
| `apps/api/src/recordings/minio.service.ts` | buildPublicUrl helper consuming MINIO_PUBLIC_URL with legacy fallback | ✓ VERIFIED | Helper at lines 121-137; consumed by `getAvatarUrl` (line 141) and `getSnapshotUrl` (line 200) — exactly 3× `buildPublicUrl` references. SDK init at lines 14-20 byte-identical (api↔minio internal SDK leg unchanged). Trailing-slash strip via `.replace(/\/+$/, '')` (1 occurrence). Both public method signatures preserved. JSDoc comment explains the `MINIO_USE_SSL` semantics gap that caused T-27-MIXED. |
| `apps/api/tests/account/minio-avatars.test.ts` | 5 URL-composition tests including mixed-content regression guard | ✓ VERIFIED | 5 new/updated test names match expected (`getAvatarUrl uses MINIO_PUBLIC_URL`, `getSnapshotUrl uses MINIO_PUBLIC_URL`, `buildPublicUrl strips trailing`, `falls back to legacy endpoint`, `falls back to MINIO_ENDPOINT`); 2× `expect(url).toMatch(/^https:` regression guards; only 1× `expect(url).toBe('http://...` (legacy-fallback dev test, NOT prod-path). Plan 27-03 SUMMARY captured 10/10 vitest pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `deploy/Caddyfile` | `deploy/docker-compose.yml` caddy service | bind-mount `./Caddyfile:/etc/caddy/Caddyfile:ro` | ✓ WIRED | Line 273 of compose: `      - ./Caddyfile:/etc/caddy/Caddyfile:ro` (read-only flag intact — T-27-CADDYFILE-RW mitigated). |
| `deploy/.env.production.example` ACME_EMAIL/ACME_CA | `deploy/Caddyfile` global block | compose env-file → caddy service environment → Caddyfile env-var substitution at load time | ✓ WIRED | `.env` declares both keys; compose caddy block exports `ACME_EMAIL: ${ACME_EMAIL}` + `ACME_CA: ${ACME_CA:-}`; Caddyfile reads `acme_ca {$ACME_CA:default}` + `email {$ACME_EMAIL}`. Three-step substitution chain intact. |
| `deploy/.env.production.example` MINIO_PUBLIC_URL | `apps/api/src/recordings/minio.service.ts` buildPublicUrl | compose env-file → api service environment → ConfigService.get('MINIO_PUBLIC_URL') | ✓ WIRED | `.env` declares `MINIO_PUBLIC_URL=`; compose api block exports `MINIO_PUBLIC_URL: ${MINIO_PUBLIC_URL:-}` (line 201 of compose); minio.service.ts line 122 reads via ConfigService. Default-empty preserves dev-loop fallback semantics. |
| `deploy/Caddyfile` `/api` + `/api/*` matcher | `api:3003` (NestJS) | reverse_proxy directive in `handle @api` block | ✓ WIRED | D-27 defensive matcher `@api path /api /api/*` covers both bare `/api` and `/api/*`. Caddy auto-sorts by matcher specificity. |
| `deploy/Caddyfile` `/socket.io/*` matcher | `api:3003` Socket.IO server | reverse_proxy with auto WebSocket Upgrade pass-through | ✓ WIRED (static); ? UNCERTAIN (live wss:// 101) | Single matcher covers all 4 namespaces (notifications, camera-status, cluster, srs-log). Caddy 2.x auto-handles Upgrade/Connection headers (D-06). Live verification = Phase 30. |
| `deploy/Caddyfile` `/avatars/*` + `/snapshots/*` | `minio:9000` (anonymous public-read) | reverse_proxy directive (no Host rewrite per D-04) | ✓ WIRED | Caddy joined to `internal` network (D-17) so DNS for `minio:9000` resolves; Phase 26 D-07 keeps minio host-port-less. |
| `deploy/Caddyfile` catch-all | `web:3000` (Next.js) | reverse_proxy in unmatched `handle { ... }` block | ✓ WIRED | Bottom of Caddyfile (line 46-48). Catches everything not matched by the 4 path-specific handles above. |
| `apps/api/src/recordings/minio.service.ts` getAvatarUrl/getSnapshotUrl | Browser `<img src>` on TLS-served pages | API JSON response field consumed by web frontend | ✓ WIRED | Both methods called internally by uploadAvatar/uploadSnapshot; `getSnapshotUrl` consumed by `apps/web/src/app/admin/cameras/components/camera-card.tsx`. With MINIO_PUBLIC_URL=https://${DOMAIN}, helper emits https-prefixed URLs (mixed-content blocker fixed). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `MinioService.buildPublicUrl` | `publicUrl` (env) → URL string | ConfigService.get('MINIO_PUBLIC_URL') with fallback to MINIO_PUBLIC_ENDPOINT/MINIO_PUBLIC_PORT/MINIO_USE_SSL | Yes — when prod env sets `MINIO_PUBLIC_URL=https://${DOMAIN}`, helper composes `https://example.com/avatars/<uid>.webp?v=<ts>`; vitest tests assert exact output for 5 cases | ✓ FLOWING |
| `Caddyfile {$ACME_CA}` substitution | `ACME_CA` env at Caddy load-time | compose env-file → caddy service env → Caddy env-var substitution | Yes — empty value falls through to prod LE URL via `{$ACME_CA:default}` syntax (verified by Plan 27-01 deviation #1: `caddy validate` exit 0 with prod default) | ✓ FLOWING |
| `Caddyfile {$DOMAIN}` site address | `DOMAIN` env at Caddy load-time | compose env-file → caddy service env → Caddy env-var substitution | Yes (when operator sets DOMAIN); empty DOMAIN = caddy refuses to start (documented in DOMAIN-SETUP.md Common Errors row 6 — Pitfall 7) | ✓ FLOWING |

### Behavioral Spot-Checks

Step 7b host-environment limitations: Docker daemon unresponsive on the host running this verification (Docker Desktop on macOS — same condition that ate Plan 27-05's clock time). Per environmental_constraints, treat the following as PROVEN by prior in-worktree validation:

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Caddyfile parses cleanly under caddy 2.11 | `docker run --rm -v $(pwd)/deploy/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2.11 caddy validate` | exit 0 with "Valid configuration" | ✓ PASS (per 27-01 SUMMARY; Plan 27-01 deviation #1 fix verified by executor) |
| Compose syntactically valid + env interpolation | `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config --quiet` | exit 0 (after Plan 27-04 added missing env vars; Plan 27-02's expected ACME_EMAIL warning closed) | ✓ PASS (per 27-02 + 27-04 SUMMARYs) |
| MinioService URL-composition tests | `pnpm --filter @sms-platform/api test -- minio-avatars` | 10/10 vitest pass (5 existing + 5 new) | ✓ PASS (per 27-03 SUMMARY; 2 mixed-content regression guards present) |
| Compose resolves MINIO_PUBLIC_URL into api service env | `docker compose ... config | awk api-block | grep MINIO_PUBLIC_URL` | line emitted in resolved api service env block | ✓ PASS (per 27-04 SUMMARY) |
| verify-phase-27.sh structural-grep tier | inline grep equivalent of `[3/4]` + `[4/4]` of the script | 22-25/22-25 PASS in agent's manual fallback run; orchestrator confirmed 22/22 in main repo | ✓ PASS (per 27-05 SUMMARY) |
| verify-phase-27.sh full bundle (incl. [1/4] compose + [2/4] caddy validate) | `bash deploy/scripts/verify-phase-27.sh` on healthy Docker host | exit 0 with "All N static checks passed." | ? SKIP (host Docker unresponsive — routed to Phase 30 clean Linux VM in human_verification) |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| DEPLOY-06 | 27-01, 27-02, 27-04 | Caddy 2.11.x service auto-provisions Let's Encrypt cert for operator-set ${DOMAIN} on first boot; HTTP→HTTPS redirect enabled | ✓ SATISFIED (static); ? NEEDS HUMAN (live cert) | Caddyfile global ACME block + image pin caddy:2.11 + Caddy auto-HTTPS for real-hostname site (D-08); compose exposes :80+:443. Live Let's Encrypt issuance = Phase 30. |
| DEPLOY-07 | 27-01, 27-03, 27-04 | Caddy routes `/api/*` and `/socket.io/*` to api:3003; default to web:3000 (same-origin) | ✓ SATISFIED | Caddyfile has @api defensive matcher + /socket.io/* + catch-all to web:3000 (D-05 + D-27); MinioService MINIO_PUBLIC_URL fix closes T-27-MIXED so /avatars/* + /snapshots/* same-origin path works (D-26). |
| DEPLOY-08 | 27-01 | Caddy WebSocket pass-through end-to-end for NotificationsGateway + StatusGateway | ✓ SATISFIED (static); ? NEEDS HUMAN (live wss:// 101) | Caddy 2.x auto-pass via reverse_proxy (D-06); single /socket.io/* matcher covers all 4 namespaces (D-07). Live wss:// 101 + actual gateway events = Phase 30. |
| DEPLOY-09 | 27-02 | caddy_data + caddy_config named volumes persist certs across container restarts | ✓ SATISFIED (static); ? NEEDS HUMAN (live persistence) | Both volumes declared in compose top-level volumes block; mounted into caddy service. Live down/up cert-reuse test = Phase 30. |
| DEPLOY-24 | 27-05 | deploy/DOMAIN-SETUP.md documents DNS + port 80 + propagation + staging-CA toggle | ✓ SATISFIED | 113-line doc with 5 H2 sections, D-28 Cloudflare addendum, 7-row Common Errors table. References all 3 env vars + edge+internal networks. |

**Cross-reference against REQUIREMENTS.md (Phase 27 = 5 IDs):** DEPLOY-06, DEPLOY-07, DEPLOY-08, DEPLOY-09, DEPLOY-24 — all 5 declared in plans, all 5 SATISFIED at static layer (3 of 5 also need live-cluster verification routed to Phase 30). No orphaned requirement IDs (REQUIREMENTS.md table lists exactly the 5 plans claim).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none in Phase 27 artifacts) | — | — | — | — |

Anti-pattern scan covered the 7 modified/created files (Caddyfile, docker-compose.yml caddy block, .env.production.example, DOMAIN-SETUP.md, verify-phase-27.sh, minio.service.ts buildPublicUrl + 2 call sites, minio-avatars.test.ts). No TODO/FIXME/PLACEHOLDER markers, no `return null` / empty stub returns, no `=> {}` empty handlers, no console.log-only implementations, no unguarded empty-array initializations, no Thai-string contamination in deploy/.

Caddyfile-specific anti-pattern check (per Plan 27-01 D-06 / Research §Anti-Patterns):
- ✓ NO `route` directive (would break handle-block mutual exclusivity)
- ✓ NO `header_up` rules (Caddy 2.x WebSocket auto-pass; manual headers are anti-pattern)
- ✓ NO site-level `tls` directive (auto-HTTPS handles cert from real-hostname address per D-08)
- ✓ NO `acme_dns` directive (Phase 27 uses HTTP-01, not DNS-01)
- ✓ NO `443:443/udp` port mapping (HTTP/3 deliberately disabled per D-12)
- ✓ NO `2019` admin port mapping (Caddy admin disabled at config + network layers — T-27-ADMIN-API mitigated twice)

### Human Verification Required

Three live-cluster smoke checks are explicitly out-of-scope for Phase 27 verification (DOMAIN-SETUP.md footer + Plan 27-05 SUMMARY both flag them as Phase 30 territory) plus one re-run of the static verifier on a healthy Docker host:

1. **Live Let's Encrypt cert issuance on real DNS** — Roadmap SC #1
   - **Test:** Set `DOMAIN=<test-host>` in `deploy/.env`, point `<test-host>` A-record at the deploy server, ensure inbound TCP/80 is open, run `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d`. Watch `docker compose logs caddy --since 60s` for `certificate obtained successfully` line, then `curl -kIL http://<test-host>` should return HTTP/1.1 308 Permanent Redirect → `https://<test-host>`, and `https://<test-host>` should load the Next.js home page.
   - **Expected:** Cert issued within 60s of first boot; HTTP→HTTPS 308 redirect active; cert issuer = `R10` or `R11` (Let's Encrypt prod), NOT `Fake LE` (staging).
   - **Why human:** Requires public DNS + port 80 reachability + real Let's Encrypt servers; cannot be verified statically.

2. **Live wss:// upgrade to NotificationsGateway + StatusGateway** — Roadmap SC #3
   - **Test:** With the cert from #1 in place, run `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" -H "Sec-WebSocket-Version: 13" "https://<test-host>/socket.io/?EIO=4&transport=websocket"` and expect `HTTP/1.1 101 Switching Protocols`. Then log into the deployed app, trigger a camera status change, and confirm a real-time event reaches the dashboard via NotificationsGateway + StatusGateway.
   - **Expected:** 101 upgrade succeeds; both gateways receive events end-to-end.
   - **Why human:** Requires running stack with valid TLS cert + Socket.IO client + actual user interaction.

3. **Cert persistence across docker compose down/up** — Roadmap SC #4
   - **Test:** After #1 produces a valid cert, run `docker compose down && docker compose up -d`, then `docker compose logs caddy --since 60s | grep -c 'certificate obtained'`. Expected count: 0 (cert reused from `caddy_data` volume).
   - **Expected:** Second boot does NOT trigger ACME re-issuance.
   - **Why human:** Requires complete down/up cycle on a host where the cert was actually issued — the volume must contain real ACME state.

4. **Re-run `bash deploy/scripts/verify-phase-27.sh` on a healthy Docker host**
   - **Test:** On a host with a responsive Docker daemon (Phase 30 clean Linux VM, or an already-deployed staging server), run `bash deploy/scripts/verify-phase-27.sh` from the repo root.
   - **Expected:** Exit 0; output ends with "All N static checks passed."; checkpoints [1/4] (compose config) and [2/4] (caddy validate) both PASS in addition to the 25 structural greps.
   - **Why human:** Host Docker daemon was unresponsive during Plan 27-05 execution + this orchestrator verification window. Plan 27-05 SUMMARY captured the structural-grep tier (22-25/22-25 PASS) via manual fallback and the [1/4] compose-config check via partial run before daemon hang. The full bundle should be re-confirmed on Phase 30 clean VM.

### Gaps Summary

**No blocking gaps.** Every Phase 27 must-have is structurally in place and wired correctly:
- All 5 success criteria have their supporting artifacts in the codebase
- All 7 artifacts pass Levels 1-4 (exists, substantive, wired, data flowing)
- All 8 key links verified intact (file mounts, env-var substitution chains, reverse_proxy directives)
- All 5 requirement IDs (DEPLOY-06/07/08/09/24) accounted for and SATISFIED at the static layer
- Zero anti-patterns detected
- Zero orphaned requirements

The only items keeping this report out of `passed` status are 3 live-cluster smoke checks (LE cert issuance, wss:// 101 upgrade, cert persistence) that are explicitly scoped to Phase 30 ("v1.3 GA Clean-VM Smoke") in DOMAIN-SETUP.md footer + Plan 27-05 SUMMARY, plus one re-run of `verify-phase-27.sh` on a host with a healthy Docker daemon.

**Phase 27's static-deliverable surface is closed.** Phase 28 (CI/CD), Phase 29 (operator UX scripts), and Phase 30 (clean-VM smoke) can all proceed without unblocking work in Phase 27.

---

*Verified: 2026-04-28T08:30:00Z*
*Verifier: Claude (gsd-verifier)*
