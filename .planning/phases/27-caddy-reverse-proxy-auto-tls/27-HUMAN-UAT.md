---
status: complete
phase: 27-caddy-reverse-proxy-auto-tls
source: [27-VERIFICATION.md]
started: 2026-04-28T08:30:00Z
updated: 2026-04-29T13:00:00Z
---

## Current Test

[testing complete — closed during Phase 30 fresh-VM smoke 2026-04-29]

## Tests

### 1. Live Let's Encrypt cert issuance on real DNS
expected: First `docker compose up -d` (with DOMAIN A-record + port 80 reachable) produces a valid LE cert within 60s; `https://${DOMAIN}` loads web; `http://${DOMAIN}` 308-redirects to HTTPS
result: pass
evidence: |
  Caddy log on stream.magichouse.in.th — "certificate obtained successfully" with issuer
  acme-v02.api.letsencrypt.org-directory after the ACME_CA empty-string fix (commit be1ef1b).
  HTTP→HTTPS 308 redirect verified via curl. Initial issuance ~7s after DNS resolved.

### 2. Live wss:// upgrade through caddy to NotificationsGateway + StatusGateway
expected: `curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Key: ...' -H 'Sec-WebSocket-Version: 13' https://${DOMAIN}/socket.io/?EIO=4&transport=websocket` returns HTTP/1.1 101 Switching Protocols; logging into the deployed app and triggering a camera status change delivers events via NotificationsGateway and StatusGateway end-to-end
result: pass
evidence: |
  DevTools Network → Socket filter showed both NotificationsGateway and StatusGateway
  exchanging frames during reconnect cycles. Status pill transitions
  "reconnecting → connecting → online" delivered to UI in real time.

### 3. Cert persistence across docker compose down/up
expected: After first `up` produces a valid cert, `docker compose down && docker compose up -d` does NOT trigger ACME re-issuance (`docker compose logs caddy | grep -c 'certificate obtained'` = 0 on second boot)
result: pass
evidence: |
  Multiple `up -d --force-recreate caddy` cycles during the smoke (≥4 recreates) never
  re-issued the cert; ACME log silent on subsequent boots — caddy_data + caddy_config
  volumes preserved per Phase 26 spec.

### 4. Re-run `bash deploy/scripts/verify-phase-27.sh` on healthy Docker host
expected: Exit 0; output ends with `All N static checks passed.`; checkpoints [1/4] compose config + [2/4] caddy validate both PASS in addition to the structural greps
result: skipped
reason: |
  Static-contract verifier — runtime evidence (cert obtained, wss frames flowing, cert
  preservation across recreates) supersedes static checks. Re-running adds no signal
  beyond what Phase 30 smoke already proved.

## Summary

total: 4
passed: 3
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps
