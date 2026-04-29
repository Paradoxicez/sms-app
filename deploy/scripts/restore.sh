#!/usr/bin/env bash
# ============================================================================
# deploy/scripts/restore.sh — Phase 29 (DEPLOY-21)
#
# Restores a backup.sh archive over the current platform state.
# DESTRUCTIVE: drops postgres / minio / caddy_data volumes via `compose down -v`
# then rebuilds them from the archive.
#
# Usage:
#   bash deploy/scripts/restore.sh ./backups/sms-backup-2026-04-27T1200Z.tar.gz
#   bash deploy/scripts/restore.sh ./backups/sms-backup-2026-04-27T1200Z.tar.gz --yes  # skip prompt (DR automation)
#
# Safety:
#   1. Archive integrity is verified BEFORE any destructive action (D-21).
#   2. Interactive confirmation default; --yes flag for scripted DR (D-22).
#   3. On verify-fail, exit 1 BEFORE any volume is touched.
#   4. Archive extracted to TMP BEFORE `compose down -v` (D-23 ordering).
#
# Restore sequence (D-23):
#   integrity verify → confirm → extract to TMP → compose down -v →
#   boot postgres+minio (only) → wait healthy → pg_restore --clean --if-exists →
#   mc mirror reverse for avatars+recordings+snapshots → caddy_data wipe + tar xzf →
#   full compose up -d → optional /api/health probe.
#
# Schema-version cross-restore is NOT enforced (D-24): prisma migrate deploy is
# idempotent in both directions, so the next `compose up -d` after restore handles
# forward migrations naturally; we never parse `_prisma_migrations`.
# ============================================================================

set -euo pipefail
IFS=$' \n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
COMPOSE_PROJECT="sms-platform"

# --- TTY-aware color (D-29) ---
if [[ -t 1 ]] && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; BOLD=''; RESET=''
fi
log()  { printf '%s[restore]%s %s\n' "${BOLD}" "${RESET}" "$*"; }
ok()   { printf '%s[restore] ✓%s %s\n' "${GREEN}" "${RESET}" "$*"; }
warn() { printf '%s[restore] ⚠%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2; }
die()  { printf '%s[restore] ✗%s %s\n' "${RED}" "${RESET}" "$*" >&2; exit 1; }

# --- Args: positional archive path + optional --yes (D-22) ---
ARCHIVE="${1:-}"
YES_FLAG="${2:-}"
if [[ -z "${ARCHIVE}" ]]; then
  printf 'Usage: %s <archive.tar.gz> [--yes]\n' "$0" >&2
  exit 2
fi
[[ -f "${ARCHIVE}" ]] || die "Archive not found: ${ARCHIVE}"
[[ -f "${ENV_FILE}" ]] || die "${ENV_FILE} missing. Cannot restore — operator must keep .env in their password manager (D-19) and place it before running restore."
[[ -f "${COMPOSE_FILE}" ]] || die "${COMPOSE_FILE} missing."

# --- D-21: integrity verify (BEFORE destroying state) ---
# tar -tzf reads the index without extracting; truncated/corrupt archives fail
# at this step. Then we grep for the 3 top-level entries that backup.sh emits.
# Each entry is anchored with optional trailing slash so a directory entry like
# "minio/" matches via ^minio/$ and a regular-file entry like "postgres.dump"
# matches via ^postgres.dump$ (the same pattern is constructed for caddy_data).
log "Verifying archive integrity..."
CONTENT=$(tar -tzf "${ARCHIVE}" 2>/dev/null) || die "Archive is corrupt or not a tar.gz: ${ARCHIVE}"
for required in "postgres.dump" "minio" "caddy_data.tar.gz"; do
  grep -qE "^${required}/?\$" <<<"${CONTENT}" || die "Archive missing required entry: ${required}"
done
ok "Archive structure valid (postgres.dump + minio/ + caddy_data.tar.gz)"

# --- D-22: confirmation gate (BEFORE destroying state) ---
if [[ "${YES_FLAG}" != "--yes" ]]; then
  warn "DESTRUCTIVE OPERATION: this will drop postgres + minio + caddy_data volumes."
  warn "Archive: ${ARCHIVE}"
  printf '  Continue? [y/N]: '
  read -r confirm
  case "${confirm}" in
    y|Y|yes|YES) : ;;
    *) log "Aborted (no data destroyed)."; exit 0 ;;
  esac
fi

# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a
DC="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"

# --- D-23: extract archive to a working directory FIRST (before wiping) ---
# Symmetric inverse of backup.sh's bundle step. If extract fails (disk full,
# corrupt mid-archive past the index), the live volumes are still alive.
TMP=$(mktemp -d)
trap 'rm -rf "${TMP}"' EXIT
log "Extracting archive to ${TMP}..."
tar -C "${TMP}" -xzf "${ARCHIVE}"
[[ -s "${TMP}/postgres.dump" ]]      || die "Extracted postgres.dump is empty."
[[ -d "${TMP}/minio" ]]              || die "Extracted minio/ is missing."
[[ -s "${TMP}/caddy_data.tar.gz" ]]  || die "Extracted caddy_data.tar.gz is empty."
ok "Archive extracted"

