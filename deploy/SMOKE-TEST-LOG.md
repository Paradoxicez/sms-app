# SMS Platform — Phase 30 Smoke Test Log

**Status:** RUN COMPLETE — see GA verdict at the bottom.
**Phase:** 30 (Smoke Test on Clean VM — v1.3 GA gate)
**SC mapping:** ROADMAP.md §Phase 30 lines 196-205

> **Redaction notice (D-11):** This file is committed to the repo. Operator-private values (ADMIN_PASSWORD, RTSP credentials, ACME order IDs) have been stripped. VM_IP retained because it is already public (DNS A-record).

## Run metadata

| Field | Value |
|-------|-------|
| Run UTC start | 2026-04-29T05:30Z |
| VM hostname | icex |
| VM specs | 4 vCPU / 8 GB RAM / 80 GB disk (Hetzner) |
| OS | Ubuntu 22.04 LTS / Linux 6.x |
| Docker version | docker engine 27.x |
| Compose plugin | docker compose v2.x |
| Domain | stream.magichouse.in.th |
| ACME run | production (acme-v02.api.letsencrypt.org/directory) — first attempt locked out by ACME_CA env var bug; cert issued cleanly after compose fix |
| IMAGE_TAG | latest (built from `main` HEAD across the run) |
| Operator | ice (sura.bs007@gmail.com) |
| VM public IP | 103.253.75.152 |

## Success Criteria results (hard gate per D-12 except SC#4 = soft)

| SC | Description | Verifier | Result | Evidence | Duration |
|----|-------------|----------|--------|----------|----------|
| #1 | Cold deploy <10 min wall-clock from `bootstrap.sh` to logged-in super-admin session | bootstrap.sh + manual login | **PASS** | bootstrap ELAPSED=161s, super-admin login confirmed via DevTools cookie + dashboard load | 161s |
| #2 | E2E playback + WebSocket on deployed VM (RTSP→HLS→browser) | manual UI + SRS API + curl | **PASS** | 7 cameras LIVE in UI; SRS `/api/v1/streams/` shows recv_30s ≈ 1900-2000 kbps each + send_30s=490 kbps on viewed camera; curl-fetched .ts segment returned 454 KB video/MP2T | n/a |
| #3 | nmap port lockdown — only allowed ports open externally | verify-nmap.sh + sudo nmap UDP follow-up | **PASS-WITH-DRIFT** | TCP 10/10 perfect (5 allowed open + 5 must-be-closed verified). UDP 8000/10080 closed (port-unreach) — see Drift | ~5s |
| #4 | Drift log captured (soft gate) | this section | **DRIFT** | 16 drift entries below | n/a |

**Note on SC#3:** TCP lockdown — the security-critical gate — passed clean. UDP closures are a misconfiguration of optional protocols (WebRTC + SRT), not a security regression. Logged as drift, deferred to v1.3.x.

## Deferred UAT cross-reference (D-13 mapping)

| UAT origin | Description | Folded into | SC owner | Result | Evidence |
|-----------|-------------|-------------|----------|--------|----------|
| Phase 27 SC#1 | Live LE cert + 308 redirect on real DNS | manual curl | SC#1 | **PASS** | `curl -i https://stream.magichouse.in.th/api/health` → 200; `http://...` → 308 redirect; cert issuer `acme-v02.api.letsencrypt.org-directory` |
| Phase 27 SC#2 | Live wss:// upgrade through Caddy | DevTools observation | SC#2 | **PASS** | NotificationsGateway + StatusGateway sockets observed exchanging frames in DevTools Network → Socket filter |
| Phase 27 SC#3 | Cert persistence across `docker compose down/up` | manual recreate | SC#1 | **PASS** | Repeated `--force-recreate caddy` did not re-issue; ACME log silent on second boot |
| Phase 27 SC#4 | verify-phase-27.sh re-run on healthy host | not run separately | SC#1 | DEFERRED | Subsumed by live LE cert evidence above |
| Phase 29 SC#1 | Cold deploy <10-min wall-clock claim | bootstrap.sh | SC#1 | **PASS** | ELAPSED=161s |
| Phase 29 SC#2 | bin/sms create-admin runtime + idempotent --force rotation | bootstrap.sh + manual login | SC#1 | **PASS** | First run created super-admin; subsequent re-runs hit "already exists" → --force fallback rotated successfully |
| Phase 29 SC#3 | update.sh atomic recycle without dropping requests | not run | SC#1 | DEFERRED | No tagged release built during smoke; defer to first real v1.3.1 patch |
| Phase 29 SC#4 | backup.sh + restore.sh byte-equivalent round-trip | not run | SC#4 | DEFERRED | Defer to first ops cycle once real tenant data exists |
| Phase 29 SC#5 | README quickstart end-to-end | operator self-report | SC#1 | **DRIFT** | Operator hit 16 missing-config / wrong-env-var errors not documented in README; see Drift below |

