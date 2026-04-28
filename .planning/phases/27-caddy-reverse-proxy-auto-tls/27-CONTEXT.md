# Phase 27: Caddy Reverse Proxy + Auto-TLS - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

เพิ่ม `caddy` service เข้า `deploy/docker-compose.yml` (Phase 26 เป็นเจ้าของไฟล์) + สร้าง `deploy/Caddyfile` ที่:
1. Auto-provision Let's Encrypt cert สำหรับ `${DOMAIN}` ผ่าน HTTP-01 challenge บน port 80 ภายใน 60s ของ first boot
2. Same-origin routing บน `${DOMAIN}` — `/api/*` + `/socket.io/*` + `/avatars/*` + `/snapshots/*` → upstream-specific services; default → web:3000
3. WebSocket pass-through ทำงาน end-to-end สำหรับทุก Socket.IO namespace ที่ api รัน (`/notifications`, `/camera-status`, `/cluster`, `/srs-log` — ทั้ง 4 ใช้ handshake URL `/socket.io/...`)
4. Persist cert + acme account state ผ่าน `caddy_data` volume (Phase 26 declare ไว้แล้ว) + เพิ่ม `caddy_config` volume ใหม่
5. Staging-CA toggle ผ่าน env var `ACME_CA` เพื่อให้ operator debug DNS/firewall โดยไม่ burn Let's Encrypt rate-limit
6. `deploy/DOMAIN-SETUP.md` เอกสาร operator-facing ระดับ minimal (DNS A-record + port 80 + propagation + staging toggle)

**Delivers:**
- `deploy/Caddyfile` — site block `${DOMAIN}` พร้อม path matchers + global options (acme_ca, email, admin off, protocols h1 h2)
- `deploy/docker-compose.yml` patch — เพิ่ม `caddy` service + `caddy_config` volume declaration; **ไม่แตะ** services อื่น
- `deploy/.env.production.example` patch — เพิ่ม `ACME_EMAIL` (required) + `ACME_CA` (optional, default empty = prod CA) — Phase 26 ไฟล์มีอยู่แล้วแต่ Phase 27 ขยาย
- `deploy/DOMAIN-SETUP.md` — operator doc ระดับ minimal

**Out of scope (belongs to other phases):**
- Multi-domain / wildcard cert / DNS-01 challenge — single hostname พอสำหรับ v1.3
- HTTP/3 (QUIC) บน 443/udp — disabled deliberately (firewall/nmap surface ใน Phase 30 เล็กกว่า)
- `www.${DOMAIN}` redirect handling — apex only; operator ใช้ A-record ที่ apex
- Caddy hot-reload via admin API — `admin off` ใน global; reload ผ่าน `docker compose restart caddy`
- Rate limiting / WAF / bot protection — Cloudflare/v1.4 territory
- Refactor `getAvatarUrl` / `getSnapshotUrl` ใน api — ใช้ `${DOMAIN}:443/<bucket>/*` URL pattern เดิม (Phase 26 set `MINIO_PUBLIC_PORT=443` ไว้แล้ว, Phase 27 Caddy ทำให้ pattern นั้น valid)
- Operator scripts ที่ wrap Caddy ops (cert renewal manual, log inspection) — Phase 29 territory
- Smoke test on clean VM (HTTPS verify, WSS verify) — Phase 30 territory
- Comprehensive DOMAIN-SETUP (provider walkthroughs, troubleshooting, regional DNS) — defer; minimal doc + link to Phase 29 README พอ

</domain>

<decisions>
## Implementation Decisions

### MinIO public path proxy (DEPLOY-07 expansion)
- **D-01:** Caddy เพิ่ม path matchers **`/avatars/*` + `/snapshots/*`** → `minio:9000` (same-origin, no CORS, no cookie pain). เหตุผล: `apps/api/src/recordings/minio.service.ts:111-122,178-189` — `getAvatarUrl()` + `getSnapshotUrl()` build URL pattern `${MINIO_PUBLIC_ENDPOINT}:${MINIO_PUBLIC_PORT}/<bucket>/<object>` ซึ่ง Phase 26 D-07/api environment block set `MINIO_PUBLIC_ENDPOINT=${DOMAIN}` + `MINIO_PUBLIC_PORT=443` ไว้แล้ว — Phase 27 Caddy ทำให้ pattern นั้น resolvable. ถ้าไม่ proxy avatars + snapshots จะ 404 บน prod (BLOCKER for v1.3 GA functionality).
- **D-02:** Recording HLS segments **ไม่ต้อง** route ผ่าน `/recordings/*` หรือ `/org-*` — verify จาก `apps/api/src/recordings/manifest.service.ts:64-72` พบว่า segment URLs build เป็น `/api/recordings/segments/<id>/proxy` ซึ่ง api เป็นตัว stream MinIO objects เข้า browser (server-to-server fetch ใช้ internal `minio:9000`). Presigned URLs ที่เห็นใน `recordings.controller.ts:317` + `bulk-download.service.ts:143` ก็ใช้ภายใน FFmpeg child process (server-side, internal network) ไม่ส่งให้ browser. → Caddy ไม่ต้องแตะ recording paths.
- **D-03:** Path namespace consequence — `${DOMAIN}/avatars` + `${DOMAIN}/snapshots` reserved สำหรับ MinIO buckets. `web` (Next.js) routes ห้ามชนชื่อ — ตรวจ `apps/web/src/app/avatars/`, `apps/web/src/app/snapshots/` ก่อน implement. ปัจจุบัน (2026-04-28) ไม่มี route ชน.
- **D-04:** Caddy reverse_proxy ต้อง strip ไม่จำเป็น — `reverse_proxy minio:9000` พอ; Caddy default ไม่แก้ Host header ในแบบที่ break MinIO public-read GET (anonymous, ไม่ต้อง signature, ไม่ sensitive ต่อ Host). ถ้าใน planning เจอ issue (e.g., MinIO server-side return 403 เพราะ Host header), เพิ่ม `header_up Host {upstream_hostport}` หรือ `header_up X-Forwarded-Host {host}`.

