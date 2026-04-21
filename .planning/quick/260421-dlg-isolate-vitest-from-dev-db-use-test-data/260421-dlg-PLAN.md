---
phase: 260421-dlg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/.env.test.example
  - apps/api/scripts/setup-test-db.sh
  - apps/api/tests/global-setup.ts
  - apps/api/tests/setup.ts
  - apps/api/vitest.config.ts
  - apps/api/package.json
  - .gitignore
autonomous: false
requirements:
  - QUICK-260421-dlg
must_haves:
  truths:
    - "Dev DB rows survive a full `pnpm test` run (sentinel row remains untouched)"
    - "A dedicated `sms_platform_test` database exists in the postgres container with the full Prisma schema and all RLS policies applied"
    - "Vitest setup throws a loud error and aborts before any Prisma connection if `TEST_DATABASE_URL` equals the dev `DATABASE_URL` OR the test DB name does not contain the substring `test`"
    - "Both PrismaService (app_user) and SystemPrismaService (sms superuser) constructed during test runs connect to the test DB, not the dev DB"
  artifacts:
    - path: "apps/api/.env.test.example"
      provides: "Documented template for TEST_DATABASE_URL (committed; real .env.test gitignored)"
      contains: "TEST_DATABASE_URL=postgresql://sms:sms_dev_password@localhost:5434/sms_platform_test"
    - path: "apps/api/scripts/setup-test-db.sh"
      provides: "Idempotent bootstrap: CREATE DATABASE if missing + prisma db push + RLS migration apply against TEST_DATABASE_URL"
      min_lines: 25
    - path: "apps/api/tests/global-setup.ts"
      provides: "Vitest globalSetup hook that rewrites process.env.DATABASE_URL to TEST_DATABASE_URL and runs the safety guard BEFORE any test file (and therefore any Prisma client) is loaded"
    - path: "apps/api/tests/setup.ts"
      provides: "Updated per-file setup that uses TEST_DATABASE_URL (or the rewritten DATABASE_URL) and re-asserts the safety guard for defense in depth"
    - path: "apps/api/vitest.config.ts"
      provides: "Wires globalSetup + keeps existing setupFiles, fileParallelism, deps.inline configuration intact"
    - path: "apps/api/package.json"
      provides: "Adds db:test:setup script + extends pretest hook to run db:test:setup before each `pnpm test` invocation"
    - path: ".gitignore"
      provides: "Excludes apps/api/.env.test (real) while permitting .env.test.example (template)"
  key_links:
    - from: "apps/api/package.json pretest"
      to: "apps/api/scripts/setup-test-db.sh"
      via: "npm script chain (pretest → db:test:setup → bash scripts/setup-test-db.sh)"
      pattern: "\"pretest\".*setup-test-db"
    - from: "apps/api/scripts/setup-test-db.sh"
      to: "sms_platform_test database (full schema + RLS)"
      via: "psql CREATE DATABASE + prisma db push --skip-generate against TEST_DATABASE_URL + psql -f rls_apply_all/migration.sql"
      pattern: "TEST_DATABASE_URL.*prisma db push"
    - from: "apps/api/tests/global-setup.ts"
      to: "process.env.DATABASE_URL (rewritten to TEST_DATABASE_URL)"
      via: "vitest globalSetup hook executed before any test file load"
      pattern: "process\\.env\\.DATABASE_URL\\s*=\\s*process\\.env\\.TEST_DATABASE_URL"
    - from: "PrismaService / SystemPrismaService constructors"
      to: "test database connection"
      via: "process.env.DATABASE_URL (and DATABASE_URL_MIGRATE) now point at TEST_DATABASE_URL because globalSetup rewrote them"
      pattern: "datasourceUrl.*process\\.env\\.DATABASE_URL"
---

<objective>
Isolate the apps/api vitest suite from the shared dev `sms_platform` database so test cleanup (TRUNCATE/DELETE in `tests/setup.ts`) can never wipe real Camera/Site/Project/Organization/PlaybackSession/Recording rows again.

