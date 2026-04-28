---
status: partial
phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli
source: [29-VERIFICATION.md]
started: 2026-04-28
updated: 2026-04-28
---

## Current Test

[awaiting human testing — Phase 30 DEPLOY-25 fresh-VM smoke test is the acceptance gate]

## Tests

### 1. SC #2 — Cold deploy <10-minute wall-clock claim on fresh VM
expected: On a fresh DigitalOcean/Hetzner Ubuntu 22.04 droplet (4GB RAM, Docker pre-installed), `bash deploy/scripts/bootstrap.sh` completes pre-flight + auto-secrets + image pull + sms-migrate + create-admin + HTTPS poll within 10 minutes wall-clock; bootstrap.sh's D-12 ELAPSED log records the actual seconds and the HTTPS endpoint returns 200 on /api/health
result: [pending]

### 2. SC #1 — bin/sms create-admin runtime correctness against live DB
expected: `docker compose exec api bin/sms create-admin --email <e> --password <p>` exits 0; the user can log in via Better Auth at the deployed URL using the same credentials; re-running with the same email exits 1 with 'already exists' message; re-running with --force rotates the credential.password column without changing user.id, member.id, or role
result: [pending]

### 3. SC #3 — update.sh atomic recycle without dropping in-flight requests beyond grace period
expected: On a running stack at v1.3.0, `bash deploy/scripts/update.sh v1.3.1` switches IMAGE_TAG, runs pre-flight migrate against new image, recycles services in dependency order (postgres → redis → minio → migrate → api → web → caddy), and curl probes against /api/health succeed within configured Caddy grace period (no requests dropped for >5s)
result: [pending]

### 4. SC #4 — backup.sh + restore.sh byte-equivalent round-trip
expected: On a populated stack `bash deploy/scripts/backup.sh` produces sms-backup-<UTC-ts>.tar.gz; `bash deploy/scripts/restore.sh <archive> --yes` rebuilds; SELECT counts on User/Organization/Member/Camera/Recording match pre-backup; MinIO bucket object lists match (avatars/recordings/snapshots); Caddy serves HTTPS without re-issuing cert (caddy_data preserved)
result: [pending]

### 5. SC #5 — README quickstart end-to-end on fresh VM
expected: A first-time operator follows deploy/README.md Quickstart steps 1-5 verbatim (clone → cp .env → fill DOMAIN/ADMIN_EMAIL/GHCR_ORG → bash bootstrap.sh → login at https://DOMAIN) and reaches a logged-in super-admin session without consulting any other doc; SMOKE-TEST-LOG.md captures the elapsed seconds + any drift between docs and live behavior
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
