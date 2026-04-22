#!/usr/bin/env bash
set -euo pipefail

# Bootstrap the vitest test database. Idempotent — safe to re-run.
# Reads TEST_DATABASE_URL from .env.test (or the environment).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env.test if present (POSIX-safe export).
if [ -f "$API_DIR/.env.test" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$API_DIR/.env.test"
  set +a
fi

if [ -z "${TEST_DATABASE_URL:-}" ]; then
  echo "ERROR: TEST_DATABASE_URL is not set. Copy apps/api/.env.test.example to apps/api/.env.test." >&2
  exit 1
fi

# Parse the DB name from the URL (last path segment, strip query string).
TEST_DB_NAME="$(printf '%s' "$TEST_DATABASE_URL" | sed -E 's|.*/([^/?]+)(\?.*)?$|\1|')"

# Hard guard: refuse to bootstrap anything that doesn't look like a test DB.
case "$TEST_DB_NAME" in
  *test*) ;;
  *)
    echo "ERROR: TEST_DATABASE_URL database name '$TEST_DB_NAME' does not contain 'test'. Refusing to bootstrap." >&2
    exit 1
    ;;
esac

# CREATE DATABASE if it does not exist (Postgres has no IF NOT EXISTS for CREATE DATABASE).
# Connect to the 'postgres' maintenance DB on the same host to issue the CREATE.
ADMIN_URL="$(printf '%s' "$TEST_DATABASE_URL" | sed -E "s|/${TEST_DB_NAME}(\?.*)?$|/postgres\1|")"

echo "[setup-test-db] Ensuring database '$TEST_DB_NAME' exists..."
psql "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname='$TEST_DB_NAME'" | grep -q 1 \
  || psql "$ADMIN_URL" -c "CREATE DATABASE \"$TEST_DB_NAME\""

# Drop and recreate the public schema to make the bootstrap fully idempotent.
# Several RLS migration files use bare `CREATE POLICY` (not `CREATE OR REPLACE`),
# which would fail on re-run. The test DB is ephemeral so wiping `public` between
# runs has no cost and guarantees a clean slate.
echo "[setup-test-db] Resetting public schema in '$TEST_DB_NAME'..."
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

# Phase 19 / D-10c: Pre-push Camera dedup (camera_stream_url_unique).
#
# The dedup SQL must land BEFORE `prisma db push` creates the new
# @@unique([orgId, streamUrl]) index — otherwise constraint creation fails on
# any existing duplicate rows. On a freshly dropped schema there is no
# "Camera" table yet, so we guard with an information_schema check via a
# DO-block. This keeps the step robust to both fresh-drop and
# operator-seeded-snapshot flows (and stays idempotent on re-runs).
echo "[setup-test-db] Pre-push dedup (camera_stream_url_unique)..."
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Camera') THEN
    DELETE FROM "Camera" c
    USING "Camera" c2
    WHERE c."orgId" = c2."orgId"
      AND c."streamUrl" = c2."streamUrl"
      AND c."createdAt" > c2."createdAt";
  END IF;
END $$;
SQL

echo "[setup-test-db] Pushing Prisma schema to '$TEST_DB_NAME'..."
# (dedup SQL for camera_stream_url_unique has already run above — see the
# "Pre-push dedup" step directly before this echo.)
DATABASE_URL="$TEST_DATABASE_URL" pnpm --dir "$API_DIR" exec prisma db push --skip-generate --accept-data-loss

# Apply RLS the same way the dev DB receives it. We need three things:
#   1. app_user role + table/sequence grants (rls.policies.sql)
#   2. RLS on Member/Invitation/UPO/AuditLog/Notification/NotificationPreference
#      (rls.policies.sql — already includes positive-signal bypass)
#   3. RLS on Camera/Project/Site/StreamProfile/PlaybackSession/Policy/ApiKey/
#      WebhookSubscription/OrgSettings/Recording/RecordingSegment/RecordingSchedule
#      (rls_apply_all/migration.sql — older NULL-bypass)
#   4. Replace older bypasses with positive-signal version
#      (rls_superuser_bypass_positive_signal/migration.sql, idempotent DROP IF EXISTS)
#
# The schema was just dropped+recreated, so grants must be re-applied (default
# privileges are tied to the schema and are gone after DROP SCHEMA CASCADE).
echo "[setup-test-db] Applying RLS policies + grants to '$TEST_DB_NAME'..."
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$API_DIR/src/prisma/rls.policies.sql"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$API_DIR/src/prisma/migrations/rls_apply_all/migration.sql"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$API_DIR/src/prisma/migrations/rls_superuser_bypass_positive_signal/migration.sql"

# Backfill grants for tables that may have been created without inheriting the
# default privileges (Postgres default-privilege rules apply only when the
# granting role matches the table owner at creation time).
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;"

echo "[setup-test-db] Done."
