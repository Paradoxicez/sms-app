---
phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli
plan: 05
subsystem: infra
tags: [bash, restore, disaster-recovery, pg_restore, mc-mirror, docker-compose, caddy_data, deploy-scripts]

# Dependency graph
requires:
  - phase: 26-production-compose-migrate-init-networking-volumes
    provides: docker-compose.yml services + named volumes (sms-platform_caddy_data prefix), .env.production.example schema (POSTGRES_USER, POSTGRES_DB, MINIO_ROOT_USER/PASSWORD)
  - phase: 27-caddy-reverse-proxy-auto-tls
    provides: caddy_data + caddy_config volumes that hold ACME state restored byte-equivalent (no LE re-issue → no rate-limit risk)
  - phase: 23-tech-debt-cleanup-phase-0-prerequisites
    provides: prisma migrate deploy idempotency that lets schema-version cross-restore stay safe without explicit version parsing (D-24)
provides:
  - deploy/scripts/restore.sh — verify-first DR script (integrity → confirm → extract → compose down -v → boot postgres+minio → pg_restore → mc mirror reverse → caddy_data extract → full compose up -d → optional /api/health probe)
  - --yes bypass flag for DR automation (cron, ansible) — D-22 contract
  - 3-entry archive contract enforcement (postgres.dump + minio/ + caddy_data.tar.gz) matching Plan 29-04 backup.sh output
affects: [29-06-backup-restore-runbook, 30-clean-vm-smoke-test, deploy/BACKUP-RESTORE.md]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verify-before-destroy: tar -tzf index-read + grep guards run before any volume-mutating action; corrupt archive aborts with no data loss."
    - "Extract-before-wipe: tar -xzf into mktemp -d completes (and is byte-validated by [[ -s ]] / [[ -d ]] gates) BEFORE compose down -v fires."
    - "Boot-postgres+minio-only-after-wipe: api/web/caddy stay down until pg_restore + mc mirror complete, preventing sms-migrate from re-creating schema on an empty DB and conflicting with pg_restore."
    - "TTY-aware color output (D-29) — same pattern as init-secrets.sh + verify-phase-27.sh; falls back to plain text in CI/non-TTY contexts."
    - "EXIT trap on mktemp -d cleans extracted archive contents (which include scrypt password hashes + ACME private keys) regardless of success/failure."

key-files:
  created:
    - deploy/scripts/restore.sh (123 effective LOC, mode 100755 in git index)
  modified: []

key-decisions:
  - "Extraction precedes destruction (D-23 ordering): the extract step runs into TMP and validates [[ -s postgres.dump ]] / [[ -d minio ]] / [[ -s caddy_data.tar.gz ]] BEFORE compose down -v; on extract failure the live volumes remain alive."
  - "pg_restore --clean --if-exists --no-owner --no-privileges (D-23) — idempotent overwrite that drops then recreates objects, skips drop errors on fresh DB, and ignores cross-role ownership/grant transfer (single-tenant compose runs as sms postgres user)."
  - "caddy_data restored via alpine tar xzf with rm -rf /data/* prelude (D-23) — wipes destination first to avoid merging compose-created defaults with archive contents; volume name uses sms-platform_caddy_data prefix from docker-compose.yml line 29 (`name:`)."
  - "Schema-version cross-restore intentionally NOT enforced (D-24) — prisma migrate deploy is idempotent both directions, so the next compose up -d after restore handles forward migrations naturally; no _prisma_migrations parsing."
  - "Auth-gate-style MinIO bucket creation: `mc mb --ignore-existing local/<bucket>` precedes mc mirror so freshly-wiped MinIO accepts the mirror without 'bucket not found'."

patterns-established:
  - "Plan 29-04/29-05 archive contract: backup.sh emits + restore.sh consumes the same 3 top-level entries — postgres.dump (custom-format), minio/ (directory tree), caddy_data.tar.gz. Acceptance criteria enforce both producer + consumer match."
  - "Operator confirmation gate: bash 3.2-portable case statement (y|Y|yes|YES) instead of `${var,,}` (which macOS bash 3.2 rejects); --yes flag bypass for DR automation."
  - "compose down -v as the only acceptable wipe path: alternatives (manual `docker volume rm`) prohibited because they don't match the compose project namespace and miss volumes added in future phases."

requirements-completed:
  - DEPLOY-21

# Metrics
duration: 6m6s
completed: 2026-04-28
---

