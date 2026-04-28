#!/usr/bin/env bash
# ============================================================================
# deploy/scripts/update.sh — Phase 29 (DEPLOY-19)
#
# Atomic image-tag upgrade. Pre-flight migrate test runs against the new
# image with .env unchanged; only on green light is .env rewritten and the
# stack recycled. If migrate fails: .env untouched, services keep running
# the old tag, exit 1.
#
# Usage:
#   bash deploy/scripts/update.sh v1.3.1
#   bash deploy/scripts/update.sh v1.3.2-rc1
#   bash deploy/scripts/update.sh latest    # not recommended for prod
#
# Manual rollback (after a successful update went bad in production):
#   cp deploy/.env.backup-<utc-timestamp> deploy/.env
#   bash deploy/scripts/update.sh <old-tag>
#
# Exit codes:
#   0 — success
#   1 — migrate failure or post-recycle health failure
#   2 — misuse (missing/invalid tag arg, broken repo layout)
# ============================================================================

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"

# --- TTY-aware color (D-29) ---
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
log()  { printf '%s[update]%s %s\n' "${BOLD}" "${RESET}" "$*"; }
ok()   { printf '%s[update] ✓%s %s\n' "${GREEN}" "${RESET}" "$*"; }
warn() { printf '%s[update] ⚠%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2; }
die()  { printf '%s[update] ✗%s %s\n' "${RED}" "${RESET}" "$*" >&2; exit 1; }

# --- D-13: positional arg + semver/latest regex ---
TAG="${1:-}"
if [[ -z "${TAG}" ]]; then
  printf 'Usage: %s <tag>\n' "$0" >&2
  printf '  tag: vX.Y.Z (e.g. v1.3.1) | vX.Y.Z-prerelease (e.g. v1.3.2-rc1) | latest\n' >&2
  exit 2
fi
if ! [[ "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9]+(\.[a-z0-9]+)*)?$|^latest$ ]]; then
  die "Invalid tag format: ${TAG}. Expected vX.Y.Z, vX.Y.Z-prerelease, or latest."
fi

# --- Pre-flight ---
[[ -f "${ENV_FILE}" ]] || { die "${ENV_FILE} missing. Cannot update — run bootstrap.sh first."; }
[[ -f "${COMPOSE_FILE}" ]] || { die "${COMPOSE_FILE} missing. Repo layout broken?"; }
command -v docker >/dev/null 2>&1 || die "docker not on PATH. Install Docker Engine + Compose v2."
docker compose version >/dev/null 2>&1 || die "docker compose v2 not available. Upgrade Docker."
docker info >/dev/null 2>&1 || die "Docker daemon not responding. Start Docker first."
grep -qE '^IMAGE_TAG=' "${ENV_FILE}" || die "IMAGE_TAG= line missing from ${ENV_FILE}. sed-rewrite would no-op."

# Source DOMAIN for the post-recycle health probe.
# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a
[[ -n "${DOMAIN:-}" ]] || die "DOMAIN not set in ${ENV_FILE}. Cannot probe health endpoint."

OLD_TAG="${IMAGE_TAG:-unknown}"
log "Current IMAGE_TAG: ${OLD_TAG}  →  Target: ${TAG}"

DC="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"

# --- Step 1: pull new images (idempotent — docker layer cache) ---
log "Pulling images for tag ${TAG}..."
IMAGE_TAG="${TAG}" ${DC} pull
ok "Images pulled"

# --- Step 2: D-15 pre-flight migrate test (env override, .env unchanged) ---
log "Pre-flight migrate test on image ${TAG}..."
log "  IMAGE_TAG=${TAG} ${DC} run --rm sms-migrate"
log "  (.env IMAGE_TAG=${OLD_TAG} stays unchanged until migrate exits 0)"
if ! IMAGE_TAG="${TAG}" ${DC} run --rm sms-migrate; then
  die "Migrate failed on image ${TAG}. Stack unchanged. Inspect: IMAGE_TAG=${TAG} ${DC} run --rm sms-migrate"
fi
ok "Pre-flight migrate green"

# --- Step 3: D-14 backup .env then sed in-place ---
TS=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="${ENV_FILE}.backup-${TS}"
cp "${ENV_FILE}" "${ENV_FILE}.backup-${TS}"
chmod 600 "${BACKUP}"   # match init-secrets.sh perms (Pitfall 8 mitigation)
sed -i.tmp "s|^IMAGE_TAG=.*|IMAGE_TAG=${TAG}|" "${ENV_FILE}"
rm -f "${ENV_FILE}.tmp"
ok "IMAGE_TAG → ${TAG} (backup: ${BACKUP})"

# --- Step 4: recycle via compose up -d (depends_on chain handles order) ---
log "Recycling stack on ${TAG}..."
log "  Recycle order (Phase 26 depends_on chain):"
log "    postgres+redis+minio (parallel) → sms-migrate (one-shot) → api → web → caddy"
${DC} up -d
ok "compose up -d issued"

# --- Step 5: D-16 health verify (poll Caddy /api/health) ---
log "Waiting for /api/health on https://${DOMAIN} (5s × 24 iterations = 120s budget)..."
for i in $(seq 1 24); do
  if curl -fsS -o /dev/null --max-time 5 "https://${DOMAIN}/api/health" 2>/dev/null; then
    ok "Update complete: ${TAG} live at https://${DOMAIN}"
    log "Rollback (if needed): cp ${BACKUP} ${ENV_FILE} && bash ${SCRIPT_DIR}/update.sh ${OLD_TAG}"
    exit 0
  fi
  sleep 5
done

warn "Services unhealthy after 120s. Rollback hint:"
warn "  cp ${BACKUP} ${ENV_FILE} && bash ${SCRIPT_DIR}/update.sh ${OLD_TAG}"
warn "Inspect: ${DC} logs --tail 100 api"
warn "Inspect: ${DC} ps"
exit 1