## Manual UI checklist (D-14)

- [x] 1. Login as super-admin → confirm session cookie + redirect to dashboard. **PASS** (`__Secure-better-auth...` cookie set; redirected to `/admin/organizations`).
- [x] 2. Register test camera (RTSP URL) — UI shows status `connecting → live`. **PASS** (7 cameras imported via bulk-import, all LIVE).
- [x] 3. Click camera card → play HLS player → confirm video playback. **PASS** (verified BKR07 — `send_30s=490 kbps` confirms segments delivered to browser).
- [ ] 4. Toggle Record → wait 60s → toggle off. **NOT RUN** (deferred — recording flow exercise queued for next session).
- [x] 5. DevTools WebSocket frame inspection during status change. **PASS** (StatusGateway frames observed during reconnect cycles).
- [ ] 6. Stop external RTSP feed → confirm UI status `live → offline` within <30s. **NOT RUN** (deferred — depends on physical camera access).
- [x] 7. README.md follow-along — drift captured. **DRIFT** (see Drift section).

## Drift (D-16)

The single biggest finding from this smoke run: **Phase 24-29 verifiers checked static contracts (file exists, bash -n passes, compose config valid) but never executed the runtime end-to-end.** Sixteen distinct configuration / wiring bugs were latent in the green builds. Each is fixed in a focused commit on `main`; no inline-during-smoke patches remain.

| # | Discovery | Fix commit | Phase owner | Action |
|---|-----------|------------|-------------|--------|
| 1 | `verify-deploy.sh` regex `'rotated|success|created'` missed `'Updated password'` from create-admin --force | `6f7b323` | Phase 30 (DEPLOY-25) | fixed inline |
| 2 | `bootstrap.sh` ran `sms-migrate` before `create-admin` → seed no-op'd on empty org table → no default StreamProfile | `6f7b323` | Phase 26 (DEPLOY-16) | fixed inline |
| 3 | All 9 deploy scripts set `IFS=$'\n\t'` then used `${DC}` unquoted → bash treated whole string as one token → `No such file or directory` on first compose call | `1f0821a` | Phase 24-29 (DEPLOY-13 wiring) | fixed inline |
| 4 | api Dockerfile `prod-deps` stage installed with `--ignore-scripts`, skipping `@prisma/engines` postinstall → schema-engine missing in runtime image → `prisma migrate deploy` tried to download from `binaries.prisma.sh` → DNS-fail on internal-only network | `5683572` | Phase 25 (DEPLOY-01) | fixed inline |
| 5 | `bootstrap.sh` used `compose up -d --wait sms-migrate`; --wait expects RUNNING/HEALTHY but sms-migrate exits 0 → false-fail → bootstrap aborted | `8a31651` | Phase 29 (DEPLOY-18) | fixed inline |
| 6 | compose passed `REDIS_URL` only; api source reads `REDIS_HOST` + `REDIS_PORT` → fell back to localhost → ECONNREFUSED on api boot | `243170b` | Phase 26 (DEPLOY-13) | fixed inline |
| 7 | SRS `srs.conf` hard-coded `host.docker.internal` for all 7 callbacks → DNS unresolvable on Linux Docker Engine → SRS rejected publish → FFmpeg got "Input/output error" | `0479298` | Phase 26 (DEPLOY-13) | fixed inline |
| 8 | 7 web client components had `process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003"` → baked dev URL into prod bundle → browser fetched localhost → ERR_CONNECTION_REFUSED | `15220c4` | Phase 25 (DEPLOY-02) | fixed inline |
| 9 | compose did not pass `SRS_HOST` → ffmpeg pushed to `rtmp://localhost:1935` → Connection refused | `42221f0` | Phase 26 (DEPLOY-13) | fixed inline |
| 10 | seed default StreamProfile had `audioCodec='aac'` → FFmpeg failed on video-only RTSP cameras with "Codec AVOption b ... has not been used for any stream" | `fd7597e` | Phase 26 (DEPLOY-16) | fixed inline + DB UPDATE on VM |
| 11 | compose passed `SRS_HTTP_API_URL` but api reads `SRS_API_URL` → CameraHealthService probe always returned 0 streams → killed every FFmpeg every 60s in tight loop | `4c06985` | Phase 26 (DEPLOY-13) | fixed inline |
| 12 | api preview HLS proxy reads `SRS_HTTP_URL` (8080); compose passed nothing → 502 "Stream engine unavailable" → black player | `41e71da` | Phase 26 (DEPLOY-13) | fixed inline |
| 13 | compose did not pass `SRS_PUBLIC_HOST` → bulk-import push URLs CSV showed `rtmp://localhost:1935/...` → useless to operators | `99f67ac` | Phase 26 (DEPLOY-13) | fixed inline |
| 14 | playback.service returned `http://srs:8080/...` (compose service name) in API session response → embed page browser couldn't reach internal hostname → "Stream offline" | `486300b` | Phase 17 / Phase 27 | fixed inline (compose `PUBLIC_HLS_BASE_URL` + Caddy `/srs-hls/*` + source `playback.service`) |
| 15 | Caddyfile lacked `/live/*` route — SRS master playlist redirects to absolute `/live/...` for inner playlist + .ts segments → fell through to web:3000 → 404 | `75dda0a` | Phase 27 | fixed inline |
| 16 | Caddyfile `acme_ca {$ACME_CA:default}` parsed empty-string-set as missing-default → directive crash; compose passed `ACME_CA: ${ACME_CA:-}` → empty → Caddy refused to start | `be1ef1b` | Phase 27 | fixed inline (compose default LE prod URL) |
| 17 | NestJS Throttler global limit 100/min for production was too tight for a real tenant — 7 cameras polling + Socket.IO heartbeats + dashboard fetches saturated the quota → sign-in 429 ThrottlerException | `d74b9a4` | Phase 1 / Phase 23 | fixed inline (raise to 600/min) |
| 18 | Three debug `console.log` calls leaked sensitive data: sign-in result (token + user payload to browser console), Better Auth invitation stub (token URL to api logs), prisma seed (admin password to dev logs) | `4af9fb7` | Phase 1 / Phase 9 | fixed inline |
| 19 | UDP 8000 (WebRTC) + UDP 10080 (SRT) closed externally despite compose `ports:` mapping (`port-unreach` ICMP from VM). SRS process likely not binding listeners or cloud-provider UDP firewall blocking. | not yet investigated | Phase 26 (DEPLOY-11) | DEFER to v1.3.x — RTMP-only deploy is sufficient for current tenant; investigate before WebRTC/SRT enablement |
| 20 | Public DNS for `.in.th` zone took longer than expected to propagate; first deploy attempt used `.co.th` (typo) and burned ~30 min before re-pointing. README does not warn that DNS must resolve from PUBLIC resolvers (8.8.8.8) before LE will issue. | docs only — queue v1.3.1 README update | Phase 27 (DEPLOY-24) | DEFER to v1.3.1 |

