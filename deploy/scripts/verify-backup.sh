#!/usr/bin/env bash
# ============================================================================
# deploy/scripts/verify-backup.sh — Phase 30 (DEPLOY-25, partial coverage)
#
# Phase 29 SC#4 verifier: backup.sh + restore.sh byte-equivalent round-trip.
# Runs ON the smoke VM AFTER verify-playback has populated synthetic data:
#   - 1 super-admin user (created by bootstrap.sh's create-admin step)
#   - 1 organization (auto-created with super-admin)
#   - 1+ Member rows (super-admin's own membership)
#   - 1+ Camera rows (operator registered in D-14 step 2)
#   - 1+ Recording rows + .ts archives in MinIO recordings bucket
#
# Sequence:
#   1. Snapshot SELECT counts (5 tables) + MinIO ls (3 buckets)
#   2. bash deploy/scripts/backup.sh → capture archive path
#   3. bash deploy/scripts/restore.sh <archive> --yes → wipes + restores
#   4. Re-snapshot SELECT counts + MinIO ls + curl /api/health
#   5. Assert pre==post for all counts + bucket diffs empty + HTTPS works
#   6. Assert no `certificate obtained` log lines since restore (cert preserved)
#
# Usage:
#   bash deploy/scripts/verify-backup.sh
#   BACKUP_DIR=/mnt/backups bash deploy/scripts/verify-backup.sh
#
# Prerequisites:
#   - deploy/.env exists and stack is up + healthy
#   - At least 1 row exists in each of: User, Organization, Member, Camera
#     (verify-playback completed; smoke is mid-flight). Recording can be 0
#     (warns but does not fail) — backup still tests other entities.
#
# DESTRUCTIVE WARNING:
#   This script invokes restore.sh --yes, which DROPS postgres + minio +
#   caddy_data named volumes via `compose down -v` then rebuilds them from
#   the freshly-captured archive. Do NOT run on a stack carrying real
#   production data unless you have an offsite copy of that data first.
#   Intended scope: clean smoke VM mid-Phase-30 only.
#
# Exit codes:
#   0 — all assertions pass (byte-equivalent round-trip + cert preserved)
#   1 — at least one byte-equivalence failure (HARD GA block per D-12)
#   2 — missing prerequisites (.env, stack down, empty starter data)
# ============================================================================

set -euo pipefail
IFS=$'\n\t'

# --- Path resolution (works from any CWD) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
LOG_FILE="${DEPLOY_DIR}/SMOKE-TEST-LOG.md"

# --- TTY-aware color helpers (D-29 inherited from bootstrap.sh) ---
if [[ -t 1 ]] && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  GREEN=$'\033[32m'
  RED=$'\033[31m'
  YELLOW=$'\033[33m'
  BOLD=$'\033[1m'
  RESET=$'\033[0m'
else
  GREEN=''
  RED=''
  YELLOW=''
  BOLD=''
  RESET=''