Purpose: The current setup points BOTH dev and tests at `sms_platform` via `DATABASE_URL_MIGRATE`. Running `pnpm test` deletes real data. CONTEXT.md locked the strategy: a dedicated `sms_platform_test` database in the same docker container, vitest reads `TEST_DATABASE_URL` and overrides Prisma's connection BEFORE any client is constructed.

Output: a separate, schema-equivalent `sms_platform_test` database, an idempotent bootstrap script, a vitest globalSetup that rewrites the connection env var with a hard safety guard, and an end-to-end manual verification that the dev DB is untouched after a full test run.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260421-dlg-isolate-vitest-from-dev-db-use-test-data/260421-dlg-CONTEXT.md
@apps/api/.env
@apps/api/vitest.config.ts
@apps/api/tests/setup.ts
@apps/api/package.json
@apps/api/src/prisma/migrations/rls_apply_all/migration.sql
@apps/api/src/prisma/system-prisma.service.ts
@apps/api/src/prisma/prisma.service.ts

<interfaces>
<!-- Key contracts the executor needs. Extracted from the codebase. -->
<!-- Use these directly — no codebase exploration required. -->

Current `apps/api/.env` (relevant lines):
```
DATABASE_URL=postgresql://app_user:sms_app_user_password@localhost:5434/sms_platform
DATABASE_URL_MIGRATE=postgresql://sms:sms_dev_password@localhost:5434/sms_platform
```

Target additions for `apps/api/.env.test.example` (and a real `.env.test` the user creates locally, gitignored):
```
TEST_DATABASE_URL=postgresql://sms:sms_dev_password@localhost:5434/sms_platform_test
```

Current `apps/api/tests/setup.ts` (Prisma is constructed at MODULE LOAD time — this is critical for the rewrite-before-import requirement):
```typescript
export const testPrisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL,
});
```

Current `apps/api/vitest.config.ts` (must preserve `fileParallelism: false`, `deps.inline`, `setupFiles`):
```typescript
export default defineConfig({
  test: {
    globals: true,
    root: '.',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    passWithNoTests: true,
    fileParallelism: false,
    server: { deps: { inline: [/better-auth/, /@better-auth\/.*/] } },
  },
});
```

Current `apps/api/package.json` scripts:
```json
"test": "vitest run --reporter=verbose",
"pretest": "prisma generate",
"db:push": "prisma db push && psql $DATABASE_URL_MIGRATE -f src/prisma/migrations/rls_apply_all/migration.sql",
```

Postgres container name (from project conventions): `sms-app-postgres-1`, port `5434`, superuser `sms` / password `sms_dev_password`.

Service classes that read `process.env.DATABASE_URL` (will pick up the rewrite automatically — no code change required in app code):
```typescript
// PrismaService — uses Prisma's default (DATABASE_URL from env)
// SystemPrismaService — datasourceUrl: process.env.SYSTEM_DATABASE_URL || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL
```

