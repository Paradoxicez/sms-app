#!/usr/bin/env bash
# ============================================================================
# deploy/scripts/backup.sh — Phase 29 (DEPLOY-20)
#
# Offline atomic backup. Produces one tar.gz containing:
#   - postgres.dump        (pg_dump -Fc)
#   - minio/avatars/       (mc mirror)
#   - minio/recordings/
#   - minio/snapshots/
#   - caddy_data.tar.gz    (volume tar; ACME state + TLS cert)
#
# api + web are stopped for the duration; postgres + minio + caddy keep
# running. Downtime: ~30-90s depending on archive size.
#
# Usage:
#   bash deploy/scripts/backup.sh
#   BACKUP_DIR=/mnt/backups bash deploy/scripts/backup.sh
#
# Output: ${BACKUP_DIR:-./backups}/sms-backup-<UTC-ts>.tar.gz
#
# Exclusions (D-19): .env stays out (secrets — operator stores separately
# in a password manager + offsite encrypted). The Redis volume and the live
# HLS segment volume are also excluded from the bundle: sessions are
# re-established on api boot, BullMQ jobs replay from camera state (Phase 15
# resilience), and HLS chunks self-delete via SRS hls_dispose. Including
# them would balloon the archive without improving the recovery point.
# ============================================================================

set -euo pipefail
IFS=$' \n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
COMPOSE_PROJECT="sms-platform"   # mirrors `name:` in docker-compose.yml

# --- TTY-aware color (D-29) ---
if [[ -t 1 ]] && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; BOLD=''; RESET=''
fi
log()  { printf '%s[backup]%s %s\n' "${BOLD}" "${RESET}" "$*"; }
ok()   { printf '%s[backup] ✓%s %s\n' "${GREEN}" "${RESET}" "$*"; }
warn() { printf '%s[backup] ⚠%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2; }
die()  { printf '%s[backup] ✗%s %s\n' "${RED}" "${RESET}" "$*" >&2; exit 1; }

[[ -f "${ENV_FILE}" ]]    || die "${ENV_FILE} missing. Run bootstrap.sh first."
[[ -f "${COMPOSE_FILE}" ]] || die "${COMPOSE_FILE} missing."

# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

DC="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"

# --- D-17: filename + BACKUP_DIR override ---
# I4 (Phase 29 revision): mkdir BEFORE realpath-style normalisation. The
# previous form ran `cd "$(dirname "${ARCHIVE_DIR}")"` first, which fails
# under `set -e` if the parent directory does not yet exist (and we crash
# before the `mkdir -p` ever runs). Mkdir-first guarantees the path exists,
# then `cd` + `pwd` normalises it.
TS=$(date -u +%Y-%m-%dT%H%MZ)
ARCHIVE_DIR="${BACKUP_DIR:-${DEPLOY_DIR}/../backups}"
mkdir -p "${ARCHIVE_DIR}"
ARCHIVE_DIR="$(cd "${ARCHIVE_DIR}" && pwd)"
ARCHIVE="${ARCHIVE_DIR}/sms-backup-${TS}.tar.gz"

# --- Working dir + cleanup trap (always restart api+web on exit) ---
TMP=$(mktemp -d)
RESTARTED=0
cleanup() {
  local rc=$?
  if [[ "${RESTARTED}" -eq 0 ]]; then
    log "Restarting api + web..."
    ${DC} start api web 2>/dev/null || warn "api/web restart failed — inspect: ${DC} ps"
    RESTARTED=1
  fi
  rm -rf "${TMP}"
  exit "${rc}"
}
trap cleanup EXIT

START_EPOCH=$(date +%s)
log "Backup target: ${ARCHIVE}"
log "Working directory: ${TMP}"
log "Stopping api + web for atomic snapshot..."
STOP_START=$(date +%s)
${DC} stop api web
STOP_ELAPSED=$(( $(date +%s) - STOP_START ))
ok "api + web stopped (${STOP_ELAPSED}s)"

# --- Step 1: D-20 pg_dump -Fc (custom format) ---
log "Step 1/3: pg_dump (custom format)..."
${DC} exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-sms}" \
  -d "${POSTGRES_DB:-sms_platform}" \
  -Fc \
  > "${TMP}/postgres.dump"