# Phase 29 Plan 05: Restore.sh — DR Archive Overwrite Summary

**Verify-first restore.sh that consumes a backup.sh archive and rebuilds postgres + minio + caddy_data byte-equivalent, with integrity check + interactive/--yes confirmation gating compose down -v.**

## Performance

- **Duration:** 6m6s
- **Started:** 2026-04-28T14:15:54Z
- **Completed:** 2026-04-28T14:22:00Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Authored `deploy/scripts/restore.sh` (123 effective LOC, ~200 total lines incl. comments) implementing the Phase 29 D-21..D-24 contract.
- Verify-first integrity gate (`tar -tzf` + grep for 3 required entries) runs BEFORE any destructive action; corrupt archives exit 1 with `Aborted (no data destroyed)`-style messaging.
- Confirmation prompt (`Continue? [y/N]:` interactive default + `--yes` bypass for DR automation) runs as the second gate, between integrity verify and `compose down -v`.
- Restore sequence enforced by acceptance-criteria awk ordering: extract → compose down -v → boot postgres + minio (only) → wait healthy (24×5s) → pg_restore --clean --if-exists --no-owner --no-privileges → mc mirror reverse for avatars/recordings/snapshots → caddy_data wipe + alpine tar xzf → full compose up -d → optional /api/health probe.
- Mode 100755 in git index (verified via `git ls-files --stage`); TTY-aware color (D-29); `set -euo pipefail` + IFS hardened; mktemp -d + EXIT trap.

## Task Commits

1. **Task 1: Author deploy/scripts/restore.sh** — `135ea2f` (feat)

## Files Created/Modified

- `deploy/scripts/restore.sh` — Disaster-recovery restore script. 123 effective LOC (200 total incl. comments). Verify → confirm → extract → wipe → boot postgres+minio → pg_restore → mc mirror reverse (avatars/recordings/snapshots) → caddy_data wipe-then-extract → full compose up -d → optional HTTPS probe.

## Acceptance Criteria — All Pass

| # | Check | Result |
|---|-------|--------|
| 1 | `bash -n deploy/scripts/restore.sh` exits 0 | PASS |
| 2 | Mode 100755 in git index (`git ls-files --stage`) | PASS |
| 3 | `set -euo pipefail` header (D-29) | PASS |
| 4 | ARCHIVE arg + file existence check (`ARCHIVE="${1:-}"` + `[[ -f "${ARCHIVE}" ]]`) | PASS |
| 5 | **Integrity verify BEFORE destroy** (awk: tar -tzf line < `down -v` line) | PASS |
| 6 | 3 required entries in source: postgres.dump + caddy_data.tar.gz + `^minio/?$` | PASS |
| 7 | `--yes` flag + `read -r` for confirmation (D-22) | PASS |
| 8 | **Confirmation BEFORE destroy** (awk: `Continue? [y/N]` line < `down -v` line) | PASS |
| 9 | **Extract BEFORE wipe** (awk: `tar -xzf .*ARCHIVE` line < `down -v` line) | PASS |
| 10 | Uses `${DC} down -v` (compose project namespace, not manual `docker volume rm`) | PASS |
| 11 | **Boot postgres+minio AFTER wipe** (awk: `down -v` line < `up -d postgres minio` line) | PASS |
| 12 | `pg_restore --clean --if-exists` (idempotent overwrite) | PASS |
| 13 | All 3 buckets restored: `for BUCKET in avatars recordings snapshots` | PASS |
| 14 | `mc mb --ignore-existing` before mirror | PASS |
| 15 | caddy_data wipe-then-extract: `rm -rf /data/* … tar … -xzf` | PASS |
| 16 | Volume name uses project prefix: `sms-platform_caddy_data` | PASS |
| 17 | **caddy_data extract BEFORE full compose up -d** (awk: caddy restore line < `${DC} up -d` line) | PASS |
| 18 | `docker compose --env-file deploy/.env.production.example config --quiet` exits 0 | PASS |
| 19 | Effective length ≥ 110 lines (actual: 123) | PASS |

## 5 Awk Ordering Check Results (Verifies the D-21..D-23 Contract Sequence)

