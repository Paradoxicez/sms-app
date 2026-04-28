# Phase 30: Smoke Test on Clean VM (GA gate) - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

ขับ live smoke-test รอบเดียวบน fresh Linux VM ที่ provisioned ใหม่ (BYO operator-owned, Docker pre-installed) → ตั้ง DNS subdomain → fill `deploy/.env` → run `bash deploy/scripts/bootstrap.sh` → ภายใน 10 นาทีต้อง login ได้ที่ `https://smoke.<your-domain>` → register test camera (RTSP) → toggle Record 60s → confirm MinIO archive → observe WebSocket frame ใน DevTools → external `nmap` พิสูจน์ port lockdown → drift log captured. Phase 30 เป็น v1.3 GA gate — milestone ship ได้เฉพาะหลัง phase นี้ผ่าน.

**Delivers:**
- `deploy/scripts/smoke-test.sh` — sequential wrapper รัน 4 verify-*.sh + roll-up exit code + log redirect
- `deploy/scripts/verify-deploy.sh` — automated checks: pre-flight + bootstrap timing + HTTPS reachability + cert persistence (Phase 27 SC#1/#3/#4 + Phase 29 SC#1/#2/#3) + verify-phase-27.sh re-run
- `deploy/scripts/verify-playback.sh` — automated: wss 101 upgrade probe + HLS segment fetch + MinIO recording archive ls (Phase 27 SC#2 + Phase 29 SC#5 partial)
- `deploy/scripts/verify-backup.sh` — backup/restore round-trip: SELECT counts + MinIO bucket diff + cert preservation (Phase 29 SC#4)
- `deploy/scripts/verify-nmap.sh` — nmap TCP+UDP scan + assert allowed ports OPEN, blocked ports CLOSED (DEPLOY-26)
- `deploy/SMOKE-TEST-LOG.md` — populated artifact (per-SC table + drift section + UAT cross-reference)
- `.planning/phases/30-smoke-test-on-clean-vm-ga-gate/30-VERIFICATION.md` — GSD-side phase verification record

**Out of scope (belongs to other phases or future milestones):**
- Headless puppeteer/playwright UI automation — manual checklist เพียงพอ (D-04)
- Two-VM staging/production separation — single VM with `down -v` reset เพียงพอ (D-06)
- Cloud-side nmap from second throwaway VM — local nmap เพียงพอ ตรง 'external machine' intent (D-15)
- Dedicated `verify-uat-bundle.sh` — 9 deferred UAT folded into 4 verify-*.sh per SC mapping (D-13)
- sslip.io / nip.io throwaway domain — operator มี owned subdomain (D-05)
- Recorded video walkthrough for <10-min claim — bootstrap.sh ELAPSED log + SMOKE-TEST-LOG.md เพียงพอ (Phase 29 D-26)
- Multi-region VM matrix testing — single BYO VM
- Vanilla-Ubuntu-no-Docker timing measurement — Docker pre-installed locked (D-02)
- Phase 23 UAT #2 (visual smoke `/app/recordings/[id]` tags+description) — dev-stack scope ไม่ใช่ fresh-VM smoke
- Phase 23 UAT #3 (GitHub branch protection via gh repo create) — orthogonal infra task
- Drift remediation — drift logged เป็น input ของ v1.3.1 patch backlog, ไม่ fix ใน Phase 30
- Backup encryption (GPG/age) — operator concern post-archive
- Performance/load testing — smoke = functional only

</domain>

<decisions>
## Implementation Decisions

### VM provisioning (DEPLOY-25 prerequisite)

- **D-01:** **BYO local-lab VM**. Operator มี fresh Ubuntu 22.04 LTS VM อยู่แล้ว (Proxmox/Hyper-V/cloud หรือ on-prem) — Phase 30 ไม่ provision droplet ใหม่. Spec ตรง ROADMAP: ≥4GB RAM, ≥40GB disk, public IPv4 reachable, port 80 + 443 reachable from Internet (ACME HTTP-01 challenge). DigitalOcean/Hetzner option ใน ROADMAP language ยังคงเป็น valid path สำหรับ operators ที่ไม่มี own VM — Phase 30 documents BYO as primary path.

- **D-02:** **Docker pre-installed**. VM ต้องมี Docker Engine 26+ + `docker compose` plugin ติดอยู่แล้ว ก่อน smoke run. Smoke `<10-min wall-clock` (SC#1) นับจาก `git clone` → `bootstrap.sh exit 0`, ไม่นับ Docker install. ROADMAP language ('Docker pre-installed') ตรงข้อนี้. Vanilla-Ubuntu+manual-install path (DEPLOY-29 doctor pre-flight) defer v1.4.

- **D-03:** **VM specifics (ชื่อ host / region / public IP) lock ตอน execution** — ไม่บันทึกใน CONTEXT.md (sensitive infra). bootstrap.sh self-reports ELAPSED ที่ vm hostname; SMOKE-TEST-LOG.md capture ตอน run.

### Domain + ACME strategy (Phase 27 hand-off)

- **D-04:** **Owned subdomain**. Operator มี registered domain + DNS provider access. ใช้ subdomain `smoke.<your-domain>` (หรือ pattern equivalent ที่ operator เลือก) — ไม่ใช้ throwaway sslip.io. ตอน execution: A-record `smoke.<your-domain> → <vm-public-ip>`, propagation verify ด้วย `dig +short A smoke.<your-domain>` ก่อนเริ่ม bootstrap. `${DOMAIN}` ใน `deploy/.env` = `smoke.<your-domain>`. `${ACME_EMAIL}` = operator-supplied valid email (LE notification).

- **D-05:** **ACME staging-first dry-run, then production CA**. Run #1 = `ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory` (untrusted cert, unlimited rate). Run #1 validates SC#1-SC#4 + 9 deferred UAT items end-to-end. ถ้า Run #1 PASS → tear down + switch CA + Run #2. ถ้า Run #1 FAIL → fix + re-run staging (ไม่กิน LE production rate-limit 5 fail/hr/host).

- **D-06:** **Single VM, staging → `down -v` → production**. หลัง staging Run #1 PASS:
  ```bash
  cd /path/to/sms-app
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env down -v
  # caddy_data ถูกลบ → staging account/cert state ทิ้ง
  # Edit deploy/.env: comment ACME_CA (= production default)
  bash deploy/scripts/smoke-test.sh
  ```
  Run #2 = production CA fresh-state — ตรง ROADMAP fresh-VM repeatability intent (single command path, idempotent re-bootstrap). ไม่ใช้ in-place cert swap (Phase 27 D-09 documents `caddy_data` carries account state — file-edit approach hacky กว่า).

### RTSP camera source (SC#2 playback)

- **D-07:** **MediaMTX demo public RTSP stream เป็น primary**. URL = mediamtx demo feeds (rtsp://rtspstream:zdgfp@zephyr.rtsp.stream/movie หรือ equivalent active feed ตอน execution). มี multi-codec (H.264/H.265). Operator confirm reachability จาก smoke VM ก่อน register: `ffprobe -v error -i rtsp://...`. ถ้า primary down → fallback เป็น Wowza demo (rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mov, H.264 VOD low-bitrate, ไม่มี audio). Document ทั้งสอง URL ใน SMOKE-TEST-LOG drift section ถ้า fallback ใช้.

- **D-08:** **60-second recording duration + manual DevTools WebSocket frame check**.
  - **Recording flow:** ใน app UI → register camera (RTSP URL จาก D-07) → wait camera transitions LIVE (status pill) → click Record toggle → wait 60s wall-clock → click stop → confirm `mc ls local/recordings/<orgId>/<cameraId>/` มี `.ts` segment + manifest, file size > 0
  - **WebSocket flow:** เปิด Chrome/Firefox DevTools → Network tab → filter `socket.io` → trigger camera offline (stop external RTSP feed หรือ FFmpeg child kill) → confirm `camera.status_changed` Socket.IO frame มาภายใน <10s
  - Manual step + 1 visual screenshot ของ WebSocket frame เป็น evidence ใน SMOKE-TEST-LOG

- **D-09:** **Recording archive format = `.ts` (HLS MPEG-TS)** per Phase 23 D-03 + SRS v6 limitation (no fMP4 support; v7+ defer). verify-playback.sh + verify-backup.sh assert by extension `.ts` not `.mp4`.

### Smoke orchestration (DEPLOY-25 + DEPLOY-26 + 9 deferred UAT)

- **D-10:** **Per-SC modular verifiers**. ตาม pattern ของ `deploy/scripts/verify-phase-27.sh` (Phase 27 D-23 reference). 4 scripts + 1 wrapper:
  - `verify-deploy.sh` — pre-flight (docker info, .env exists, DOMAIN set), bootstrap timing assertion (`grep -E '^\\[bootstrap\\] Bootstrap completed in [0-9]+s$'`, assert `<= 600`), HTTPS reachability (`curl -fsS https://${DOMAIN}/api/health`), HTTP→HTTPS 308 redirect (`curl -i http://${DOMAIN}` head check), cert persistence (`docker compose down && up -d` → `docker compose logs caddy | grep -c 'certificate obtained'` ต้อง = 0 หลัง 2nd boot), verify-phase-27.sh re-run exit 0
  - `verify-playback.sh` — wss 101 upgrade probe (`curl -i -N -H 'Upgrade: websocket' wss://${DOMAIN}/socket.io/?EIO=4&transport=websocket`), HLS segment fetch (test camera ต้อง register ก่อนรัน — wrapper handles ordering), MinIO recordings ls (`mc ls local/recordings/<orgId>/<cameraId>/` ≥ 1 .ts segment, size > 0)
  - `verify-backup.sh` — populate test data (1 org + 1 camera + 1 recording จาก verify-playback) → `bash deploy/scripts/backup.sh` → archive ที่ `./backups/sms-backup-<UTC>.tar.gz` exists + `tar -tzf` มี postgres.dump + minio + caddy_data.tar.gz → SELECT counts (`SELECT COUNT(*) FROM "User"; SELECT COUNT(*) FROM "Organization"; SELECT COUNT(*) FROM "Member"; SELECT COUNT(*) FROM "Camera"; SELECT COUNT(*) FROM "Recording";`) snapshot pre-backup → `bash deploy/scripts/restore.sh <archive> --yes` → SELECT counts post-restore = pre-backup → MinIO bucket diff (`mc diff local/avatars`, `local/recordings`, `local/snapshots`) empty → `curl -fsS https://${DOMAIN}/api/health` 200 (cert preserved, ไม่ re-issue)
  - `verify-nmap.sh` — `nmap -p 22,80,443,1935,8080,5432,6379,9000,9001,1985 ${VM_IP}` + `nmap -sU -p 8000,10080 ${VM_IP}` → assert open: 22/80/443/1935/8080 (TCP), 8000/10080 (UDP) → assert closed/filtered: 5432/6379/9000/9001/1985. นกะระบุ VM_IP env ที่ operator export ก่อนรัน
  - `smoke-test.sh` — wrapper: source `deploy/.env` → call verify-deploy → verify-playback (gated on register-camera manual step) → verify-backup → verify-nmap → roll-up exit code → `tee -a deploy/SMOKE-TEST-LOG.md`

- **D-11:** **`deploy/SMOKE-TEST-LOG.md` structured per-SC table + drift section**. Top: 4-row table (SC#1/#2/#3/#4) + 9-row table (Phase 27 UAT × 4 + Phase 29 UAT × 5) — each row: Result (✅/❌/⚠️) + Evidence (path/excerpt/timestamp) + Duration (s). Middle: Drift section (bullet list, format `- <docs ref> says X, actual Y → action: <queued v1.3.1 / fixed inline / no-op>`). Bottom: chronological timing log (bootstrap ELAPSED, verify-* exit codes, total wall-clock). Single file; ไม่มี attachments — screenshot path inline เป็น `deploy/smoke-evidence/ws-frame-<ts>.png` ที่ operator เก็บใน folder ข้าง log.

- **D-12:** **Pass/fail gate: hard SC#1-#3, soft SC#4 (drift)**. SC#1 (cold deploy <10min) + SC#2 (E2E camera/playback/record/WS) + SC#3 (nmap port lockdown) — fail = v1.3 GA blocked, fix + re-smoke required (drift remediation อยู่นอก Phase 30 — เปิด phase 30.1 หรือ fold เข้า v1.3.1). SC#4 (drift log captured) — drift documented ใน SMOKE-TEST-LOG ก็พอ → queue สำหรับ v1.3.1 patch milestone, ไม่ block GA. UAT bundle (9 items) follow same hard/soft mapping per SC owner.

- **D-13:** **Fold 9 deferred UAT items into 4 verify-*.sh ตาม SC mapping**. ไม่มี separate `verify-uat-bundle.sh`. Mapping table:
  | UAT | SC owner | Folded into | Manual? |
  |-----|----------|-------------|---------|
  | Phase 27 SC#1 (LE cert + 308 redirect) | SC#1 deploy | verify-deploy.sh | No |
  | Phase 27 SC#2 (wss upgrade) | SC#2 playback | verify-playback.sh | No |
  | Phase 27 SC#3 (cert persist across down/up) | SC#1 deploy | verify-deploy.sh | No |
  | Phase 27 SC#4 (verify-phase-27.sh re-run) | SC#1 deploy | verify-deploy.sh | No |
  | Phase 29 SC#1 (cold deploy <10min) | SC#1 deploy | verify-deploy.sh | No |
  | Phase 29 SC#2 (bin/sms create-admin runtime + --force) | SC#1 deploy | verify-deploy.sh | No |
  | Phase 29 SC#3 (update.sh atomic recycle) | SC#1 deploy | verify-deploy.sh | Partial (test image needed) |
  | Phase 29 SC#4 (backup/restore byte-equivalent) | SC#4 backup | verify-backup.sh | No |
  | Phase 29 SC#5 (README quickstart end-to-end) | SC#1 deploy | smoke-test.sh wrapper + manual UI | Yes (operator self-report) |

- **D-14:** **Manual UI checklist scope** (executed alongside automated verifiers, captured ใน SMOKE-TEST-LOG):
  1. Login as super-admin (ADMIN_EMAIL/ADMIN_PASSWORD จาก .env) — confirm session cookie + redirect to dashboard
  2. Register test camera (RTSP URL จาก D-07) — confirm UI shows status `connecting → live` ภายใน 30s
  3. Click camera card → play HLS player → confirm video playback (10s observation)
  4. Toggle Record → wait 60s → toggle off (D-08)
  5. DevTools WebSocket frame inspection (D-08)
  6. Stop external RTSP feed → confirm UI status pill changes `live → offline` ภายใน <30s (Phase 15 resilience demo)
  7. README.md follow-along: operator resets memory + reads `deploy/README.md` Quickstart 1-5 ตามตัวอักษร — บันทึกว่ามีจุดไหน docs ไม่ตรง reality (drift)

- **D-15:** **nmap from operator's local machine**. ไม่ provision second cloud VM. Operator export `VM_IP=<vm-public-ip>` → `bash deploy/scripts/verify-nmap.sh` จาก laptop (macOS/Linux). UDP scan ช้า (~30-60s) — verify-nmap.sh print progress dots + warn `Note: UDP scan can take up to 60s; --reason flag enabled to distinguish open|filtered`. Single-source evidence ตรง ROADMAP 'external machine' intent.

### Documentation update at GA close

- **D-16:** **Drift remediation policy = queue, not fix-inline**. Drift discovered ระหว่าง smoke (e.g., README typo, command output mismatch, doc-vs-code gap) → log ใน SMOKE-TEST-LOG.md "Drift" section + add `.planning/todos/v1.3.1-drift-from-phase-30.md` entry. ห้าม fix ระหว่าง smoke (ทำให้ smoke run non-reproducible). v1.3.1 patch milestone consumes drift backlog หลัง GA close.

- **D-17:** **`deploy/README.md` step #5 "Login" verify operator can reach dashboard via the URL alone** — ไม่ใช้ docker compose exec / direct internal port. Strict tenant-experience parity (Caddy reverse-proxy = ground-truth surface).

### Bash + tooling conventions

- **D-18:** **All 5 new scripts inherit Phase 29 D-29 conventions**: `#!/usr/bin/env bash` + `set -euo pipefail` + `IFS=$'\\n\\t'` + tput-aware color output + stderr-only logging + exit 0/1/2. `realpath -m` resolved `SCRIPT_DIR` ที่ entry. นกะใช้ `${BASH_SOURCE[0]}` pattern. Verifier scripts callable individually (operator debugging) + composable via wrapper.

- **D-19:** **Verifier exit codes**: 0 = all assertions PASS, 1 = ≥1 hard assertion FAIL (gate-blocking per D-12), 2 = soft drift detected (logged แต่ไม่ block). wrapper `smoke-test.sh` aggregates: max(child exit codes) → propagate. `2` = SMOKE-TEST-LOG marks drift, GA still possible (per D-12).

- **D-20:** **chmod +x on commit**. ทั้ง 5 scripts ต้อง executable in source tree (`git update-index --chmod=+x deploy/scripts/{smoke-test,verify-deploy,verify-playback,verify-backup,verify-nmap}.sh`). ตรง pattern ของ Phase 27 verify-phase-27.sh + Phase 29 4 deploy scripts. ทดสอบ `ls -la deploy/scripts/*.sh` หลัง commit.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + requirements (locked)
- `.planning/ROADMAP.md` §Phase 30 (lines 196-205) — Goal + 4 Success Criteria + Depends-on chain (26+27+28+29)
- `.planning/REQUIREMENTS.md` §DEPLOY-25 (line 63) — Smoke test on clean VM end-to-end
- `.planning/REQUIREMENTS.md` §DEPLOY-26 (line 64) — nmap port lockdown allowed/blocked list

### Deferred UAT items (folded into verify-*.sh per D-13)
- `.planning/phases/27-caddy-reverse-proxy-auto-tls/27-HUMAN-UAT.md` — 4 pending items (live LE cert + 308 redirect, wss upgrade, cert persist down/up, verify-phase-27.sh re-run)
- `.planning/phases/29-operator-ux-bootstrap-update-backup-restore-super-admin-cli/29-HUMAN-UAT.md` — 5 pending items (cold deploy <10min, create-admin + --force, update.sh atomic recycle, backup/restore round-trip, README quickstart E2E)

### Phase 26 hand-off (compose + port topology)
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §port topology + Pitfall 13 — SRS admin 1985 binds 127.0.0.1 only (verify-nmap target: closed externally)
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` "Phase 30 flags" notes — verifier-script regex assumed short-form `127.0.0.1:1985`, actual `docker port` renders long-form (re-test against actual output, not docker-compose-config rendered)
- `deploy/docker-compose.yml` — 7 services, 2 networks (edge + internal), 5 named volumes (postgres_data, redis_data, minio_data, caddy_data, hls_data)
- `deploy/.env.production.example` — 4-section template; `${ACME_CA}` toggle + `${MINIO_PUBLIC_URL}` (Phase 27 D-26)

### Phase 27 hand-off (Caddy + ACME)
- `.planning/phases/27-caddy-reverse-proxy-auto-tls/27-CONTEXT.md` §D-08, D-09 — Caddy auto-HTTPS + ACME staging toggle via `ACME_CA` env (D-05 inherits)
- `.planning/phases/27-caddy-reverse-proxy-auto-tls/27-CONTEXT.md` §D-12 — HTTP/3 disabled (`servers { protocols h1 h2 }`), nmap UDP scope = 8000+10080 only (D-15)
- `.planning/phases/27-caddy-reverse-proxy-auto-tls/27-CONTEXT.md` §D-13 — caddy_data + caddy_config volumes carry cert + ACME state (D-06 wipe semantics)
- `.planning/phases/27-caddy-reverse-proxy-auto-tls/27-CONTEXT.md` §D-26 — MINIO_PUBLIC_URL HTTPS for browser-side fetches (mixed-content guard)
- `deploy/Caddyfile` — handle blocks (api/socket.io/avatars/snapshots/web), email/admin/protocols globals
- `deploy/DOMAIN-SETUP.md` — DNS A-record + port 80 + propagation walkthrough + Cloudflare gray→orange addendum (operator follows ก่อน smoke)
- `deploy/scripts/verify-phase-27.sh` — pattern reference for verify-* scripts (set -euo pipefail, color output, exit codes, `[1/N]` step numbering, structural greps + checkpoint scaffold)

### Phase 28 hand-off (GHCR pull)
- `.planning/phases/28-github-actions-ci-cd-ghcr/28-CONTEXT.md` §D-04 — image tag scheme (vX.Y.Z + vX.Y + latest + sha-7); smoke uses `IMAGE_TAG=latest` หรือ `vX.Y.Z` ตาม operator preference
- GHCR public access — `docker pull ghcr.io/${GHCR_ORG}/sms-{api,web}:${IMAGE_TAG}` ไม่ต้อง auth (Pitfall 11 mitigated)

### Phase 29 hand-off (operator scripts = test subjects)
- `.planning/phases/29-operator-ux-bootstrap-update-backup-restore-super-admin-cli/29-CONTEXT.md` §D-07 — bootstrap.sh pre-flight 3 checks
- `.planning/phases/29-operator-ux-bootstrap-update-backup-restore-super-admin-cli/29-CONTEXT.md` §D-09, D-12 — bootstrap.sh auto-create super-admin + ELAPSED log (verify-deploy.sh consumes)
- `.planning/phases/29-operator-ux-bootstrap-update-backup-restore-super-admin-cli/29-CONTEXT.md` §D-15, D-16 — update.sh atomic pre-flight migrate + post-recycle health verify
- `.planning/phases/29-operator-ux-bootstrap-update-backup-restore-super-admin-cli/29-CONTEXT.md` §D-17, D-19, D-23 — backup.sh archive contents + restore.sh idempotent overwrite
- `.planning/phases/29-operator-ux-bootstrap-update-backup-restore-super-admin-cli/29-CONTEXT.md` §D-25 — README 5-step quickstart claim (operator follows ใน D-14 step 7)
- `.planning/phases/29-operator-ux-bootstrap-update-backup-restore-super-admin-cli/29-CONTEXT.md` §D-29 — bash conventions (D-18 inherits)
- `deploy/scripts/bootstrap.sh` (~9KB) — verify-deploy.sh runs this end-to-end + parses ELAPSED
- `deploy/scripts/update.sh` (~5KB) — verify-deploy.sh tests atomic recycle (Phase 29 SC#3, requires test image tag)
- `deploy/scripts/backup.sh` (~7KB) — verify-backup.sh invokes
- `deploy/scripts/restore.sh` (~9KB) — verify-backup.sh invokes with `--yes` flag (D-22 of Phase 29)
- `deploy/scripts/init-secrets.sh` — bootstrap.sh calls (Phase 26 D-14, idempotent)
- `deploy/README.md` — D-14 step 7 read-along + drift capture
- `deploy/BACKUP-RESTORE.md` — verify-backup.sh assertion sources
- `deploy/TROUBLESHOOTING.md` — drift queue cross-reference (operator-facing fault tree)

### Phase 23 prior art (irrelevant carry-forward — explicitly NOT in scope)
- `.planning/phases/23-tech-debt-cleanup-phase-0-prerequisites/23-HUMAN-UAT.md` — UAT #1 (api test suite local) + #2 (recordings page tags+description visual) + #3 (gh repo create + branch protection) — **NOT folded into Phase 30**, scope mismatch (dev-stack / orthogonal infra task per "Out of scope")

### External tooling docs
- [Let's Encrypt Staging Environment](https://letsencrypt.org/docs/staging-environment/) — D-05 ACME_CA endpoint (https://acme-staging-v02.api.letsencrypt.org/directory) + untrusted-cert behavior
- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/) — D-05 motivation (5 fail/hr/host on production CA)
- [nmap UDP scan](https://nmap.org/book/scan-methods-udp-scan.html) — D-15 -sU + --reason flag interpretation (open|filtered ambiguity)
- [Socket.IO transport upgrade](https://socket.io/docs/v4/troubleshooting-connection-issues/) — D-10 wss 101 probe expected response shape
- [MinIO mc diff](https://min.io/docs/minio/linux/reference/minio-mc/mc-diff.html) — D-10 verify-backup byte-equivalent assertion
- [PostgreSQL pg_restore --clean --if-exists](https://www.postgresql.org/docs/16/app-pgrestore.html) — D-10 idempotent restore (Phase 29 D-23 inherits)

### Test stream sources (D-07)
- [MediaMTX demo / rtsp.stream](https://www.rtsp.stream/) — primary public RTSP feed (multi-codec, maintained)
- Wowza demo: `rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mov` — fallback (H.264 VOD low-bitrate)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`deploy/scripts/verify-phase-27.sh`** (115 LOC, mode 0755) — verify-* pattern reference: `set -euo pipefail`, tput-aware color, `[N/M] checkpoint` numbering, `compose config --quiet` + `docker run --rm caddy:2.11 caddy validate` checkpoints, structural grep assertions (25), final summary `All N static checks passed.` + exit 0/1. D-10 + D-18 + D-19 inherit ทั้งหมด — verify-deploy.sh + verify-playback.sh + verify-backup.sh + verify-nmap.sh + smoke-test.sh ใช้ structure เดียวกัน.
- **`deploy/scripts/bootstrap.sh`** — Phase 29 D-12 ELAPSED log format `[bootstrap] Bootstrap completed in <N>s` + final URL print. verify-deploy.sh `grep -E '^\\[bootstrap\\] Bootstrap completed in [0-9]+s$' /tmp/bootstrap.log | awk` extracts wall-clock seconds + assert `<= 600`.
- **`deploy/scripts/backup.sh` + `restore.sh`** — Phase 29 D-17..D-24 implementations. verify-backup.sh invokes ตรงๆ + asserts archive shape + SELECT count diff + MinIO bucket diff.
- **`deploy/scripts/update.sh`** — Phase 29 D-13..D-16 atomic recycle. verify-deploy.sh tests Phase 29 SC#3 by running `update.sh latest` (or operator-supplied tag) บน existing stack + curl-probe `/api/health` ระหว่าง recycle.
- **`apps/api/bin/sms` + `dist/cli/sms.js`** — Phase 29 D-01..D-06 bin/sms create-admin. verify-deploy.sh runs `docker compose exec api bin/sms create-admin --email <e> --password <p>` + asserts exit 0 + login via Better Auth + `--force` rotation.
- **`bash` 5.x + GNU coreutils + `nmap`** — operator's local machine prerequisites for verify-nmap.sh (D-15). macOS: `brew install nmap`. Linux: `apt install nmap`.
- **MinIO `mc` client** — installed inside MinIO container (D-23 of Phase 29 backup.sh uses). verify-playback.sh + verify-backup.sh exec `mc` ผ่าน `docker compose exec minio mc ...`.
- **Caddy logs** — `docker compose logs caddy` มี ACME issuance lines (`certificate obtained`). verify-deploy.sh `grep -c 'certificate obtained'` after 2nd boot ต้อง = 0 (Phase 27 SC#3 cert persist).

### Established Patterns

- **Per-SC verifier modularity** — pattern คุ้นตา operator (Phase 27 single verify script + Phase 30 4 verify-* scripts). Each script callable standalone for debug; wrapper composes.
- **Idempotent re-run** — Phase 26 init-secrets, Phase 29 bootstrap.sh ทุกตัว safe re-run. Phase 30 verify-* scripts ก็เช่นกัน — operator ที่ failure path สามารถ debug + re-run individual verifier.
- **`docker compose -f deploy/docker-compose.yml --env-file deploy/.env`** verbose form (Phase 29 D-29 inherit) — operator อาจ run script จาก cwd ใดก็ได้.
- **Per-phase HUMAN-UAT.md** — Phase 23/27/29 stop at "test passed in dev / static" line; live-runtime evidence deferred to Phase 30. Phase 30 closes ALL 9 deferred items via D-13 mapping.
- **Drift documentation** — Phase 24 D-12 (web port `3002 → 3000` mid-verification correction), Phase 26 "Phase 30 flags" — drift caught + documented + queued. Phase 30 D-16 follows pattern (queue, ไม่ fix inline).
- **`set -euo pipefail` + IFS** — Phase 29 D-29 standard. D-18 inherit.

### Integration Points

- **smoke-test.sh wrapper → 4 verify-*.sh** — sequential (deploy → playback → backup → nmap). gate ระหว่าง playback + backup = manual UI step (D-14 5-6) ที่ operator ต้องทำก่อนเรียก verify-backup.sh. wrapper print "Press ENTER when manual UI checklist (D-14 steps 1-6) complete..." prompt.
- **verify-deploy.sh → bootstrap.sh + update.sh** — runs `bash deploy/scripts/bootstrap.sh` + parses ELAPSED + runs `bash deploy/scripts/update.sh <test-tag>` for atomic recycle test.
- **verify-playback.sh → manual UI register-camera step** — verify-playback assumes camera registered + recording captured ก่อนเรียก. Wrapper enforces ordering via D-14 prompt.
- **verify-backup.sh → backup.sh + restore.sh** — populates synthetic data (1 org + 1 camera + 1 recording จาก verify-playback) → snapshots SELECT counts → invokes backup.sh + restore.sh + asserts byte-equivalence + cert preservation.
- **verify-nmap.sh → operator's machine** — runs from laptop, not VM. requires `${VM_IP}` env. wrapper notes "Run verify-nmap.sh from your local machine, not from the VM" instruction.
- **SMOKE-TEST-LOG.md ← all verifiers** — each verify-*.sh appends per-SC table row + drift entries via `tee -a` (or similar). wrapper inits log header at start.
- **Phase 30 30-VERIFICATION.md ← SMOKE-TEST-LOG.md** — GSD-side verification consumes operator-facing log + maps SC pass/fail to ROADMAP success criteria + records GA gate verdict.
- **Drift queue → `.planning/todos/v1.3.1-drift-from-phase-30.md`** (D-16) — file created during smoke if drift detected; consumed by v1.3.1 patch milestone scoping.

</code_context>

<specifics>
## Specific Ideas

- **"Smoke = single-shot run, drift = always-queued"** — Phase 30 ไม่ใช่ phase แก้ bug. Drift caught ระหว่าง smoke = log + queue v1.3.1. Smoke runs ต้อง reproducible — fix-inline ทำให้ subsequent runs different ฐานะ.
- **"ACME staging-first = LE rate-limit insurance"** — production CA มี 5 fail/hr/host cap. Staging ไม่จำกัด → safe เพื่อ debug DNS/port-80/ACME path ก่อน production CA. ตัดสินใจนี้สอดคล้อง Phase 27 D-09 staging toggle ที่ ship ไปแล้ว.
- **"Single VM with `down -v` reset = real fresh-VM semantics"** — caddy_data wipe ระหว่าง staging→production = simulate "fresh VM" path ที่ operator จะเดินจริงตอน production deploy. ไม่ใช้ in-place cert swap (Phase 27 D-09 ระบุ caddy_data carries account state — file-edit hacky).
- **"60s recording is enough"** — SRS hls_fragment 2s + hls_window 10s + hls_dispose 30s (Phase 26 srs.conf) → 60s ระยะ produce ~5-6 segments + finalize manifest. Sufficient evidence ของ end-to-end pipeline (RTSP → SRS → HLS → MinIO archive).
- **"DevTools WebSocket frame = simplest reliable WS validation"** — operator ใช้ browser อยู่แล้วตอนทำ UI checklist. Network tab → socket.io filter → frame inspector มาในตัว. ไม่ต้อง headless framework. Trade-off: subjective (operator screenshot evidence) แต่ acceptable สำหรับ smoke gate.
- **"`.ts` not `.mp4`"** — SRS v6 limitation (no fMP4) per Phase 23 D-03. verify-* scripts assert by extension (D-09). v7+ migration จะ flip back to fMP4 (deferred).
- **"Hard SC#1-#3 + soft SC#4 = pragmatic GA gate"** — All-or-nothing block ทำให้ docs typo block GA = over-block. Soft drift documented + queued = milestone ships ไม่ถูกเลื่อนเพราะ cosmetic issue. SC#1-#3 functional gates ของจริง.
- **"BYO operator VM = realistic v1.3 deploy path"** — แยกจาก "fresh DigitalOcean droplet" intent ของ ROADMAP เล็กน้อย แต่ตรง spirit (fresh machine, never touched codebase). Operator ที่จะใช้ v1.3 จริงน่าจะมี VM ของตัวเองอยู่แล้ว (on-prem หรือ cloud-of-choice).
- **"5-file deliverable set = balance of modularity + composability"** — Phase 27 ใช้ single verify-phase-27.sh เพราะ scope เล็ก (Caddy validation only). Phase 30 scope กว้าง (4 SC + 9 UAT) → modular + wrapper รักษา debug-ability โดยไม่บังคับ run ทุกอย่าง re-attempt.
- **"nmap from laptop = ROADMAP intent"** — "external machine" wording ของ ROADMAP ไม่ระบุ cloud-side scanner. Local laptop เพียงพอ + ลด setup overhead.
- **"Drift backlog file created on-demand"** — `.planning/todos/v1.3.1-drift-from-phase-30.md` สร้างเฉพาะถ้ามี drift จริง. ถ้าไม่มี = ไม่สร้าง file.

</specifics>

<deferred>
## Deferred Ideas

- **Headless puppeteer/playwright UI test** — Q4 'full automation' rejected. Setup overhead (Chromium install บน smoke VM, brittleness across breakpoints) > value. Manual checklist + DevTools screenshot สำหรับ smoke เพียงพอ. Future v1.4: headless E2E suite ใน CI (separate scope).
- **Two-VM staging/production separation** — Q6 alternative. Cleaner semantics แต่เพิ่ม cost/time + ขัด BYO single-VM choice. Defer ถ้า operator มี budget สำหรับ multi-VM CI environment.
- **Cloud-side nmap from second throwaway VM** — Q13 alternative. Defense-in-depth evidence แต่ `external machine` intent ของ ROADMAP local-laptop เพียงพอ. v1.4 monitoring ที่อาจมี continuous external port scanner.
- **Dedicated `verify-uat-bundle.sh`** — Q15 alternative. SC mapping ใน D-13 ทำให้ UAT items inherit hard/soft gate ของ SC owner naturally. Separate file = duplicate logic.
- **sslip.io / nip.io throwaway DNS** — Q14 alternative. Operator มี domain owned แล้ว (Q14 answer); throwaway โหมดไว้สำหรับ operator ที่ไม่มี domain.
- **Recorded video walkthrough for <10-min claim** — Phase 29 D-26 deferred. SMOKE-TEST-LOG ELAPSED + SC table = sufficient evidence.
- **Multi-region VM matrix testing** — single-region BYO เพียงพอ. v1.4 production deployment guide may expand.
- **Vanilla-Ubuntu-no-Docker timing measurement** — D-02 locks Docker pre-installed. DEPLOY-29 doctor pre-flight (defer v1.4) อาจเพิ่ม Docker version check.
- **`bin/sms doctor` invocation in verify-deploy.sh** — DEPLOY-29 deferred v1.4 (Phase 29 deferred). v1.4 verify-deploy could pre-flight via doctor.
- **Phase 23 UAT #2 (visual smoke /app/recordings/[id])** — dev-stack scope (run via `pnpm dev`), ไม่ใช่ fresh-VM smoke. Manual visual test ที่อยากเก็บไว้ทำตอน operator dev environment work.
- **Phase 23 UAT #3 (gh repo create + branch protection)** — orthogonal infra task ไม่ผูกกับ live VM. Phase 28 already pushed images → branch protection setup เป็น GitHub-side admin step ที่ operator ทำเอง.
- **Drift remediation phase 30.1** — D-16 queues drift to v1.3.1. ถ้า hard drift บล็อก GA → re-smoke required (Phase 30 second iteration), ไม่ใช่ Phase 30.1.
- **Backup encryption (GPG/age/openssl enc)** — Phase 29 deferred. operator-side responsibility post-archive (BACKUP-RESTORE.md mentions).
- **Performance/load testing** — Phase 30 = functional smoke only. v1.4 SLO/SLA testing.
- **Multi-camera stress (≥10 cameras)** — single test camera พอสำหรับ smoke. v1.4 capacity benchmarking.
- **bin/sms doctor / reset-password / version / verify-backup subcommands** — Phase 29 deferred v1.4.
- **Watchtower auto-update** — DEPLOY-31 anti-feature in v1.3 (locked). v1.4 may revisit.
- **Cosign image signing + verify** — DEPLOY-27 deferred v1.4. Phase 28 attest-build-provenance เพียงพอ.
- **SBOM generation** — DEPLOY-28 deferred v1.4.
- **ARM64 multi-arch** — DEPLOY-32 deferred v1.4. amd64-only locked.

</deferred>

---

*Phase: 30-smoke-test-on-clean-vm-ga-gate*
*Context gathered: 2026-04-29*
