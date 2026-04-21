# Quick Task 260421-dlg: isolate vitest from dev DB - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Task Boundary

Isolate the apps/api vitest suite so it never touches the dev database. Currently `apps/api/tests/setup.ts` cleanup wipes real Camera/Site/Project/Organization/PlaybackSession/Recording rows because both dev and test point at the same `sms_platform` database via `DATABASE_URL_MIGRATE`.

Scope is **infrastructure only** — adding a separate test database, wiring vitest to use it, and updating CI scripts. No application logic changes. No new test patterns introduced.

</domain>

<decisions>
## Implementation Decisions

### Isolation Strategy
- **Separate database** named `sms_platform_test`, hosted in the same `sms-app-postgres-1` docker container as dev
- Vitest reads `TEST_DATABASE_URL` (or falls back to a derived value) and overrides Prisma's connection during test runs
- Migrations + RLS policies applied to the test database via the existing `db:push` pipeline before tests run
- Cleanup logic in `tests/setup.ts` stays as-is (TRUNCATE/DELETE) — it's now safe because the target DB is dedicated to tests

### Claude's Discretion
- **Database provisioning:** reuse existing postgres container, add a `psql -c "CREATE DATABASE sms_platform_test"` bootstrap step in test setup script (no new docker container)
- **Cleanup strategy:** keep the existing per-test TRUNCATE pattern; no behavior change beyond the connection target
- **CI/local config:** introduce `apps/api/.env.test` (gitignored) + a `pretest` script that ensures the test DB exists and is migrated. Document the env precedence in apps/api/README or CLAUDE.md
- **Naming:** `TEST_DATABASE_URL` for the env var (clear, conventional)

</decisions>

<specifics>
## Specific Ideas

- The `apps/api/.env` currently has:
  - `DATABASE_URL=postgresql://app_user:...@localhost:5434/sms_platform`
  - `DATABASE_URL_MIGRATE=postgresql://sms:...@localhost:5434/sms_platform`
- After fix:
  - Tests use a third URL `TEST_DATABASE_URL=postgresql://sms:...@localhost:5434/sms_platform_test` (use the migrate role since tests need DDL/RLS)
  - The vitest config (or `tests/setup.ts`) sets `process.env.DATABASE_URL = TEST_DATABASE_URL` before any Prisma client is constructed
- Pre-test bootstrap: `CREATE DATABASE IF NOT EXISTS sms_platform_test` (psql one-liner) + run `prisma db push` against it + apply RLS migration SQL (mirrors the existing `db:push` script)
- The 8 services that just adopted SystemPrismaService also need to pick up the new connection — they will automatically because both PrismaService and SystemPrismaService read from `process.env.DATABASE_URL`

</specifics>

<canonical_refs>
## Canonical References

No external specs — Vitest + Prisma + Postgres standard pattern.

In-repo files relevant to the planner:
- `apps/api/.env` (current dev/test URL)
- `apps/api/vitest.config.ts` (where to inject DATABASE_URL override)
- `apps/api/tests/setup.ts` (where Prisma client is constructed for tests)
- `apps/api/package.json` `db:push` script (template for the test DB bootstrap)
- `apps/api/src/prisma/migrations/rls_apply_all/migration.sql` (RLS policies that must apply to test DB too)

</canonical_refs>
