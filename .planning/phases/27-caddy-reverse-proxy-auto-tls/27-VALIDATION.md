---
phase: 27
slug: caddy-reverse-proxy-auto-tls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | shell + docker compose (no JS test framework — infrastructure phase) |
| **Config file** | `deploy/docker-compose.yml`, `deploy/Caddyfile` |
| **Quick run command** | `docker compose -f deploy/docker-compose.yml --env-file deploy/.env config --quiet` |
| **Full suite command** | `bash deploy/scripts/verify-phase-27.sh` (or inline `docker compose up -d caddy && curl -kIL http://${DOMAIN}` chain — script optional) |
| **Estimated runtime** | quick: ~2s · full (including ACME staging issuance): ~60s |

---

## Sampling Rate

- **After every task commit:** Run quick command (compose validate) — must exit 0.
- **After every plan wave:** Run Caddyfile validate `docker run --rm -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.11 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` — must exit 0.
- **Before `/gsd-verify-work`:** Full suite green AND lab smoke (D-24 checkpoints 3-6) green on a real DNS-pointed test domain.
- **Max feedback latency:** 60 seconds (excluding initial ACME issuance).

---

## Per-Task Verification Map

> Filled by planner. Each PLAN task gets a row tying its deliverable to a requirement, the Caddy/MinIO behavior under test, and the exact command that proves the task done. Skeleton entries below — planner must populate `Task ID` and `File Exists` columns based on actual plan slugs.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-XX-01 | caddyfile | 1 | DEPLOY-06 | — | Caddyfile validates with adapter; site block parses | infra | `docker run --rm -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.11 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` | ❌ W0 | ⬜ pending |
| 27-XX-02 | compose-patch | 1 | DEPLOY-09 | — | compose includes caddy service + caddy_data + caddy_config; references resolve | infra | `docker compose -f deploy/docker-compose.yml --env-file deploy/.env config \| grep -E "caddy_data\|caddy_config\|image: caddy:2.11"` | ❌ W0 | ⬜ pending |
| 27-XX-03 | mixed-content | 1 | DEPLOY-07 (D-26) | T-27-MIXED | Avatar/snapshot URLs emit `https://${DOMAIN}/...` (no `http:` scheme on TLS pages) | unit | `pnpm --filter @sms-platform/api test -- minio.service` (or grep-based fallback if no test exists: `grep -E "https?://" apps/api/src/recordings/minio.service.ts \| grep -v "http://"` returns 0 hits in URL builders) | ❌ W0 | ⬜ pending |
| 27-XX-04 | env-example | 1 | DEPLOY-22 | — | `.env.production.example` contains ACME_EMAIL + ACME_CA in correct sections | infra | `grep -E "^ACME_EMAIL=\|^ACME_CA=" deploy/.env.production.example \| wc -l` returns 2 | ❌ W0 | ⬜ pending |
| 27-XX-05 | domain-setup-doc | 2 | DEPLOY-24 | — | `deploy/DOMAIN-SETUP.md` exists with 5 sections (DNS, port-80, propagation, staging, errors) + Cloudflare gray-cloud + re-enable note | docs | `grep -cE "^## " deploy/DOMAIN-SETUP.md` ≥ 5 AND `grep -i "cloudflare" deploy/DOMAIN-SETUP.md` returns ≥ 1 hit | ❌ W0 | ⬜ pending |
| 27-XX-06 | smoke-acme | 2 | DEPLOY-06 SC#1 | — | Caddy issues real cert in lab within 60s of `up -d` | manual | `docker compose logs caddy --since 60s \| grep -i "certificate obtained successfully"` | ❌ W0 | ⬜ pending |
| 27-XX-07 | smoke-redirect | 2 | DEPLOY-06 SC#1 | — | HTTP→HTTPS 308 redirect | smoke | `curl -kIL "http://${DOMAIN}" \| grep -E "HTTP/.+ 308\|location: https://"` | ❌ W0 | ⬜ pending |
| 27-XX-08 | smoke-wss | 2 | DEPLOY-08 SC#3 | — | Socket.IO upgrade returns 101 via Caddy | smoke | `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" -H "Sec-WebSocket-Version: 13" "https://${DOMAIN}/socket.io/?EIO=4&transport=websocket" 2>&1 \| grep "101 Switching"` | ❌ W0 | ⬜ pending |
| 27-XX-09 | persist-restart | 2 | DEPLOY-09 SC#4 | — | `down && up -d` does not re-issue cert | smoke | `docker compose down && docker compose up -d && sleep 30 && [ "$(docker compose logs caddy --since 60s \| grep -c 'certificate obtained')" -eq 0 ]` | ❌ W0 | ⬜ pending |
| 27-XX-10 | smoke-staging | 2 | DEPLOY-06 SC#2 | — | Staging-CA toggle produces "Fake LE" issuer | smoke | `ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory docker compose up -d caddy && sleep 30 && curl -skv "https://${DOMAIN}" 2>&1 \| grep -i "fake"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] No new test framework — infrastructure phase relies on shell + docker tooling.
- [ ] (Optional) `apps/api/src/recordings/minio.service.spec.ts` — extend if not present, to cover D-26 URL-emitter scheme assertion (planner decides; if api test file already covers `getAvatarUrl`/`getSnapshotUrl`, just add an https-scheme assertion).
- [ ] (Optional) `deploy/scripts/verify-phase-27.sh` — bash wrapper bundling smoke checks #6-10 above into one command for `/gsd-verify-work`. If skipped, list each curl/grep manually in the plan's `<verification>` block.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Let's Encrypt cert issuance against a public DNS A-record | DEPLOY-06 SC#1 | Requires public DNS, port 80 reachability, real ACME — cannot run in CI sandbox | Operator: point a test domain at lab host, set DOMAIN+ACME_EMAIL, `docker compose up -d`, observe `certificate obtained` log within 60s, browser reaches `https://${DOMAIN}` with valid cert |
| WSS round-trip with NotificationsGateway/StatusGateway events | DEPLOY-08 SC#3 | Requires logged-in session + camera state change to emit gateway events — beyond a single curl | Operator: log into deployed app, trigger a camera offline/online (or any notification-emitting action), observe notification arrives in the UI within 5s; record screen capture or paste log line `wss connected` from devtools Network tab |
| ACME persistence across container lifecycle | DEPLOY-09 SC#4 | Requires real cert state from a prior issuance — not reproducible in fresh CI | Operator: after first successful issuance, `docker compose down && docker compose up -d`; tail caddy logs for 60s; assert no `certificate obtained` line; assert browser still loads `https://${DOMAIN}` with same cert serial |
| Cloudflare orange-cloud re-enable workflow | D-28 (DEPLOY-24) | Requires a Cloudflare account + DNS provider switch — operator-side only | Operator: after first cert issuance, flip Cloudflare proxy from gray to orange; reload `https://${DOMAIN}`; assert page loads (cert still valid behind Cloudflare); document outcome in DOMAIN-SETUP.md if any quirk surfaces |

---

## Validation Sign-Off

- [ ] All tasks have automated verify command OR Wave-0 manual-only entry
- [ ] Sampling continuity: every task has either compose-validate, caddy-validate, or shell smoke check
- [ ] Wave 0 entries cover any framework gaps (currently none — shell + docker only)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (excluding initial ACME)
- [ ] `nyquist_compliant: true` set in frontmatter (after planner fills Task IDs)

**Approval:** pending
