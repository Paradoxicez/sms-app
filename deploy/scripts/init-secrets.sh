#!/usr/bin/env bash
# ============================================================================
# deploy/scripts/init-secrets.sh — Phase 26 (DEPLOY-22)
#
# Generates 32-byte base64-random values for every `change-me-*` placeholder
# in deploy/.env. Idempotent: real values are never overwritten. Sets
# permission 600 on deploy/.env when done.
#
# Usage:
#   cp deploy/.env.production.example deploy/.env
#   bash deploy/scripts/init-secrets.sh
#   $EDITOR deploy/.env   # fill DOMAIN, GHCR_ORG, ADMIN_EMAIL by hand
#
# Re-running this script after the first run is safe — it skips any value
# that does not match the change-me- placeholder pattern.
# ============================================================================

set -euo pipefail

# Resolve repo-root-relative path so the script works whether invoked from
# the repo root or from deploy/ itself.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found." >&2
  echo "Run: cp deploy/.env.production.example deploy/.env  first." >&2
  exit 1
fi

# Variables that hold secret material and SHOULD be regenerated when blank
# or placeholder. DOMAIN / GHCR_ORG / ADMIN_EMAIL are deliberately NOT here:
# those are operator-supplied identifiers, not secrets.
SECRET_VARS=(
  DB_PASSWORD
  NEXTAUTH_SECRET
  BETTER_AUTH_SECRET
  MINIO_ROOT_PASSWORD
  JWT_PLAYBACK_SECRET
  ADMIN_PASSWORD
)

generated=0
already_set=0
placeholders_found=0

# Cross-platform sed -i (BSD vs GNU). macOS bash uses BSD sed which
# requires an empty string after -i; Linux GNU sed rejects that empty arg.
sed_inplace() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

for VAR in "${SECRET_VARS[@]}"; do
  # Read current value via grep + cut; tolerant of `=` in value (cut -d= -f2-).
  CURRENT=$(grep "^${VAR}=" "${ENV_FILE}" | head -n1 | cut -d= -f2- || true)

  # Detect: empty | starts with change-me- | literally <generated>
  if [[ -z "${CURRENT}" ]] || [[ "${CURRENT}" == change-me-* ]] || [[ "${CURRENT}" == "<generated>" ]]; then
    placeholders_found=$((placeholders_found + 1))
    # 32 random bytes → base64 → strip padding `=` to avoid shell-escaping pain.
    NEW_VALUE=$(openssl rand -base64 32 | tr -d '=' | tr -d '\n')
    # Use a delimiter unlikely to collide with the value (`|`).
    sed_inplace "s|^${VAR}=.*|${VAR}=${NEW_VALUE}|" "${ENV_FILE}"
    generated=$((generated + 1))
    echo "  + Generated ${VAR}"
  else
    already_set=$((already_set + 1))
    echo "  = Skipped ${VAR} (already set)"
  fi
done

chmod 600 "${ENV_FILE}"

echo ""
echo "init-secrets.sh: done."
echo "  Generated:        ${generated}"
echo "  Already set:      ${already_set}"
echo "  Placeholders hit: ${placeholders_found}"
echo "  File: ${ENV_FILE} (perms 600)"
echo ""
echo "Next: edit ${ENV_FILE} and fill DOMAIN, GHCR_ORG, ADMIN_EMAIL by hand."