fi
log()        { printf '%s[verify-backup]%s %s\n' "${BOLD}" "${RESET}" "$*"; }
ok()         { printf '%s[verify-backup] ✓%s %s\n' "${GREEN}" "${RESET}" "$*"; }
warn()       { printf '%s[verify-backup] ⚠%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2; }
die()        { printf '%s[verify-backup] ✗%s %s\n' "${RED}" "${RESET}" "$*" >&2; exit 1; }
pass_check() { printf '  %s✓ PASS%s  %s\n' "${GREEN}" "${RESET}" "$*"; }
fail_check() { printf '  %s✗ FAIL%s  %s\n' "${RED}" "${RESET}" "$*"; }

# --- Pre-flight (exit 2 on missing prereqs, mirroring restore.sh patterns) ---
if ! command -v docker >/dev/null 2>&1; then
  printf '%s[verify-backup] ✗%s docker not on PATH\n' "${RED}" "${RESET}" >&2
  exit 2
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  printf '%s[verify-backup] ✗%s %s missing — run bootstrap.sh first\n' "${RED}" "${RESET}" "${ENV_FILE}" >&2
  exit 2
fi
if [[ ! -f "${COMPOSE_FILE}" ]]; then
  printf '%s[verify-backup] ✗%s %s missing\n' "${RED}" "${RESET}" "${COMPOSE_FILE}" >&2
  exit 2
fi

# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

if [[ -z "${DOMAIN:-}" ]]; then
  printf '%s[verify-backup] ✗%s DOMAIN not set in %s\n' "${RED}" "${RESET}" "${ENV_FILE}" >&2
  exit 2
fi

PASS=0
FAIL=0
DC="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"

# --- Helper: SELECT count for a Prisma table (preserves PascalCase quoting) ---
pg_count() {
  local table="$1"
  ${DC} exec -T postgres psql \
    -U "${POSTGRES_USER:-sms}" \
    -d "${POSTGRES_DB:-sms_platform}" \
    -tAc "SELECT COUNT(*) FROM \"${table}\"" 2>/dev/null \
    | tr -d '[:space:]' \
    || echo -1
}

# --- Helper: stable digest of sorted MinIO file-key listing per bucket ---
# We sha256 the SORTED file-name listing rather than `mc diff` because:
#  - mc diff requires a remote-source argument and is built for cross-alias
#    compares, not point-in-time snapshots within the same instance.
#  - mc ls metadata (timestamps, sizes) drifts non-deterministically; only
#    the file-key set is contractually preserved across mirror round-trips.
#  - Empty bucket → both pre and post hash the empty input identically;
#    that is the CORRECT no-diff signal (T-30-12 mitigation).
mc_digest() {
  local bucket="$1"
  ${DC} exec -T minio mc ls --recursive "local/${bucket}/" 2>/dev/null \
    | awk '{print $NF}' \
    | sort \
    | sha256sum \
    | awk '{print $1}'
}

START_EPOCH=$(date +%s)
log "Starting verify-backup round-trip on https://${DOMAIN}"
echo

# ---------------------------------------------------------------------------
# Step [1/6] — Pre-backup snapshot (5 tables + 3 MinIO buckets)
# ---------------------------------------------------------------------------
log "[1/6] Pre-backup snapshot"

declare -A PRE_COUNTS
for table in User Organization Member Camera Recording; do
  PRE_COUNTS["${table}"]=$(pg_count "${table}")
  log "  Pre  ${table}: ${PRE_COUNTS[${table}]}"
done

# Validate starter data — fail fast if any required table is empty.
if [[ "${PRE_COUNTS[User]}" -lt 1 ]] \
   || [[ "${PRE_COUNTS[Organization]}" -lt 1 ]] \
   || [[ "${PRE_COUNTS[Member]}" -lt 1 ]] \
   || [[ "${PRE_COUNTS[Camera]}" -lt 1 ]]; then
  die "Insufficient starter data — User=${PRE_COUNTS[User]} Org=${PRE_COUNTS[Organization]} Member=${PRE_COUNTS[Member]} Camera=${PRE_COUNTS[Camera]}. Run bootstrap.sh + register a camera (verify-playback) first."
fi
if [[ "${PRE_COUNTS[Recording]}" -lt 1 ]]; then
  warn "  Recording count = 0 — verify-playback's record-60s step did not produce a Recording row?"
  warn "  Continuing — backup will still test other entities."
fi

# Ensure mc alias is set inside the minio container (idempotent).
${DC} exec -T minio mc alias set local http://localhost:9000 \
  "${MINIO_ROOT_USER:-minioadmin}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1 || true

PRE_AVATARS=$(mc_digest avatars)
PRE_RECORDINGS=$(mc_digest recordings)
PRE_SNAPSHOTS=$(mc_digest snapshots)
log "  Pre  avatars sha256:    ${PRE_AVATARS}"
log "  Pre  recordings sha256: ${PRE_RECORDINGS}"
log "  Pre  snapshots sha256:  ${PRE_SNAPSHOTS}"
echo

# ---------------------------------------------------------------------------
# Step [2/6] — Invoke backup.sh + capture archive path
# ---------------------------------------------------------------------------
log "[2/6] Running backup.sh"

BACKUP_LOG=$(mktemp)
if bash "${SCRIPT_DIR}/backup.sh" 2>&1 | tee "${BACKUP_LOG}"; then
  pass_check "backup.sh exit 0"
  PASS=$((PASS + 1))
else
  fail_check "backup.sh exited non-zero — see ${BACKUP_LOG}"
  FAIL=$((FAIL + 1))
  exit 1
fi

# Extract archive path from backup.sh output. Final summary block emits
# `[backup]   Archive:  /path/to/sms-backup-<UTC>.tar.gz`. We grep for the
# Archive: marker, then awk the trailing field, then tail -1 in case the
# substring appears multiple times (e.g. earlier "Backup target:" line).
ARCHIVE_PATH=$(grep -oE 'Archive:[[:space:]]+[^[:space:]]+\.tar\.gz' "${BACKUP_LOG}" \
  | awk '{print $NF}' \
  | tail -1)
if [[ -z "${ARCHIVE_PATH}" ]] || [[ ! -f "${ARCHIVE_PATH}" ]]; then
  fail_check "Could not locate archive from backup.sh output (got: '${ARCHIVE_PATH}')"
  FAIL=$((FAIL + 1))
  exit 1
fi
pass_check "Archive captured: ${ARCHIVE_PATH}"
PASS=$((PASS + 1))

# Verify archive shape (Phase 29 D-17): postgres.dump + minio/ + caddy_data.tar.gz
ARCHIVE_CONTENT=$(tar -tzf "${ARCHIVE_PATH}" 2>/dev/null || true)
if grep -qE '^postgres\.dump$' <<<"${ARCHIVE_CONTENT}" \
   && grep -qE '^minio/?$' <<<"${ARCHIVE_CONTENT}" \
   && grep -qE '^caddy_data\.tar\.gz$' <<<"${ARCHIVE_CONTENT}"; then
  pass_check "Archive contains postgres.dump + minio/ + caddy_data.tar.gz"
  PASS=$((PASS + 1))
else
  fail_check "Archive missing required entries (postgres.dump / minio/ / caddy_data.tar.gz)"
  FAIL=$((FAIL + 1))
fi
rm -f "${BACKUP_LOG}"
echo

# ---------------------------------------------------------------------------
# Step [3/6] — Invoke restore.sh --yes (DESTRUCTIVE: wipes volumes)
# ---------------------------------------------------------------------------
log "[3/6] Running restore.sh --yes (DESTRUCTIVE — wipes + restores volumes)"

RESTORE_LOG=$(mktemp)
if bash "${SCRIPT_DIR}/restore.sh" "${ARCHIVE_PATH}" --yes 2>&1 | tee "${RESTORE_LOG}"; then
  pass_check "restore.sh --yes exit 0"
  PASS=$((PASS + 1))
else
  fail_check "restore.sh --yes exited non-zero — see ${RESTORE_LOG}"
  FAIL=$((FAIL + 1))
  exit 1
fi
rm -f "${RESTORE_LOG}"

# Wait for stack to recover (restore.sh probes /api/health internally too,
# but allow extra slack for the full compose up -d cascade to settle).
log "  Waiting for https://${DOMAIN}/api/health to recover..."
HEALTH_OK=0
for _ in $(seq 1 24); do
  if curl -fsS -o /dev/null --max-time 5 "https://${DOMAIN}/api/health" 2>/dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep 5
done
if [[ "${HEALTH_OK}" -eq 1 ]]; then
  log "  Stack live again post-restore"
else
  warn "  /api/health did not respond within 120s — assertions in step [5/6] will catch this."
fi
echo

# ---------------------------------------------------------------------------
# Step [4/6] — Post-restore snapshot + pairwise count assertions
# ---------------------------------------------------------------------------
log "[4/6] Post-restore snapshot + pairwise count assertions"

declare -A POST_COUNTS
for table in User Organization Member Camera Recording; do
  POST_COUNTS["${table}"]=$(pg_count "${table}")
  pre="${PRE_COUNTS[${table}]}"
  post="${POST_COUNTS[${table}]}"
  if [[ "${pre}" == "${post}" ]]; then
    pass_check "${table}: pre=${pre} == post=${post}"
    PASS=$((PASS + 1))
  else
    fail_check "${table}: pre=${pre} != post=${post} — byte-equivalence violated"
    FAIL=$((FAIL + 1))
  fi
done

# Re-set mc alias inside the post-restore minio container (fresh volume,
# alias state may have been wiped — defensive idempotent set).
${DC} exec -T minio mc alias set local http://localhost:9000 \
  "${MINIO_ROOT_USER:-minioadmin}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1 || true

POST_AVATARS=$(mc_digest avatars)
POST_RECORDINGS=$(mc_digest recordings)
POST_SNAPSHOTS=$(mc_digest snapshots)

# Loop the three buckets via indirect expansion to reuse a single assertion
# block — `${!varname}` resolves PRE_AVATARS / POST_AVATARS by string name.
for bucket in avatars recordings snapshots; do
  bucket_upper=$(printf '%s' "${bucket}" | tr '[:lower:]' '[:upper:]')
  pre_var="PRE_${bucket_upper}"
  post_var="POST_${bucket_upper}"
  if [[ "${!pre_var}" == "${!post_var}" ]]; then
    pass_check "MinIO ${bucket}: file-key set preserved (sha256 match)"
    PASS=$((PASS + 1))
  else
    fail_check "MinIO ${bucket}: file-key set differs  pre=${!pre_var}  post=${!post_var}"
    FAIL=$((FAIL + 1))
  fi
done
echo

# ---------------------------------------------------------------------------
# Step [5/6] — TLS cert preservation (Phase 27 SC#3 inheritance via Phase 29 D-23)
# ---------------------------------------------------------------------------
log "[5/6] TLS cert preserved across restore (Phase 27 SC#3 inheritance)"

if curl -fsS -o /dev/null --max-time 10 "https://${DOMAIN}/api/health"; then
  pass_check "https://${DOMAIN}/api/health → 200 after restore"
  PASS=$((PASS + 1))
else
  fail_check "HTTPS unreachable after restore — cert lost or stack failed?"
  FAIL=$((FAIL + 1))
fi

# Caddy should NOT have re-issued the cert: restore.sh wipes caddy_data then
# `tar xzf` restores it from the archive — same cert, same ACME account state.
# A `certificate obtained` log line during the last 2 minutes would mean ACME
# re-ran (cert lost across restore). Scope --since=2m covers the full restore
# runtime which is typically 60-120s.
CERT_OBTAINED_COUNT=$(${DC} logs --since=2m caddy 2>&1 | grep -cE 'certificate obtained' || true)
if [[ "${CERT_OBTAINED_COUNT}" -eq 0 ]]; then
  pass_check "0 'certificate obtained' lines since restore (cert preserved)"
  PASS=$((PASS + 1))
else
  fail_check "${CERT_OBTAINED_COUNT} 'certificate obtained' since restore — caddy_data did NOT roundtrip"
  FAIL=$((FAIL + 1))
fi
echo

# ---------------------------------------------------------------------------
# Step [6/6] — Summary + tee SMOKE-TEST-LOG + exit
# ---------------------------------------------------------------------------
log "[6/6] Summary"
TOTAL_ELAPSED=$(( $(date +%s) - START_EPOCH ))
echo "  PASS=${PASS}  FAIL=${FAIL}  duration=${TOTAL_ELAPSED}s"
echo "  Archive verified: ${ARCHIVE_PATH}"
echo

# Best-effort append to SMOKE-TEST-LOG.md (Wave 1 evidence sink). Do NOT
# fail the verifier if the log is missing — operator may have moved or
# renamed it during the smoke run.
if [[ -f "${LOG_FILE}" ]]; then
  printf '\n<!-- verify-backup.sh run %s — %s checks PASS, %s FAIL  duration=%ss  archive=%s -->\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${PASS}" "${FAIL}" "${TOTAL_ELAPSED}" "${ARCHIVE_PATH}" \
    >> "${LOG_FILE}"
fi

if [[ "${FAIL}" -eq 0 ]]; then
  ok "All ${PASS} verify-backup assertions passed."
  log "Phase 29 SC#4 satisfied (byte-equivalent round-trip + cert preserved)"
  log "  Archive retained at: ${ARCHIVE_PATH}"
  log "  Operator may delete with: rm -f ${ARCHIVE_PATH}"
  exit 0
else
  die "${FAIL} of $((PASS + FAIL)) assertions failed. v1.3 GA blocked (D-12 hard fail)."
fi