Vitest globalSetup contract (https://vitest.dev/config/#globalsetup):
- Runs ONCE before all test files are loaded
- Mutations to `process.env` persist into the worker process
- Returns an optional teardown function
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Bootstrap test DB + wire vitest config (single atomic change)</name>
  <files>
    apps/api/.env.test.example,
    apps/api/scripts/setup-test-db.sh,
    apps/api/tests/global-setup.ts,
    apps/api/tests/setup.ts,
    apps/api/vitest.config.ts,
    apps/api/package.json,
    .gitignore
  </files>
  <action>
Implement the test-DB isolation as ONE coherent change. Order matters within this task — do all of it before running tests.

**1. Add `apps/api/.env.test.example`** (committed):
```
# Copy to apps/api/.env.test (gitignored) and adjust if needed.
# Vitest uses this URL exclusively. Bootstrap happens via `pnpm db:test:setup`
# (auto-run by the `pretest` hook).
TEST_DATABASE_URL=postgresql://sms:sms_dev_password@localhost:5434/sms_platform_test
```
Also create a real `apps/api/.env.test` with the same content so the test run works locally without manual setup. The file will be gitignored (next step).

**2. Update `.gitignore`** — add `apps/api/.env.test` under the existing `# Environment` block:
```
.env
.env.local
apps/api/.env.test
```
Do NOT exclude `*.env.test.example`.

**3. Create `apps/api/scripts/setup-test-db.sh`** (executable: `chmod +x`):
```bash
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

echo "[setup-test-db] Pushing Prisma schema to '$TEST_DB_NAME'..."
DATABASE_URL="$TEST_DATABASE_URL" pnpm --dir "$API_DIR" exec prisma db push --skip-generate --accept-data-loss

echo "[setup-test-db] Applying RLS policies to '$TEST_DB_NAME'..."
psql "$TEST_DATABASE_URL" -f "$API_DIR/src/prisma/migrations/rls_apply_all/migration.sql"

echo "[setup-test-db] Done."
```

Notes on the script:
- Uses `set -euo pipefail` so any failure aborts.
- Loads `.env.test` if present so it works both standalone and from the `pretest` hook.
- Parses DB name from URL with `sed`; uses pattern `*test*` as defense-in-depth (matches `setup.ts` guard).
- Uses `psql` against the `postgres` maintenance DB to issue `CREATE DATABASE` (Postgres doesn't support `IF NOT EXISTS` for `CREATE DATABASE`, so the SELECT-then-CREATE pattern is the canonical workaround).
- `prisma db push --skip-generate --accept-data-loss` is safe here because we're targeting a dedicated test DB; `--accept-data-loss` prevents the interactive prompt blocking CI.
- RLS migration runs as the URL's role (sms superuser), matching `db:push`.

**4. Create `apps/api/tests/global-setup.ts`** — runs ONCE before any test file loads:
```typescript
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Vitest globalSetup — runs ONCE before any test file is imported.
 *
 * Critical: this file MUST rewrite process.env.DATABASE_URL (and
 * DATABASE_URL_MIGRATE) BEFORE tests/setup.ts constructs `testPrisma`,
 * and BEFORE any application code that lazily reads `process.env.DATABASE_URL`
 * (PrismaService, SystemPrismaService) is loaded.
 *
 * It also enforces a hard safety guard: refuse to run if the test DB
 * collides with the dev DB or doesn't look like a test DB by name. This
 * prevents accidental dev-DB wipe if .env.test is misconfigured.
 */

function loadEnvTest(): void {
  const envTestPath = resolve(__dirname, '..', '.env.test');
  if (!existsSync(envTestPath)) return;
  const contents = readFileSync(envTestPath, 'utf8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function dbNameFromUrl(url: string): string {
  // postgresql://user:pass@host:port/dbname?query
  const match = url.match(/\/([^/?]+)(\?.*)?$/);
  return match ? match[1] : '';
}

export default async function setup(): Promise<void> {
  loadEnvTest();

  const testUrl = process.env.TEST_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL;

  if (!testUrl) {
    throw new Error(
      '[vitest globalSetup] TEST_DATABASE_URL is not set. ' +
        'Copy apps/api/.env.test.example to apps/api/.env.test before running tests.',
    );
  }

  if (devUrl && testUrl === devUrl) {
    throw new Error(
      '[vitest globalSetup] FATAL: TEST_DATABASE_URL equals DATABASE_URL. ' +
        'Refusing to run tests — this would wipe the dev database. ' +
        'Set TEST_DATABASE_URL to a dedicated test database (e.g. sms_platform_test).',
    );
  }

  const testDbName = dbNameFromUrl(testUrl);
  if (!/test/i.test(testDbName)) {
    throw new Error(
      `[vitest globalSetup] FATAL: TEST_DATABASE_URL database name '${testDbName}' ` +
        "does not contain 'test'. Refusing to run — guard against misconfiguration.",
    );
  }

  // Rewrite the env vars Prisma reads. Both PrismaService (DATABASE_URL) and
  // SystemPrismaService (DATABASE_URL_MIGRATE / DATABASE_URL) must point at
  // the test DB. We use the same TEST_DATABASE_URL for both because the
  // test harness already runs as the sms superuser (see tests/setup.ts).
  process.env.DATABASE_URL = testUrl;
  process.env.DATABASE_URL_MIGRATE = testUrl;
  process.env.SYSTEM_DATABASE_URL = testUrl;

  // Surface the rewrite once so test logs make the connection target obvious.
  // eslint-disable-next-line no-console
  console.log(`[vitest globalSetup] DATABASE_URL → ${testDbName}`);
}
```

**5. Update `apps/api/tests/setup.ts`** — add a defense-in-depth guard and switch the source of truth to `DATABASE_URL` (which globalSetup has rewritten):
```typescript
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll } from 'vitest';

// Defense in depth: globalSetup already rewrote DATABASE_URL to TEST_DATABASE_URL
// and validated the safety guards. Re-assert here so a misconfigured run that
// somehow bypassed globalSetup still aborts before opening a connection.
const activeUrl = process.env.DATABASE_URL ?? '';
const dbName = activeUrl.match(/\/([^/?]+)(\?.*)?$/)?.[1] ?? '';
if (!/test/i.test(dbName)) {
  throw new Error(
    `[tests/setup.ts] FATAL: active database '${dbName}' is not a test database. ` +
      'Aborting to prevent dev-data loss.',
  );
}

// Tests connect as the database superuser (sms) so seed inserts bypass RLS
// naturally. Tests that need to verify RLS enforcement explicitly switch to
// app_user via SET ROLE inside a transaction (see tests/tenancy/rls-isolation.test.ts).
export const testPrisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

beforeAll(async () => {
  await testPrisma.$connect();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
```

**6. Update `apps/api/vitest.config.ts`** — wire globalSetup, keep everything else:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    passWithNoTests: true,
    fileParallelism: false,
    server: {
      deps: {
        inline: [/better-auth/, /@better-auth\/.*/],
      },
    },
  },
});
```

**7. Update `apps/api/package.json` scripts** — add `db:test:setup` and chain it into `pretest`:
```json
"test": "vitest run --reporter=verbose",
"pretest": "prisma generate && pnpm run db:test:setup",
"db:test:setup": "bash scripts/setup-test-db.sh",
```
Keep all other scripts as-is. Do NOT export DATABASE_URL inside the `test` script — the globalSetup handles the override at runtime, which is more reliable than shell-level env munging across npm/pnpm/Vitest's worker boundaries.

**Why this ordering:**
- `globalSetup` runs before `setupFiles`, so by the time `tests/setup.ts` executes `new PrismaClient(...)` the env is already correct.
- The script's hard guards (`*test*` in DB name + URL inequality) make accidental dev-DB wipe physically impossible: the test process aborts BEFORE opening a connection.
- We rewrite all three Prisma-relevant env vars (`DATABASE_URL`, `DATABASE_URL_MIGRATE`, `SYSTEM_DATABASE_URL`) so every Prisma client instantiated during tests — `testPrisma`, `PrismaService`, `SystemPrismaService` — connects to the test DB.
- `--accept-data-loss` on `prisma db push` is intentional: the test DB is ephemeral and we never care about its data between runs.

**Do not:**
- Edit `tests/**/*.test.ts` files (cleanup logic stays as-is per CONTEXT.md scope).
- Edit `PrismaService` or `SystemPrismaService` source — they already read from `process.env`, which we rewrite.
- Add `dotenv-cli` as a dependency — `loadEnvTest()` in globalSetup is a 15-line replacement with zero new packages.
  </action>
  <verify>
<automated>cd apps/api && pnpm test 2>&1 | tee /tmp/vitest-test-db-isolation.log | tail -40 && grep -q "DATABASE_URL → sms_platform_test" /tmp/vitest-test-db-isolation.log && echo "VERIFIED: globalSetup rewrote connection target" && docker exec sms-app-postgres-1 psql -U sms -lqt | cut -d '|' -f 1 | grep -qw sms_platform_test && echo "VERIFIED: sms_platform_test database exists"</automated>
  </verify>
  <done>
- `apps/api/.env.test.example` is committed; `apps/api/.env.test` exists locally and is gitignored
- `apps/api/scripts/setup-test-db.sh` is executable and creates `sms_platform_test` (idempotent re-run is a no-op)
- `pnpm test` from `apps/api/` passes (no Prisma connection errors), the test log shows `[vitest globalSetup] DATABASE_URL → sms_platform_test`, and `docker exec sms-app-postgres-1 psql -U sms -l` lists `sms_platform_test`
- The `pretest` hook runs `setup-test-db.sh` automatically; running `pnpm test` from a clean clone (after `apps/api/.env.test` exists) bootstraps the test DB on first run
- Both `PrismaService` and `SystemPrismaService` instantiated during tests connect to `sms_platform_test` (verified by the globalSetup rewrite log + the safety guard in `tests/setup.ts`)
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify dev DB is untouched + safety guard fires correctly</name>
  <files>
    (no files modified — verification-only checkpoint)
  </files>
  <action>
Pause execution and present the verification steps below to the user. Do NOT run any of the verification commands automatically — the human must perform them so they can visually confirm the dev DB is untouched. Wait for the user to type "approved" or describe a failure. After approval, run the sentinel cleanup command shown in step "After verifying" below.
  </action>
  <verify>
    <automated>echo "Manual checkpoint — see <how-to-verify> for human steps. No automated verify."</automated>
  </verify>
  <done>
User confirms with "approved" after running all four checks (sentinel survives, test DB exists, workspace-root invocation works, safety guard fires). Sentinel cleanup command has been executed.
  </done>
  <what-built>
A separate `sms_platform_test` database with full schema + RLS, a vitest globalSetup that rewrites `DATABASE_URL` before any Prisma client is constructed, a hard safety guard that aborts the test run if the test DB collides with dev or lacks `test` in its name, and an idempotent bootstrap script wired into `pretest`.
  </what-built>
  <how-to-verify>
Run all four checks. Do not approve unless every step matches the expected outcome.

**Check 1 — Dev DB sentinel survives a full test run:**
```bash
# Insert a sentinel into the DEV database (not the test one).
docker exec sms-app-postgres-1 psql -U sms -d sms_platform -c \
  "INSERT INTO \"Organization\" (id, name, slug, \"createdAt\", \"updatedAt\") VALUES ('sentinel-test-260421', 'Sentinel 260421', 'sentinel-test-260421', NOW(), NOW()) ON CONFLICT (id) DO NOTHING;"

