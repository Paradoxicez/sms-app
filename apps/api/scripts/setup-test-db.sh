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

# Phase 23 DEBT-05: setup-test-db now uses Prisma migration history as the
# single source of truth. The 0_init migration contains every RLS policy +
# grant the old chain applied. The schema was DROP CASCADE'd above (line 48),
# so `migrate deploy` re-applies the squashed 0_init cleanly on every run.
echo "[setup-test-db] Applying Prisma migrations to '$TEST_DB_NAME'..."
DATABASE_URL="$TEST_DATABASE_URL" pnpm --dir "$API_DIR" exec prisma migrate deploy

# Defensive grant backfill — Postgres default-privilege rules apply only when
# the granting role matches the table owner at creation time. The 0_init
# migration grants on existing tables, but if a future change leaves new tables
# ungranted we want the test DB to keep working. Idempotent.
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;"

echo "[setup-test-db] Done."