### Routing matchers (DEPLOY-07, DEPLOY-08)
- **D-05:** Caddyfile site block layout (1 site, ordered matchers):
  ```
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
  ใช้ `handle` (mutually exclusive) ไม่ใช่ `route` (sequential) — Caddy 2.x convention; ลำดับ matcher จาก specific → catch-all.
- **D-06:** WebSocket pass-through — `reverse_proxy api:3003` ใน Caddy 2.x จัดการ Upgrade/Connection headers อัตโนมัติ (`Connection: Upgrade` + `Upgrade: websocket` ผ่านโดยไม่ต้อง config เพิ่ม). ตรวจสอบจาก [Caddy reverse_proxy docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#websockets) — "WebSockets are supported automatically out of the box and do not need any special configuration".
- **D-07:** **WS scope = ทุก 4 namespace ผ่าน `/socket.io/*` matcher** — `/socket.io/*` capture ครบทั้ง:
  - `notifications.gateway.ts:11` namespace `/notifications`
  - `status.gateway.ts:11` namespace `/camera-status`
  - `cluster.gateway.ts:10` namespace `/cluster`
  - `srs-log.gateway.ts:13` namespace `/srs-log`

  Socket.IO client handshake ใช้ path `/socket.io/?EIO=4&transport=websocket&...` กับ namespace ใน query/auth — Caddy ส่งครบ payload ให้ api แล้ว api router แยก namespace เอง. ไม่ filter cluster/srs-log ที่ Caddy layer (defense-in-depth ทำที่ app layer ผ่าน Better Auth session check แล้ว — `cluster.gateway.ts` + `srs-log.gateway.ts` มี auth guard).

### Auto-TLS + ACME (DEPLOY-06)
- **D-08:** Caddy auto-HTTPS (Caddy default behavior) — ไม่ต้อง `tls` directive ระดับ site; Caddy detect ว่า site name = real hostname → trigger ACME HTTP-01 บน port 80 อัตโนมัติ. HTTP→HTTPS redirect Caddy auto-add (DEPLOY-06 SC #1).
- **D-09:** **Staging-CA toggle = env var `ACME_CA`**:
  ```
  {
      acme_ca {$ACME_CA:https://acme-v02.api.letsencrypt.org/directory}
      email {$ACME_EMAIL}
      admin off
      protocols h1 h2
  }
  ```
  - `ACME_CA` empty (default) → prod CA (Let's Encrypt)
  - `ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory` → staging
  - 1-line toggle, native Caddy syntax, no extra files หรือ snippets
  - **DOMAIN-SETUP.md** อธิบายตัวเลือก
- **D-10:** **ACME email = env var `ACME_EMAIL`** — required (operator ต้องตั้ง). Let's Encrypt ใช้ email สำหรับ renewal failure warnings. ถ้า empty Caddy fallback anonymous account แต่ operator พลาด notifications. `.env.production.example` mark required + comment "your-email@domain — Let's Encrypt notifications".
- **D-11:** **Caddy admin API disabled** — global `admin off`. Attack surface :2019 ไม่ expose host แม้ว่า bind default คือ 127.0.0.1 (loopback) — เพราะ `docker exec caddy ...` ก็เปิดหน้า admin ได้ ถ้า attacker เข้า container ได้. v1.3 ไม่ใช้ hot-reload — operator reload ผ่าน `docker compose restart caddy` (cert + state อยู่ใน `caddy_data` volume). สอดคล้องกับ Phase 30 nmap port lockdown.
- **D-12:** **HTTP/3 disabled** — global `protocols h1 h2`. Compose expose **เฉพาะ 80/tcp + 443/tcp** — ไม่ bind 443/udp. เหตุผล:
  1. Phase 30 nmap spec รวม `80, 443, 1935, 8080, 8000/udp, 10080/udp` — ถ้าเปิด 443/udp ต้องเพิ่มเข้า acceptable list (เพิ่ม surface)
  2. v1.3 self-hosted minimal — workload (camera viewing, dashboard) ไม่ jitter-sensitive ระดับที่ต้อง QUIC
  3. ถ้าอนาคต demand จริง enable ทีหลังแค่ลบบรรทัดและเพิ่ม port binding (decision reversible)

### Volumes + persistence (DEPLOY-09)
- **D-13:** **2 volumes สำหรับ Caddy state**:
  ```yaml
  caddy:
    volumes:
      - caddy_data:/data         # ACME account, certs, OCSP staples
      - caddy_config:/config     # Caddy config save points
      - ../deploy/Caddyfile:/etc/caddy/Caddyfile:ro
  ```
  - `caddy_data` Phase 26 D-08 declare ไว้แล้ว — Phase 27 attach
  - **`caddy_config`** Phase 27 declare ใหม่ใน `deploy/docker-compose.yml` volumes block. Caddy docs ระบุทั้งสองตัว: `/data` = persistent (cert + private key + ACME account; **lose นี่ = re-issue cert + รับ Let's Encrypt rate limit**), `/config` = transient state save points (recommended persistent แต่ไม่ critical).
  - Caddyfile mount **read-only** เพื่อ defense-in-depth — Caddy ไม่ควรเขียนกลับเข้า config file
- **D-14:** **Volume path bind from compose location** — `deploy/docker-compose.yml` อยู่ที่ `deploy/`; Caddyfile อยู่ `deploy/Caddyfile`; relative bind syntax ในไฟล์ compose ต้องใช้ `../deploy/Caddyfile:...` หรือ `./Caddyfile:...` — ตรวจสอบเทียบ srs config bind ใน 26-01 (`../config/srs.conf:/usr/local/srs/conf/srs.conf:ro`). Pattern เดียวกัน: relative path เทียบกับ compose file location. → Phase 27 ใช้ `./Caddyfile:/etc/caddy/Caddyfile:ro` เพราะอยู่โฟลเดอร์เดียวกัน.

### Service config (DEPLOY-13 inheritance)
- **D-15:** **Image pin = `caddy:2.11`** (DEPLOY-06 spec). ใช้ minor tag (`2.11`) ไม่ใช่ patch (`2.11.x`) เพื่อ get security patches อัตโนมัติ ภายใน minor line. v2.11 ออก 2024-Q3 พร้อม WebSocket fix; v2.12+ ค่อยทดสอบใน v1.4 (intentional pin lock).
- **D-16:** **Compose service spec ครบตาม DEPLOY-13**:
  ```yaml
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
    logging: *default-logging
  ```
  - `init: true` (Phase 26 D-18 pattern) — Caddy already runs PID 1 cleanly แต่ harmless redundancy
  - `restart: unless-stopped` (Phase 26 D-17)
  - `start_period: 30s` — Caddy first boot อาจ ACME challenge ใช้เวลา; healthcheck ไม่ trigger restart ระหว่าง cert provisioning
  - Healthcheck = `wget --spider http://localhost:80` (Caddy image ไม่มี curl, busybox มี wget) — ตอบ HTTP 308 → HTTPS = liveness signal เพียงพอ
  - `depends_on api/web` — Caddy ไม่ควร boot ก่อน upstreams (avoid 502 spam during boot); `service_healthy` aligned กับ Phase 26 dep chain
  - `logging: *default-logging` — reuse YAML anchor ใน Phase 26 compose
  - Network = `edge` only (Phase 26 D-06 — caddy + web + api + srs); MinIO อยู่ internal — Caddy reach minio ผ่าน api network bridge? **NO** — Caddy ต้อง resolve `minio:9000` ดังนั้น **Caddy ต้องอยู่ทั้ง edge และ internal**, หรือ MinIO ต้อง expose ผ่าน edge ด้วย.

- **D-17 (CRITICAL — overrides Phase 26 D-06):** **Caddy ต้องอยู่ทั้ง `edge` + `internal` network** เพื่อ resolve `minio:9000` (MinIO อยู่ internal-only ตาม Phase 26 D-06). อัปเดต Phase 26 service-network table:
  | Service | edge | internal |
  |---------|------|----------|
  | caddy (NEW) | ✓ | ✓ |

  เหตุผล: MinIO no host port (Phase 26 D-07) → Caddy ต้อง reach ผ่าน Docker DNS internal network. ทางเลือก (เปิด minio host port) จะ break DEPLOY-11 (`postgres/redis/minio have no host ports`). Caddy ใน internal network ไม่ break security model — caddy ไม่มี egress, แค่ DNS resolution ภายใน Docker.
- **D-18:** **`internal: true` constraint check** — Phase 26 D-05 set `internal: true` บน `internal` network = block egress to outside. Caddy ใน internal ก็ block egress — แต่ Caddy ไม่ต้องการ egress (ACME ไป Let's Encrypt ผ่าน edge → host → internet). Verified: ACME handshake outbound ใช้ default route ของ Caddy = edge bridge → host → internet. OK.

### `.env.production.example` patch (DEPLOY-22 + DEPLOY-24 cross-cutting)
- **D-19:** เพิ่ม 2 ตัวแปรใหม่:
  ```
  # Required — Let's Encrypt contact for renewal warnings
  ACME_EMAIL=

  # Optional — set to staging URL for ACME debugging without burning rate-limit
  # Default (empty): https://acme-v02.api.letsencrypt.org/directory (production CA)
  # Staging: https://acme-staging-v02.api.letsencrypt.org/directory
  ACME_CA=
  ```
  - `ACME_EMAIL` ไป section "Required (no default)" ของ Phase 26 D-25
  - `ACME_CA` ไป section "Defaults (override-only)"
- **D-20:** **`init-secrets.sh` ไม่ generate `ACME_EMAIL`** — เป็น human input ไม่ใช่ random secret. ถ้า empty operator เตือน Caddy will fail to start (หรือ run with anonymous account warning). เพิ่ม validation ใน `init-secrets.sh`? **No** — out of scope สำหรับ Phase 27; Phase 29 bootstrap.sh ค่อย warn ถ้าจะเพิ่ม UX.

### `DOMAIN-SETUP.md` content (DEPLOY-24)
- **D-21:** **Minimal scope** — ~1 page focused content. Sections:
  1. **DNS A-record** — point `${DOMAIN}` apex ไปที่ public IP ของ host (`A example.com → 1.2.3.4`); explain TTL implications (operator ตั้ง 300s ระหว่าง setup, raise to 3600+ หลัง stable)
  2. **Port 80 reachability** — ACME HTTP-01 challenge ต้อง reach `:80` จาก Let's Encrypt servers; firewall ต้องเปิด TCP 80; Cloudflare proxy ON ต้องเป็น "DNS only" (gray cloud) ระหว่าง initial cert
  3. **Propagation expectations** — DNS propagation 1-15 นาทีหลัง update; verify ผ่าน `dig ${DOMAIN} +short` หรือ `https://dnschecker.org`
  4. **Staging-CA toggle** — set `ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory` ใน `.env` แล้ว `docker compose restart caddy`; verify cert ออกแล้ว expect "Fake LE" issuer (browser warning normal); ถ้า OK → unset → restart → cert prod
  5. **Common errors** — short table (3-4 rows): "Cert error 401 unauthorized" → port 80 closed; "Cert error timeout" → DNS propagation incomplete; "Rate limit exceeded" → switch to staging
- **D-22:** **ไม่ include**: provider-specific UI walkthroughs (Cloudflare/Route53/Namecheap), regional DNS quirks, multi-domain setup. Link ไป Caddy official docs สำหรับ deep-dive.
- **D-23:** Doc lives at `deploy/DOMAIN-SETUP.md` (Phase 24 D-01 — `*.md` files ที่ deploy/ root, ไม่ใช่ `deploy/docs/`).

### Verification gates (Phase 27 success criteria)
- **D-24:** **6 verification checkpoints** ก่อน mark Phase 27 complete (planner เพิ่มใน PLAN.md):
  1. `docker compose -f deploy/docker-compose.yml --env-file deploy/.env config --quiet` exit 0 (compose syntax + env interpolation valid)
  2. `caddy validate --config deploy/Caddyfile --adapter caddyfile` exit 0 (Caddyfile syntax valid)
  3. ใน lab/test domain: `docker compose up -d` แล้ว `docker compose logs caddy --since 60s | grep -i "certificate obtained successfully"` พบ
  4. `curl -kIL http://${DOMAIN}` แสดง `HTTP/1.1 308 Permanent Redirect` → `https://${DOMAIN}`
  5. WSS smoke: `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" -H "Sec-WebSocket-Version: 13" "https://${DOMAIN}/socket.io/?EIO=4&transport=websocket"` แสดง `HTTP/1.1 101 Switching Protocols`
  6. `docker compose down && docker compose up -d` แล้ว Caddy boot ไม่ trigger ACME re-issue (`docker compose logs caddy | grep -c "certificate obtained"` = 0 ใน boot ที่ 2)
- **D-25:** Phase 30 smoke จะ verify end-to-end (login + camera register + RTSP→HLS playback + WSS notifications) — Phase 27 verification เน้นที่ Caddy layer functional พอ.

### Research-resolved decisions (2026-04-28, locked after research)
- **D-26 (CRITICAL — mixed-content blocker fix):** `apps/api/src/recordings/minio.service.ts:111-122,178-189` currently builds avatar/snapshot URLs with **`http://`** scheme even when `MINIO_PUBLIC_PORT=443` (researcher report 2026-04-28). On a TLS-served page, every browser blocks `http://` subresources as mixed content → avatars/snapshots disappear in prod (BLOCKER for v1.3 GA). **Locked fix:** emit URLs with **`https://${DOMAIN}/<bucket>/<object>`** (scheme = `https`, no port suffix — 443 is implicit) when the request is for the public-facing URL. Planner reads `minio.service.ts` to choose the concrete code path:
  - Option A: introduce `MINIO_PUBLIC_URL` env var (e.g. `https://${DOMAIN}`) and have `getAvatarUrl()`/`getSnapshotUrl()` consume it directly (drop the `${endpoint}:${port}` recombination for public URLs).
  - Option B: derive scheme from a new `MINIO_PUBLIC_PROTOCOL` env var (`https` in prod, `http` in dev) keeping the existing endpoint+port assembly.
  - Either is acceptable; planner picks based on minimal-blast-radius after reading the file. Caddyfile path matchers `/avatars/*` + `/snapshots/*` (D-01/D-05) remain — they handle the proxy side; D-26 fixes the client-emitted URL scheme.
  - Acceptance: `curl -sI https://${DOMAIN}/avatars/<known-uid>.webp` returns 200 (or 404 if no avatar) — never mixed-content blocked; `view-source` of any page never shows `http://` MinIO URLs when DOMAIN is set.
  - Mark in `deploy/.env.production.example` if a new env var is introduced.
- **D-27 (defensive routing — supersedes D-05's `/api/*` line):** Caddyfile MUST match **both** bare `/api` and `/api/*` so a request to `https://${DOMAIN}/api` does not fall through to web:3000 and 404. Two equivalent forms acceptable:
  ```
  @api path /api /api/*
  handle @api {
      reverse_proxy api:3003
  }
  ```
  or expand `handle /api/*` block to also include a sibling `handle /api { reverse_proxy api:3003 }`. Planner picks the cleaner form.
- **D-28 (DOMAIN-SETUP.md Cloudflare addendum — refines D-21 #2):** The Cloudflare note already in D-21 #2 ("gray cloud during initial cert") MUST add **one sentence** stating "After Caddy reports `certificate obtained successfully`, you may re-enable Cloudflare proxy (orange cloud) — Caddy will continue serving the existing cert and renew via stored ACME account state in `caddy_data`." This closes the operator workflow loop.

### Claude's Discretion
- Caddyfile indentation (Caddy uses tabs, JSON-style braces, 1-line directives)
- Healthcheck timing tuning (`interval: 30s` ก่อน, อาจปรับ 60s ถ้า cert provisioning ซ้อน)
- Comment density ใน Caddyfile (เก็บ minimal — Caddy syntax self-documenting)
- Wget vs curl debate ใน healthcheck (Caddy image alpine, busybox มี wget — ใช้ wget)
- Logging format ของ Caddy (default JSON เหมาะกับ json-file driver — ไม่ override)
- Compose service order (caddy ใส่หลัง web — readability)
- Health endpoint ของ Caddy (`/`?, `/health`?) — `/` ตอบ 308 → liveness OK; ไม่ต้อง dedicated endpoint
- ลำดับ Caddyfile matchers — D-05 listed; planner เลือก finalize order

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap (locked decisions)
- `.planning/ROADMAP.md` §Phase 27 (Goal + Success Criteria #1-5)
- `.planning/REQUIREMENTS.md` §DEPLOY-06 — Caddy 2.11.x auto-TLS + HTTP→HTTPS redirect
- `.planning/REQUIREMENTS.md` §DEPLOY-07 — `/api/*` + `/socket.io/*` → api:3003, default → web:3000 (same-origin)
- `.planning/REQUIREMENTS.md` §DEPLOY-08 — WebSocket pass-through สำหรับ NotificationsGateway + StatusGateway
- `.planning/REQUIREMENTS.md` §DEPLOY-09 — `caddy_data` + `caddy_config` named volumes survive restarts
- `.planning/REQUIREMENTS.md` §DEPLOY-24 — `deploy/DOMAIN-SETUP.md` content scope

### Phase 26 hand-off (volumes + networks + env wiring)
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-05 — `edge` + `internal: true` network topology
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-06 — service↔network table (Phase 27 D-17 amends ให้ caddy อยู่ทั้ง 2)
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-07 — port exposure table (Phase 27 ลบ host port 8080 ของ srs ภายหลัง? **NO** — srs HLS Phase 27 ปล่อยตามเดิมเพื่อ smoke; refactor ภายหลัง)
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-08 — 5 named volumes (caddy_data already declared)
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-13 — `restart: unless-stopped` + `init: true` patterns
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-16 — YAML logging anchor reuse
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-25 — `.env.production.example` 4-section structure (Phase 27 ขยาย Required + Defaults)
- `deploy/docker-compose.yml` (Phase 26 product) — full file ที่ Phase 27 amend (เพิ่ม service + volume; ไม่ rewrite)
- `deploy/.env.production.example` (Phase 26 product) — Phase 27 ขยายด้วย ACME_EMAIL + ACME_CA

### Phase 24 + 25 conventions
- `.planning/phases/24-deploy-folder-structure-dev-workflow-guardrails/24-CONTEXT.md` §D-01 — `deploy/` root holds `*.md` files (DOMAIN-SETUP.md ไป root, ไม่ใช่ subfolder)
- `CLAUDE.md` §Deploy Folder Convention — `deploy/` = production-only; ห้ามมี dev tooling
- `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md` §D-04 — image-side HEALTHCHECK pattern (api/web ใช้ของ image; Caddy ใช้ compose-side healthcheck เพราะ caddy:2.11 image ไม่มี HEALTHCHECK ใน Dockerfile)

### Existing api code (must align with)
- `apps/api/src/notifications/notifications.gateway.ts:8-13` — `@WebSocketGateway({ namespace: '/notifications' })` + Socket.IO
- `apps/api/src/status/status.gateway.ts:8-13` — `@WebSocketGateway({ namespace: '/camera-status' })`
- `apps/api/src/cluster/cluster.gateway.ts:3-12` — `@WebSocketGateway` (cluster namespace)
- `apps/api/src/srs/srs-log.gateway.ts:3-15` — `@WebSocketGateway` (srs-log namespace)
- `apps/api/src/recordings/minio.service.ts:111-122` — `getAvatarUrl()` URL pattern: `${MINIO_PUBLIC_ENDPOINT}:${MINIO_PUBLIC_PORT}/avatars/<uid>.webp`
- `apps/api/src/recordings/minio.service.ts:178-189` — `getSnapshotUrl()` URL pattern: `${MINIO_PUBLIC_ENDPOINT}:${MINIO_PUBLIC_PORT}/snapshots/<id>.jpg`
- `apps/api/src/recordings/manifest.service.ts:64-72` — recording segment URLs use `/api/recordings/segments/<id>/proxy` (api proxies, **not** MinIO direct) — Caddy ไม่ต้อง route recording paths
- `apps/api/src/main.ts:22-29` — CORS allowlist (dev origins only); production CORS rely on Caddy same-origin (no CORS headers needed)

### Caddy upstream documentation
- [Caddy 2.11 Caddyfile reference](https://caddyserver.com/docs/caddyfile) — global options + site blocks
- [Caddy reverse_proxy directive](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) — WebSocket auto-pass + Host header behavior
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) — ACME flow + acme_ca + email
- [Caddy `protocols` option](https://caddyserver.com/docs/caddyfile/options#protocols) — disable HTTP/3
- [Caddy `admin` global option](https://caddyserver.com/docs/caddyfile/options#admin) — `admin off` syntax
- [Let's Encrypt staging endpoint](https://letsencrypt.org/docs/staging-environment/) — staging ACME directory URL

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 26 `deploy/docker-compose.yml` skeleton** — Phase 27 amend (เพิ่ม `caddy` service + `caddy_config` volume) ไม่ rewrite. YAML anchor `*default-logging` reuse ได้ทันที.
- **Phase 26 `deploy/.env.production.example`** — Phase 27 patch เพิ่ม 2 vars (ACME_EMAIL required, ACME_CA optional) ลง 2 sections เดิม
- **api recordings/minio.service.ts URL builders** — `getAvatarUrl()` + `getSnapshotUrl()` build URL pattern ที่ Caddy path-based proxy รองรับโดยตรง (เพราะ Phase 26 set `MINIO_PUBLIC_ENDPOINT=${DOMAIN}` + `MINIO_PUBLIC_PORT=443` ไว้แล้ว) — Phase 27 ไม่ต้องแก้ api code
- **api recordings/manifest.service.ts proxy URL** — recording HLS playback ผ่าน `/api/recordings/segments/<id>/proxy` (api streams) — pattern เดิมใช้ได้บน prod ทันที (Caddy `/api/*` matcher cover ครบ)
- **`config/srs.conf` bind mount pattern** (Phase 26 D-09 reuse) — `./Caddyfile:/etc/caddy/Caddyfile:ro` follows same relative-bind convention

### Established Patterns
- **Same-origin architecture** — frontend ไม่มี CORS handling เพราะ Phase 27 Caddy proxy ทุก path บน hostname เดียว. `apps/api/src/main.ts:22-29` CORS allowlist เก็บไว้สำหรับ dev เท่านั้น (localhost:3000/3002/3010); prod ไม่ activate.
- **Service DNS resolution** — Docker bridge network DNS (default 127.0.0.11) — Caddy reach `api:3003`, `web:3000`, `minio:9000` ผ่าน service name. Phase 26 D-05/D-06 architecture เป็น base.
- **Volume bind read-only** — `srs.conf:ro` (dev compose) + `Caddyfile:ro` (Phase 27) — config files ไม่ควรเขียนกลับ (defense-in-depth)
- **Health check `start_period`** — Phase 26 D-20 pattern; Caddy `start_period: 30s` (cert provisioning อาจช้า)

### Integration Points
- **Phase 26 (volumes/networks)** — Phase 27 attach `caddy_data` volume (ที่ declare ใน Phase 26) + เพิ่ม `caddy_config` volume + caddy service join `edge` + `internal` networks
- **Phase 28 (CI/CD GHCR)** — Caddy ไม่ build image (ใช้ official `caddy:2.11`); CI ไม่กระทบ Phase 27. แต่ Phase 27 verification step ใช้ `docker compose pull` (รวม caddy image pull) — กระทบ workflow.
- **Phase 29 (operator scripts)** — `bootstrap.sh` จะ chain: `init-secrets.sh` → `docker compose pull` → `docker compose up -d` → wait for caddy healthy → curl `https://${DOMAIN}` smoke. Phase 27 ส่ง healthcheck + DOMAIN-SETUP.md ให้ Phase 29 reference.
- **Phase 30 (smoke test on clean VM)** — Phase 27 + Phase 26 รวมกันเป็นโต้ตอบ DEPLOY-25/DEPLOY-26. Phase 27 D-24 verification = local-lab; Phase 30 = real VM + nmap.
- **Phase 28 GHCR pull cycle** — `docker compose pull` rotate api/web images; Caddy state (`caddy_data` + `caddy_config`) ไม่กระทบเพราะ Caddy image คนละ image. Persist verified Phase 27 D-24 #6.

</code_context>

<specifics>
## Specific Ideas

- **Caddy 2.11 minor pin** — get security patches อัตโนมัติภายใน v2.11 line; v2.12+ defer ทดสอบ v1.4 เพื่อ lock release surface ของ v1.3
- **Caddyfile path matchers ใช้ `handle` (mutually exclusive) ไม่ใช่ `route`** — Caddy 2.x recommended pattern; ลำดับ specific → catch-all เห็นชัดในไฟล์
- **`/socket.io/*` matcher single — cover ทุก namespace** — Socket.IO router ในส่วน api เป็นคนแยก namespace; Caddy ไม่ filter เพราะ namespace อยู่ใน query/auth ไม่ใช่ path
- **`acme_ca` env var pattern** — Caddyfile `acme_ca {$ACME_CA:default}` ใช้ Caddy native env interpolation; operator ไม่ต้อง edit Caddyfile (lock readonly)
- **Caddy admin off + restart-based reload** — v1.3 ไม่มี dynamic config requirement; restart pattern ตอบโจทย์ + ลด attack surface ก่อน Phase 30 nmap
- **HTTP/3 deferred** — h1+h2 พอสำหรับ camera dashboard workload; firewall surface เล็กกว่า
- **DOMAIN-SETUP.md ระดับ minimal** — ครอบ DNS + port 80 + propagation + staging toggle; provider walkthrough defer (outdate ตาม vendor UI)
- **Caddy ต้องอยู่ทั้ง edge + internal network** — เพื่อ resolve `minio:9000` ที่ internal-only ตาม Phase 26 D-06; constraint นี้ไม่ break security model เพราะ Caddy ไม่มี egress requirement บน internal

</specifics>

<deferred>
## Deferred Ideas

- **HTTP/3 (QUIC) บน 443/udp** — defer v1.4 ถ้า demand จริง; reversible (1 line + 1 port)
- **www.${DOMAIN} redirect** — apex only ใน v1.3; Phase 30+ ถ้า user feedback ขอ
- **Multi-domain / wildcard cert / DNS-01** — single hostname พอสำหรับ v1.3
- **Refactor `getAvatarUrl` / `getSnapshotUrl` ให้ใช้ relative paths** — same-origin URL pattern ทำงานได้ทันที; refactor optional ใน v1.4 (เก็บค่า MINIO_PUBLIC_PORT=443 ที่ Phase 26 set ไว้แทน)
- **Caddy hot-reload via admin API** — disabled in v1.3; restart-based reload เพียงพอ; revisit ถ้า dynamic routing requirement เกิดขึ้น
- **Rate limiting / WAF / bot protection** — Cloudflare/v1.4 territory; Caddy ecosystem มี caddy-ratelimit module แต่ defer
- **Comprehensive DOMAIN-SETUP** (provider walkthroughs, regional DNS) — defer; minimal doc พอ
- **Subdomain `cdn.${DOMAIN}` หรือ `media.${DOMAIN}` สำหรับ MinIO** — path-based เลือกแล้วใน Phase 27; subdomain pattern defer ถ้า future need (e.g., separate CDN provider)
- **Scope-limited WS matchers (filter cluster + srs-log ที่ Caddy)** — defer; defense-in-depth ทำที่ app layer (Better Auth session check) แล้ว
- **Caddy log rotation tuning** — default json-file 10m×5 (Phase 26 D-16) reuse; defer ถ้า log volume สูง
- **`tls.dns` provider plugins** (DNS-01) — DNS-01 ต้องการ DNS provider API token; defer ถ้า user ต้องการ wildcard cert ภายหลัง
- **Caddy metrics endpoint** (Prometheus exporter) — defer monitoring/observability ไป v1.4 milestone
- **Operator UX validation in init-secrets.sh** (warn empty ACME_EMAIL) — out of scope Phase 27; Phase 29 bootstrap.sh ค่อยเพิ่ม

</deferred>

---

*Phase: 27-caddy-reverse-proxy-auto-tls*
*Context gathered: 2026-04-28*