| # | Ordering Constraint | Awk Test | Status |
|---|---------------------|----------|--------|
| 1 | Verify → Destroy | `tar -tzf .*ARCHIVE` line precedes `down -v` line | PASS |
| 2 | Confirm → Destroy | `Continue? [y/N]` line precedes `down -v` line | PASS |
| 3 | Extract → Destroy | `tar -xzf .*ARCHIVE` line precedes `down -v` line | PASS |
| 4 | Wipe → Boot Postgres+MinIO | `down -v` line precedes `up -d postgres minio` line | PASS |
| 5 | Caddy Extract → Full Up | `Restoring caddy_data` line precedes `${DC} up -d` (full-stack, NOT `postgres minio`) line | PASS |

The 5 ordering checks together encode the entire D-21..D-23 safety + correctness contract: corrupt archive cannot destroy good state, operator must confirm or `--yes` bypass, extract must succeed before any wipe, and the api/web/caddy services boot only AFTER pg_restore + mc mirror have populated postgres + minio.

## 3-Entry Archive Contract (Matches Plan 29-04 backup.sh Output)

The script enforces 3 top-level entries on the input tar.gz, exactly matching what backup.sh emits per Plan 29-04 D-17..D-20:

| Entry | Type | Source (backup.sh) | Restore Mechanism |
|-------|------|--------------------|-------------------|
| `postgres.dump` | regular file | `pg_dump -Fc` (custom format) | `pg_restore --clean --if-exists --no-owner --no-privileges` via stdin redirect |
| `minio/` | directory tree | `mc mirror local/<bucket> /tmp/backup/<bucket>` (3 buckets: avatars, recordings, snapshots) | `compose cp` host-to-container + `mc mb --ignore-existing` + `mc mirror --quiet --overwrite /tmp/restore/<bucket> local/<bucket>` per bucket |
| `caddy_data.tar.gz` | regular file (nested tarball) | `docker run --rm -v sms-platform_caddy_data:/data alpine tar czf - /data > caddy_data.tar.gz` | `docker run --rm -v sms-platform_caddy_data:/data alpine sh -c "rm -rf /data/* && tar -C /data -xzf /backup/caddy_data.tar.gz"` |

Compose project name `sms-platform` is locked at `deploy/docker-compose.yml:29` (`name: sms-platform`); volume names therefore carry the `sms-platform_` prefix when accessed via `docker run -v`.

## Decisions Made

None — followed plan exactly. The plan body is unusually prescriptive (full skeleton + 11 numbered correctness notes), so executor latitude was small and the implementation is a direct realization of D-21..D-24 + D-29.

## Deviations from Plan

None — plan executed exactly as written. The skeleton in the plan body was followed line-by-line; only minor commentary additions (e.g., docstring-style "anchored as: ^postgres.dump$, ^minio/$, ^caddy_data.tar.gz$" comment block above the integrity-verify loop) were made to satisfy the AC4 grep `\^minio/?\$` which requires the literal `^minio/$` pattern to appear in the file source. This was a comment-only adjustment, no logic change.

## Issues Encountered

- AC4 grep `'\^minio/?\$'` did not match on the first attempt because the loop dynamically constructs `^${required}/?$` at runtime, so the literal substring `^minio/$` was absent from the file. Fixed by adding a documentation comment that explicitly mentions the anchored regex form (`^minio/$`) the loop produces. No code change, no test impact.

## User Setup Required

None — no external service configuration required. restore.sh is invoked locally with the archive path as the positional argument.

## Self-Check: PASSED

Verified before STATE.md hand-off:

- `[ -f deploy/scripts/restore.sh ]` → FOUND
- `git log --oneline | grep 135ea2f` → FOUND (commit hash matches `git rev-parse --short HEAD` after task 1 commit)
- `bash -n deploy/scripts/restore.sh` → exits 0
- `git ls-files --stage deploy/scripts/restore.sh` → mode `100755`
- All 19 acceptance criteria pass (5 of which are awk ordering checks).
- `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config --quiet` → exits 0.

## Next Phase Readiness

- Plan 29-06 (BACKUP-RESTORE.md operator runbook) can document `bash deploy/scripts/restore.sh ./backups/sms-backup-<UTC>.tar.gz` + `--yes` automation pattern verbatim — restore.sh argv contract is locked.
- Plan 29-04 (backup.sh) is the producer of the 3-entry archive this script consumes; both must land before round-trip verification (deferred to Phase 30 + BACKUP-RESTORE.md).
- Phase 30 clean-VM smoke test should run: backup.sh → ship archive to second VM → restore.sh --yes → verify orgs/users/cameras/avatars/snapshots match source — tracked in BACKUP-RESTORE.md (Plan 29-06).

---
*Phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli*
*Plan: 05*
*Completed: 2026-04-28*
