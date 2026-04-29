---
status: partial
phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli
source: [29-VERIFICATION.md]
started: 2026-04-28
updated: 2026-04-29
---

## Current Test

[testing paused — 2 items deferred to v1.3.x ops cycle (update.sh, backup-restore round-trip)]

## Tests

### 1. SC #2 — Cold deploy <10-minute wall-clock claim on fresh VM
expected: On a fresh DigitalOcean/Hetzner Ubuntu 22.04 droplet (4GB RAM, Docker pre-installed), `bash deploy/scripts/bootstrap.sh` completes pre-flight + auto-secrets + image pull + sms-migrate + create-admin + HTTPS poll within 10 minutes wall-clock; bootstrap.sh's D-12 ELAPSED log records the actual seconds and the HTTPS endpoint returns 200 on /api/health
result: pass
evidence: |
  Hetzner Ubuntu 22.04 / 4 vCPU / 8 GB RAM. ELAPSED=161s after the 18 inline runtime
  fixes from Phase 30 (commits 6f7b323..d74b9a4). curl https://stream.magichouse.in.th/api/health
  returned 200 immediately after bootstrap exit.

### 2. SC #1 — bin/sms create-admin runtime correctness against live DB
expected: `docker compose exec api bin/sms create-admin --email <e> --password <p>` exits 0; the user can log in via Better Auth at the deployed URL using the same credentials; re-running with the same email exits 1 with 'already exists' message; re-running with --force rotates the credential.password column without changing user.id, member.id, or role
result: pass
evidence: |
  First run: super-admin created (id super-admin-1777443440711). Login succeeded with
  Better Auth — __Secure-better-auth session cookie set, dashboard loaded.
  Subsequent re-runs hit "already exists" → bootstrap.sh's --force fallback rotated
  the password without disturbing user.id (verified via SELECT before/after).

### 3. SC #3 — update.sh atomic recycle without dropping in-flight requests beyond grace period
expected: On a running stack at v1.3.0, `bash deploy/scripts/update.sh v1.3.1` switches IMAGE_TAG, runs pre-flight migrate against new image, recycles services in dependency order (postgres → redis → minio → migrate → api → web → caddy), and curl probes against /api/health succeed within configured Caddy grace period (no requests dropped for >5s)
result: blocked
blocked_by: release-build
reason: |
  No v1.3.1 (or v1.3.0-rc) tag was built during the smoke run — the deploy used `:latest`
  rebuilt from `main` after each fix. Defer this test to the first real patch release;
  add it to the Phase 30 v1.3.1 carry-forward backlog.

### 4. SC #4 — backup.sh + restore.sh byte-equivalent round-trip
expected: On a populated stack `bash deploy/scripts/backup.sh` produces sms-backup-<UTC-ts>.tar.gz; `bash deploy/scripts/restore.sh <archive> --yes` rebuilds; SELECT counts on User/Organization/Member/Camera/Recording match pre-backup; MinIO bucket object lists match (avatars/recordings/snapshots); Caddy serves HTTPS without re-issuing cert (caddy_data preserved)
result: blocked
blocked_by: prior-phase
reason: |
  Defer to first ops cycle once the deploy has real tenant data worth backing up.
  Smoke-run dataset is the seeded super-admin + 7 test cameras + ~minutes of HLS
  segments — restore round-trip would not exercise the full backup envelope.

### 5. SC #5 — README quickstart end-to-end on fresh VM
expected: A first-time operator follows deploy/README.md Quickstart steps 1-5 verbatim (clone → cp .env → fill DOMAIN/ADMIN_EMAIL/GHCR_ORG → bash bootstrap.sh → login at https://DOMAIN) and reaches a logged-in super-admin session without consulting any other doc; SMOKE-TEST-LOG.md captures the elapsed seconds + any drift between docs and live behavior
result: issue
reported: |
  README walked through cleanly modulo eighteen wiring bugs that bootstrap.sh exposed
  on the first real-VM run. README itself accurate; the bugs were Phase 24-29 verifier
  blind spots (env-var name mismatches, host.docker.internal callbacks, prisma engines
  missing from prod-deps). All eighteen fixed inline (commits 6f7b323..d74b9a4) and
  documented in deploy/SMOKE-TEST-LOG.md Drift section. README itself needs only one
  follow-up: add a DNS-propagation warning for `.in.th` / `.co.th` zones (queued as
  drift entry #20).
severity: minor

## Summary

total: 5
passed: 2
issues: 1
pending: 0
skipped: 0
blocked: 2

## Gaps

- truth: "First-time operator can follow deploy/README.md verbatim and reach a working super-admin session"
  status: failed
  reason: "README accurate but the runtime path it describes had 18 latent wiring bugs; all fixed inline 2026-04-29 — see deploy/SMOKE-TEST-LOG.md"
  severity: minor
  test: 5
  root_cause: "Phase 24-29 verifiers checked static contracts only; never executed the live bootstrap end-to-end"
  artifacts:
    - path: "deploy/SMOKE-TEST-LOG.md"
      issue: "Drift section #1-#18 enumerates each fix"
  missing:
    - "v1.4 must add live-runtime verifiers to verify-deploy.sh — not just `compose config` / `bash -n` static checks"
    - "deploy/README.md needs a DNS-propagation warning (drift #20)"
  debug_session: "deploy/SMOKE-TEST-LOG.md (no separate debug doc — fixes shipped on main directly)"