# --- D-23: compose down -v (drops named volumes) ---
log "Stopping stack and dropping volumes (compose down -v)..."
${DC} down -v
ok "Volumes dropped"

# --- D-23: boot ONLY postgres + minio fresh; no api/web/caddy yet ---
# api MUST NOT boot before pg_restore lands (sms-migrate would re-create
# schema on empty DB → pg_restore would conflict). Restore data first.
log "Booting postgres + minio (fresh empty volumes)..."
${DC} up -d postgres minio

log "Waiting for postgres healthy..."
PG_READY=0
for i in $(seq 1 24); do
  if ${DC} exec -T postgres pg_isready -U "${POSTGRES_USER:-sms}" -d "${POSTGRES_DB:-sms_platform}" >/dev/null 2>&1; then
    PG_READY=1; break
  fi
  sleep 5
done
[[ "${PG_READY}" -eq 1 ]] || die "Postgres did not become ready in 120s. Inspect: ${DC} logs postgres"
ok "Postgres ready"

log "Waiting for minio healthy..."
MINIO_READY=0
for i in $(seq 1 24); do
  if ${DC} exec -T minio mc ready local >/dev/null 2>&1; then
    MINIO_READY=1; break
  fi
  sleep 5
done
[[ "${MINIO_READY}" -eq 1 ]] || die "MinIO did not become ready in 120s. Inspect: ${DC} logs minio"
ok "MinIO ready"

# --- D-23: pg_restore --clean --if-exists (idempotent overwrite) ---
# --clean drops objects before recreating; --if-exists skips drops for nonexistent
# objects (no error spam on fresh DB); --no-owner/--no-privileges skip cross-role
# ownership transfer (single-tenant compose runs as sms postgres user).
log "Restoring postgres from archive..."
${DC} exec -T postgres pg_restore \
  -U "${POSTGRES_USER:-sms}" \
  -d "${POSTGRES_DB:-sms_platform}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  < "${TMP}/postgres.dump" \
  || warn "pg_restore reported non-zero (some warnings expected with --clean on empty DB)"
ok "Postgres restored"

# --- D-23: MinIO mirror reverse (host TMP → minio container → mc mirror to bucket) ---
# compose cp uses tar internally and handles large directories deterministically;
# avoid `compose exec sh -c "tar … | tar …"` for binary streams.
log "Copying MinIO bundle into minio container..."
${DC} exec -T minio sh -c 'rm -rf /tmp/restore && mkdir -p /tmp/restore'
${DC} cp "${TMP}/minio/." minio:/tmp/restore/
log "Restoring MinIO buckets..."
for BUCKET in avatars recordings snapshots; do
  log "  restoring ${BUCKET}..."
  # mc mb --ignore-existing makes bucket creation idempotent on freshly-wiped MinIO.
  ${DC} exec -T minio sh -c "mc mb --ignore-existing local/${BUCKET} && mc mirror --quiet --overwrite /tmp/restore/${BUCKET} local/${BUCKET}" \
    || warn "  ${BUCKET} mirror returned non-zero (may be empty bucket — continuing)"
done
${DC} exec -T minio rm -rf /tmp/restore
ok "MinIO restored"

# --- D-23: caddy_data volume restore (alpine tar xzf) ---
# Wipe destination first to start from a known-empty state; then extract.
# Volume name carries COMPOSE_PROJECT prefix (sms-platform_caddy_data).
log "Restoring caddy_data volume..."
docker run --rm \
  -v "${COMPOSE_PROJECT}_caddy_data:/data" \
  -v "${TMP}:/backup:ro" \
  alpine \
  sh -c "rm -rf /data/* && tar -C /data -xzf /backup/caddy_data.tar.gz"
ok "caddy_data restored"

# --- D-23: bring up the rest of the stack ---
# sms-migrate runs prisma migrate deploy: no-op if archive's schema matches
# image; applies forward migrations if image is newer (D-24).
log "Bringing up full stack (sms-migrate + api + web + caddy)..."
${DC} up -d
ok "compose up -d issued"

# Optional health probe via Caddy if DOMAIN is set.
if [[ -n "${DOMAIN:-}" ]]; then
  log "Waiting for /api/health on https://${DOMAIN}..."
  for i in $(seq 1 24); do
    if curl -fsS -o /dev/null --max-time 5 "https://${DOMAIN}/api/health" 2>/dev/null; then
      ok "Restore complete: stack live at https://${DOMAIN}"
      exit 0
    fi
    sleep 5
  done
  warn "Restore complete but HTTPS unreachable after 120s. Check: ${DC} logs caddy"
  warn "Caddy may be re-validating ACME against the restored cert state."
  exit 1
else
  ok "Restore complete (DOMAIN not set in .env — skipping HTTPS probe)"
fi
