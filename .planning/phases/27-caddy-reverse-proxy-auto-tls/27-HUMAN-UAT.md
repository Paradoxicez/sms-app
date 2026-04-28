---
status: partial
phase: 27-caddy-reverse-proxy-auto-tls
source: [27-VERIFICATION.md]
started: 2026-04-28T08:30:00Z
updated: 2026-04-28T08:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live Let's Encrypt cert issuance on real DNS
expected: First `docker compose up -d` (with DOMAIN A-record + port 80 reachable) produces a valid LE cert within 60s; `https://${DOMAIN}` loads web; `http://${DOMAIN}` 308-redirects to HTTPS
result: [pending — Phase 30 clean-VM cluster smoke]

### 2. Live wss:// upgrade through caddy to NotificationsGateway + StatusGateway
expected: `curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Key: ...' -H 'Sec-WebSocket-Version: 13' https://${DOMAIN}/socket.io/?EIO=4&transport=websocket` returns HTTP/1.1 101 Switching Protocols; logging into the deployed app and triggering a camera status change delivers events via NotificationsGateway and StatusGateway end-to-end
result: [pending — Phase 30 clean-VM cluster smoke]

### 3. Cert persistence across docker compose down/up
expected: After first `up` produces a valid cert, `docker compose down && docker compose up -d` does NOT trigger ACME re-issuance (`docker compose logs caddy | grep -c 'certificate obtained'` = 0 on second boot)
result: [pending — Phase 30 clean-VM cluster smoke]

### 4. Re-run `bash deploy/scripts/verify-phase-27.sh` on healthy Docker host
expected: Exit 0; output ends with `All N static checks passed.`; checkpoints [1/4] compose config + [2/4] caddy validate both PASS in addition to the structural greps
result: [pending — Phase 30 clean-VM cluster smoke]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
