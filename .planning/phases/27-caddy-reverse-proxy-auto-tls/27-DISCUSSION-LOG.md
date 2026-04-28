# Phase 27: Caddy Reverse Proxy + Auto-TLS - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 27-caddy-reverse-proxy-auto-tls
**Areas discussed:** MinIO public proxy, Staging-CA toggle, HTTP/3 policy, DOMAIN-SETUP scope, ACME email, WebSocket matcher scope, Caddy admin API, www-handling

---

## MinIO public path proxy

| Option | Description | Selected |
|--------|-------------|----------|
| Path-based same-origin | Caddy matchers `/avatars/*` + `/snapshots/*` → minio:9000; ตรงกับ MINIO_PUBLIC_PORT=443 ของ Phase 26 | ✓ |
| Subdomain (cdn/media) | `cdn.${DOMAIN}` → minio:9000; ต้องเพิ่ม DNS A-record + cert + update getAvatarUrl/getSnapshotUrl | |
| Refactor api stream proxy | api stream avatars/snapshots; ไม่ expose MinIO เลย; เพิ่ม load + code change นอก scope | |
| Defer (BLOCKER risk) | ไม่ proxy MinIO ใน Phase 27 — avatars + snapshots 404 บน prod | |

**User's choice:** Path-based same-origin
**Rationale:** ตรงกับ Phase 26 D-07 ที่ set `MINIO_PUBLIC_PORT=443` ไว้แล้ว — ไม่ต้อง refactor api code, ไม่ต้องเพิ่ม DNS/cert surface, แก้ BLOCKER สำหรับ profile picture + camera thumbnail บน prod

---

## Staging-CA toggle mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Env var ACME_CA | Caddyfile `acme_ca {$ACME_CA:https://acme-v02...}`; native syntax 1-line toggle | ✓ |
| Bool flag CADDY_USE_STAGING | เป็น true/false flag + conditional snippet ใน Caddyfile | |
| Separate Caddyfile.staging | 2 ไฟล์ + compose override; sync diff manual | |

**User's choice:** Env var ACME_CA
**Rationale:** Native Caddy syntax, 1 บรรทัด, operator ไม่ต้อง edit Caddyfile (lock read-only), DOMAIN-SETUP.md อธิบายการใช้

---

## HTTP/3 (QUIC) policy

| Option | Description | Selected |
|--------|-------------|----------|
| Disable | Global `protocols h1 h2`; expose แค่ 80/tcp + 443/tcp; firewall + nmap surface เล็ก | ✓ |
| Enable | Caddy default; expose 443:443/udp; perf ดีกว่า แต่เพิ่ม firewall + troubleshoot UDP | |

**User's choice:** Disable
**Rationale:** v1.3 self-hosted minimal; Phase 30 nmap port lockdown surface เล็กกว่า; reversible ภายหลัง (1 line + 1 port)

---

## DOMAIN-SETUP.md scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal | ~1 page focused: DNS A-record, port 80, propagation, staging toggle | ✓ |
| Comprehensive | ~3-5 pages: provider walkthroughs (Cloudflare/Route53/Namecheap), troubleshooting, regional DNS | |

**User's choice:** Minimal
**Rationale:** Operator-facing focus on essentials; provider walkthrough outdate ตาม vendor UI; Phase 29 README link เพิ่ม context ภายหลัง

---

## ACME contact email

| Option | Description | Selected |
|--------|-------------|----------|
| Env var ACME_EMAIL | Required ใน .env.production.example; Let's Encrypt renewal warnings active | ✓ |
| Hardcode anonymous | ไม่ส่ง email; bootstrap simpler แต่ไม่ได้ renewal warnings | |

**User's choice:** Env var ACME_EMAIL
**Rationale:** Operator ควรได้รับ renewal warnings จาก Let's Encrypt; bootstrap ไม่กระทบ (1 var เพิ่มใน .env)

---

## WebSocket matcher scope

| Option | Description | Selected |
|--------|-------------|----------|
| All 4 via /socket.io/* | Cover notifications + camera-status + cluster + srs-log; Socket.IO router แยก namespace ใน api | ✓ |
| จำกัดเฉพาะ notifications + camera-status | Block cluster + srs-log ที่ Caddy; ต้อง inspect handshake header — ซับซ้อน + เสี่ยง break | |

**User's choice:** All 4 via /socket.io/*
**Rationale:** Defense-in-depth ทำที่ app layer (Better Auth session check ใน gateway) แล้ว; Caddy matcher simple = stable; Socket.IO namespace อยู่ใน query/auth ไม่ใช่ path

---

## Caddy admin API

| Option | Description | Selected |
|--------|-------------|----------|
| Disable | Global `admin off`; เพิ่ม security; reload ผ่าน docker compose restart | ✓ |
| Loopback only | Default 127.0.0.1:2019; future hot-reload พร้อม | |

**User's choice:** Disable
**Rationale:** v1.3 ไม่มี dynamic config requirement; ลด attack surface สอดคล้อง Phase 30 nmap; restart-based reload เพียงพอ

---

## www.${DOMAIN} handling

| Option | Description | Selected |
|--------|-------------|----------|
| Apex only, ignore www | site block = `${DOMAIN}` เท่านั้น; spec บอก single hostname | ✓ |
| Auto-redirect www → apex | เพิ่ม www site block; ต้อง DNS A-record + cert + Phase 30 verify 2 hostnames | |

**User's choice:** Apex only
**Rationale:** v1.3 spec single hostname; ลด ops surface; user feedback ภายหลัง add ได้ (1 site block)

---

## Claude's Discretion (deferred to planner)

- Caddyfile indentation + comment density
- Healthcheck timing tuning (`interval`, `timeout`)
- Wget vs curl ใน healthcheck (Caddy alpine มี wget)
- Caddy logging format (default JSON พอ)
- Compose service order (caddy หลัง web — readability)
- Health endpoint path (`/` ตอบ 308 พอ)
- ลำดับ Caddyfile matchers (specific → catch-all)

## Deferred Ideas

- HTTP/3 enable ภายหลัง (1 line + 1 port reversible)
- www.${DOMAIN} redirect (1 site block)
- Subdomain CDN pattern (`cdn.${DOMAIN}`)
- Refactor api avatar/snapshot URLs ให้ใช้ relative paths
- Caddy hot-reload + admin API
- Rate limiting / WAF
- Comprehensive DOMAIN-SETUP (provider walkthroughs)
- DNS-01 provider plugins (wildcard cert)
- Caddy Prometheus exporter
- ACME_EMAIL validation ใน init-secrets.sh
- Scope-limited WS matchers (filter cluster + srs-log)

---

*Phase: 27-caddy-reverse-proxy-auto-tls*
*Discussion completed: 2026-04-28*