# Run the full test suite.
cd apps/api && pnpm test

# Confirm the sentinel still exists in DEV.
docker exec sms-app-postgres-1 psql -U sms -d sms_platform -c \
  "SELECT id, name FROM \"Organization\" WHERE id='sentinel-test-260421';"
```
Expected: the sentinel row is still present in `sms_platform` (dev). Tests passed.

**Check 2 — Test database was actually used:**
```bash
docker exec sms-app-postgres-1 psql -U sms -l | grep sms_platform_test
```
Expected: `sms_platform_test` is listed.

**Check 3 — CI-style invocation works from the workspace root:**
```bash
pnpm --filter @sms-platform/api test
```
Expected: tests pass with the same `[vitest globalSetup] DATABASE_URL → sms_platform_test` log line.

**Check 4 — Safety guard fires when misconfigured:**
```bash
# Temporarily collide test URL with dev URL.
cd apps/api
TEST_DATABASE_URL="$DATABASE_URL_MIGRATE" pnpm test 2>&1 | tail -10
```
Expected: the run aborts with `FATAL: TEST_DATABASE_URL equals DATABASE_URL` (or `'sms_platform' does not contain 'test'`) BEFORE any test file executes. Exit code is non-zero.

After verifying all four, clean up the sentinel:
```bash
docker exec sms-app-postgres-1 psql -U sms -d sms_platform -c \
  "DELETE FROM \"Organization\" WHERE id='sentinel-test-260421';"