`.planning/todos/v1.3.1-drift-from-phase-30.md` should be created with rows #19 + #20 (the two deferred items). Rows #1-#18 are already on `main`.

## Timing log

```
2026-04-29T05:30Z  bootstrap.sh first attempt — failed at sms-migrate (Drift #4)
2026-04-29T05:45Z  Dockerfile prisma engines fix landed; rebuilt image; re-run bootstrap
2026-04-29T06:00Z  bootstrap.sh succeeded — ELAPSED=161s (after Drift #5 fix)
2026-04-29T06:15Z  HTTPS reachable — LE cert obtained successfully (acme-v02 prod CA)
2026-04-29T06:25Z  super-admin login verified
2026-04-29T07:00Z  cameras imported via bulk-import (3 push, 2 pull); discovered 7 distinct env-var name mismatches (Drift #6, 9, 11, 12, 13)
2026-04-29T08:30Z  all 7 cameras LIVE; HLS playback chain end-to-end verified via curl
2026-04-29T08:45Z  embed page playback verified after Caddy /live/* + PUBLIC_HLS_BASE_URL fixes
2026-04-29T10:00Z  external nmap from operator laptop — TCP all-pass, UDP scan inconclusive without sudo
2026-04-29T12:07Z  sudo nmap UDP confirmed 8000+10080 closed (port-unreach); logged as Drift #19
2026-04-29T12:15Z  drift log written; this file committed
```

## GA verdict

**Verdict:** **GA APPROVED WITH DRIFT**

Hard gates (SC#1 + SC#2 + SC#3 TCP layer) all **PASS**. SC#3 UDP gap and SC#4 drift are documented and deferred to v1.3.x — neither blocks the production claim of "operators can run a working RTMP/HLS deploy from a clean Linux VM in under 10 minutes."

**Conditions on the GA approval:**

1. The 18 inline fixes already on `main` SHALL ship in the v1.3.0 image. (Done — every commit pushed during this run is on `main` HEAD.)
2. Drift entries #19 and #20 SHALL be tracked in `.planning/todos/v1.3.1-drift-from-phase-30.md` before milestone close.
3. Recording flow (D-14 step 4) and offline-detection demo (D-14 step 6) SHALL be exercised before tagging v1.3.1, even though they did not block this smoke.

**Drift backlog file:** `.planning/todos/v1.3.1-drift-from-phase-30.md` (to be authored).

---

*Operator-filled log overwriting the Phase 30 Plan 01 template.*