PG_BYTES=$(wc -c < "${TMP}/postgres.dump" | tr -d ' ')
[[ "${PG_BYTES}" -gt 0 ]] || die "pg_dump produced empty file."
ok "postgres.dump (${PG_BYTES} bytes)"

# --- Step 2: D-19 mc mirror buckets (avatars + recordings + snapshots) ---
log "Step 2/3: mc mirror MinIO buckets..."
mkdir -p "${TMP}/minio"
for BUCKET in avatars recordings snapshots; do
  log "  mirroring ${BUCKET}..."
  # mc is preconfigured with `local` alias inside the minio image entrypoint.
  ${DC} exec -T minio sh -c "mkdir -p /tmp/backup/${BUCKET} && mc mirror --quiet local/${BUCKET} /tmp/backup/${BUCKET}" \
    || warn "  ${BUCKET} mirror returned non-zero (may be empty bucket — continuing)"
done
# Copy the in-container backup dir to the host TMP. I5 (Phase 29 revision):
# use `docker cp` directly (resolved via `${DC} ps -q minio` to get the
# container id). `${DC} cp` has had directory-tree bugs across compose
# v2.10..v2.20; the raw docker CLI is stable.
docker cp "$(${DC} ps -q minio):/tmp/backup/." "${TMP}/minio/"
${DC} exec -T minio rm -rf /tmp/backup
ok "MinIO buckets mirrored"

# --- Step 3: D-19 caddy_data volume tar ---
# The named volume on the host is prefixed by the compose project name, so
# the `caddy_data` declaration in docker-compose.yml resolves to the host
# volume `sms-platform_caddy_data`. We mount it read-only into a throwaway
# alpine container and tar it from there — this avoids stopping caddy and
# preserves ACME state + the issued TLS cert for restore.
CADDY_VOLUME="${COMPOSE_PROJECT}_caddy_data"
log "Step 3/3: ${CADDY_VOLUME} volume tar..."
docker run --rm \
  -v "${CADDY_VOLUME}:/data:ro" \
  -v "${TMP}:/backup" \
  alpine \
  tar -C /data -czf /backup/caddy_data.tar.gz .
[[ -s "${TMP}/caddy_data.tar.gz" ]] || die "caddy_data tar produced empty file."
CADDY_BYTES=$(wc -c < "${TMP}/caddy_data.tar.gz" | tr -d ' ')
ok "caddy_data.tar.gz (${CADDY_BYTES} bytes from sms-platform_caddy_data)"

# --- Bundle into single archive ---
log "Bundling archive..."
tar -C "${TMP}" -czf "${ARCHIVE}" postgres.dump minio caddy_data.tar.gz
chmod 600 "${ARCHIVE}"   # archive contains hashed creds + cert keys
ARCHIVE_BYTES=$(wc -c < "${ARCHIVE}" | tr -d ' ')
ok "Archive: ${ARCHIVE} (${ARCHIVE_BYTES} bytes)"

# --- Restart api + web (also handled by trap, but explicit on success path) ---
log "Restarting api + web..."
${DC} start api web
RESTARTED=1
ok "Stack live again"

# --- Timing + summary (D-29 operator observability) ---
TOTAL_ELAPSED=$(( $(date +%s) - START_EPOCH ))
echo
ok "Backup complete in ${TOTAL_ELAPSED}s"
log "  Archive:  ${ARCHIVE}"
log "  Size:     ${ARCHIVE_BYTES} bytes"
log "  Components: postgres.dump + minio/{avatars,recordings,snapshots} + caddy_data.tar.gz"

echo
log "Restore command:"
log "  bash ${SCRIPT_DIR}/restore.sh ${ARCHIVE}"
log "Offsite copy hint (operator's responsibility — archive is unencrypted):"
log "  rclone copy ${ARCHIVE} <remote>:sms-backups/"
log "  # or: gpg -e -r <recipient> ${ARCHIVE} && scp ${ARCHIVE}.gpg <host>:"