```
  </how-to-verify>
  <resume-signal>Type "approved" if all four checks pass, or describe which check failed and the observed output.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| vitest worker process → Postgres | Tests run TRUNCATE/DELETE with sms-superuser credentials; the boundary that must protect dev data is the connection-target selection (which DB the URL points at) |
| developer shell env → vitest globalSetup | A misconfigured `.env.test` (or a missing one) could silently cause tests to target the dev DB |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260421-dlg-01 | Tampering / Denial-of-Service (data loss) | tests/setup.ts cleanup logic when DATABASE_URL == dev | mitigate | Two-layer guard: (1) globalSetup throws before any Prisma client is constructed if `TEST_DATABASE_URL == DATABASE_URL` OR if the test DB name lacks `test`; (2) tests/setup.ts re-asserts the same DB-name guard as defense in depth before constructing `testPrisma`. setup-test-db.sh ALSO refuses to bootstrap a non-`*test*` DB. |
| T-260421-dlg-02 | Information Disclosure | apps/api/.env.test (committed by mistake) | mitigate | Add `apps/api/.env.test` to `.gitignore`; commit only `.env.test.example` template with non-secret connection string (uses already-committed dev creds, no production secrets). |
| T-260421-dlg-03 | Tampering | Test DB lacks RLS policies → tests pass that should fail under prod RLS | mitigate | setup-test-db.sh applies `rls_apply_all/migration.sql` after `prisma db push`, mirroring the existing `db:push` script. Verified by existing `tests/tenancy/rls-isolation.test.ts` which depends on RLS policies being present. |
| T-260421-dlg-04 | Elevation of Privilege | Test process connects as wrong role | accept | Tests intentionally connect as `sms` superuser (per existing `tests/setup.ts` rationale). No change in this plan. |
</threat_model>

<verification>
- `pnpm test` from `apps/api/` exits 0 and the log contains `[vitest globalSetup] DATABASE_URL → sms_platform_test`
- `docker exec sms-app-postgres-1 psql -U sms -l` lists `sms_platform_test`
- A sentinel `Organization` row inserted into `sms_platform` (dev) before `pnpm test` is still present after `pnpm test` completes
- `TEST_DATABASE_URL=$DATABASE_URL_MIGRATE pnpm test` aborts with the FATAL guard message before any test file runs
- `apps/api/.env.test` is gitignored; `apps/api/.env.test.example` is committed
- Re-running `pnpm db:test:setup` is a no-op (idempotent CREATE DATABASE pattern)
</verification>

<success_criteria>
- Vitest tests target `sms_platform_test`, never `sms_platform`
- Dev DB rows survive `pnpm test`
- Misconfiguration (TEST_DATABASE_URL==DATABASE_URL, or test DB name without `test`) is impossible: the run aborts before connecting
- Test DB has full schema + all RLS policies (so `tests/tenancy/rls-isolation.test.ts` and other RLS-dependent tests still work)
- Zero changes to test cleanup logic, zero changes to application code (`PrismaService`, `SystemPrismaService` untouched)
- `pretest` hook makes the bootstrap automatic — no manual setup step beyond copying `.env.test.example` once
</success_criteria>

<output>
After completion, create `.planning/quick/260421-dlg-isolate-vitest-from-dev-db-use-test-data/260421-dlg-SUMMARY.md` capturing: which files were created/modified, the safety-guard mechanism, the verification results from Task 2, and any deviations from this plan.
</output>
