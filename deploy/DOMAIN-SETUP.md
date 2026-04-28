# Domain Setup — SMS Platform Production Deploy

This document covers the DNS + ACME prerequisites for Phase 27's Caddy reverse proxy. Read this BEFORE running `docker compose up -d` for the first time. Companion files:
- `deploy/.env.production.example` — env vars referenced below.
- `deploy/Caddyfile` — Caddy site config (read-only at runtime).
- `deploy/scripts/verify-phase-27.sh` — static validator (run after editing env).

## DNS A-Record

Point `${DOMAIN}` (the apex hostname you set in `deploy/.env`) at the host's public IPv4 address.

```
A    example.com    →    1.2.3.4
```

Set TTL to 300s during initial setup so corrections propagate quickly. After the cert is stable, raise TTL to 3600s+.

Verify before bringing the stack up:
```
dig +short example.com
# → expected: 1.2.3.4
```

If `dig` returns nothing or the wrong IP, fix the DNS record and wait for propagation (see §3) before proceeding.

Before the first `up`, also confirm `ACME_EMAIL` is set in `deploy/.env` — Caddy uses it to register the Let's Encrypt account that owns the cert. Empty `ACME_EMAIL` works (anonymous account) but you'll miss expiry-warning emails from Let's Encrypt.

## Port 80 Reachability

Caddy uses Let's Encrypt's HTTP-01 challenge. Inbound TCP/80 from the public internet MUST be open on the host — even though all production user traffic is on TCP/443, the ACME challenge cannot complete without :80.

Common firewall checks:
- Cloud provider security group / network ACL: allow 0.0.0.0/0 → TCP 80 + 443.
- Host-level ufw / firewalld: `sudo ufw allow 80/tcp; sudo ufw allow 443/tcp`.
- Docker port mapping: `deploy/docker-compose.yml` already publishes `80:80` + `443:443` from the caddy service (Phase 27 plan 27-02).

**Cloudflare users:** during the FIRST cert issuance, set the DNS record to "DNS only" (gray cloud) — Cloudflare's orange-cloud proxy intercepts port 80 and breaks the HTTP-01 challenge. After Caddy logs `certificate obtained successfully` (see §4 below for how to check), you may flip the proxy back to orange (proxied) — Caddy will continue serving the existing cert and renew transparently via stored ACME account state in the `caddy_data` volume.

Verify port 80 is reachable from outside the host (run from a machine that is NOT on the same LAN):
```
curl -v http://example.com
# → expect: connection succeeds; once Caddy is up, expect HTTP/1.1 308 Permanent Redirect → https://example.com
```

## Propagation Expectations

DNS changes are not instant. Expect 1-15 minutes for typical providers, longer (up to TTL of the previous record) if you've just lowered TTL.

Verify propagation from multiple resolvers:
```
dig +short example.com @8.8.8.8       # Google
dig +short example.com @1.1.1.1       # Cloudflare
dig +short example.com @9.9.9.9       # Quad9
```

All three should return the same IP. If they disagree, wait for propagation. The free https://dnschecker.org tool gives a worldwide view.

Until propagation completes, the ACME HTTP-01 challenge will fail with a `connection refused` or `timeout` error in `docker compose logs caddy`. Do NOT keep retrying — Let's Encrypt's failed-validation rate limit is **5 per hostname per hour**. Use the staging CA (§4) for debug.

## Staging-CA Toggle

If you need to retry cert issuance multiple times (debugging DNS or firewall), switch Caddy to Let's Encrypt's staging environment. Staging has a 30,000 cert/account/week limit — effectively no rate-limit risk during debug.

In `deploy/.env`:
```
ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory
```

Then restart caddy:
```
docker compose -f deploy/docker-compose.yml --env-file deploy/.env restart caddy
```

Verify the staging cert was issued — your browser will show a security warning ("Fake LE" issuer is normal for staging):
```
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs caddy --since 60s | grep -i "certificate obtained"
# → expected: a "certificate obtained successfully" line
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null | openssl x509 -noout -issuer
# → expected: issuer line containing "Fake LE"
```

Once your DNS / firewall is verified, switch to production CA:
1. Edit `deploy/.env` and set `ACME_CA=` (empty value).
2. Stop caddy and DELETE the staging cert state so a fresh prod cert can issue:
   ```
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env stop caddy
   docker volume rm sms-platform_caddy_data sms-platform_caddy_config
   ```
   (volume names: `<project>_caddy_data` — `sms-platform` is the compose project name from `name: sms-platform` in docker-compose.yml).
3. Start caddy:
   ```
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d caddy
   ```
4. Watch logs for `certificate obtained successfully` from `https://acme-v02.api.letsencrypt.org/directory` (NOT staging).

## Common Errors

| Caddy log message | Likely cause | Fix |
|---|---|---|
| `certificate obtained successfully` followed by `Fake LE` issuer in browser | `ACME_CA` is set to staging URL | Empty `ACME_CA` in `.env` + drop `caddy_data` volume + restart (see §4) |
| `dial tcp ... :80: connect: connection refused` | Port 80 not reachable from internet | Open TCP 80 in firewall / cloud security group; verify Cloudflare gray-cloud (§2) |
| `lookup example.com: no such host` / `NXDOMAIN` | DNS A-record missing or not propagated | Verify with `dig +short ${DOMAIN}` from multiple resolvers (§3) |
| `urn:ietf:params:acme:error:rateLimited` / `429 Too Many Requests` | Hit Let's Encrypt rate limit (5 failed validations/hr OR 5 dup certs/wk) | Switch to staging CA (§4); wait for limit to reset |
| `caddy: dial tcp: lookup minio on 127.0.0.11:53: no such host` | Caddy not on `internal` network | Verify `deploy/docker-compose.yml` caddy service has BOTH `edge` AND `internal` in its `networks:` list (Phase 27 plan 27-02 D-17) |
| `Caddyfile:N: env var DOMAIN unset` or empty site address | `DOMAIN=` not set in `.env` before `up` | Edit `deploy/.env`, set `DOMAIN=example.com`, then `docker compose up -d` (Pitfall 7) |
| Mixed-content blocked: `http://example.com/avatars/...` in browser console | `MINIO_PUBLIC_URL` not set in `.env` | Set `MINIO_PUBLIC_URL=https://${DOMAIN}` in `deploy/.env`, restart api: `docker compose restart api` (Phase 27 plan 27-03/04) |

For deeper Caddy issues, see the [Caddy automatic HTTPS docs](https://caddyserver.com/docs/automatic-https) and [Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/).

End-to-end smoke (Phase 30 territory — requires real DNS):
- `curl -kIL http://${DOMAIN}` → HTTP/1.1 308 Permanent Redirect → `https://${DOMAIN}`
- `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" -H "Sec-WebSocket-Version: 13" "https://${DOMAIN}/socket.io/?EIO=4&transport=websocket"` → HTTP/1.1 101 Switching Protocols
- `docker compose down && docker compose up -d` → second boot logs MUST NOT contain `certificate obtained` (cert reused from `caddy_data` volume).
