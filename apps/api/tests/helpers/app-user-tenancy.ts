/**
 * app-user-tenancy.ts — Integration test harness bound to the production
 * RLS posture (app_user role, FORCE ROW LEVEL SECURITY enforced).
 *
 * WHY A SECOND PrismaClient?
 *   The existing `testPrisma` (tests/setup.ts) connects as the `sms` superuser
 *   which has `rolbypassrls=true`. That connection is perfect for seed/fixture
 *   work — DELETE/INSERT don't need set_config prologues — but it cannot
 *   exercise the production code path where the API runs as `app_user` and
 *   FORCE RLS is unconditionally enforced.
 *
 *   Guards/services that query RLS-enforced tables (Member, Camera, AuditLog,
 *   RecordingSegment, etc.) must emit `set_config('app.current_org_id', ...)`
 *   or `set_config('app.is_superuser', 'true')` BEFORE the read — otherwise
 *   every query returns zero rows. The bug root-caused in
 *   .planning/debug/org-admin-cannot-add-team-members.md hid behind the sms
 *   superuser test client for weeks.
 *
 *   This helper exposes a real app_user PrismaClient plus the tenancy
 *   extension wrapping so guard/service constructors can be exercised
 *   end-to-end under FORCE RLS.
 *
 * LIFECYCLE:
 *   Tests are responsible for calling `await appUserPrisma.$disconnect()` in
 *   `afterAll`. No implicit cleanup — we avoid a process-scoped singleton to
 *   prevent cross-file pool contention.
 *
 * SEE ALSO:
 *   - apps/api/tests/setup.ts — why testPrisma uses sms superuser
 *   - apps/api/tests/tenancy/rls-isolation.test.ts:78-87 — app_user role
 *     creation pattern (copied here so tests can run standalone)
 *   - apps/api/src/tenancy/prisma-tenancy.extension.ts — TENANCY_CLIENT
 *     extension that emits set_config via CLS signals
 */

import { PrismaClient } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';
import { testPrisma } from '../setup';
import { createTenancyExtension } from '../../src/tenancy/prisma-tenancy.extension';

/**
 * Build a Postgres URL for the `app_user` role by swapping the username and
 * password on the current `process.env.DATABASE_URL` (which the test harness
 * points at the sms superuser via globalSetup). Host/port/dbname/params are
 * preserved; `connection_limit=5` is appended so the extra pool doesn't
 * crowd the main `testPrisma` pool.
 *
 * Uses the WHATWG URL parser so escaping is handled correctly.
 */
export function buildAppUserDatasourceUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      '[app-user-tenancy] process.env.DATABASE_URL is not set — cannot build app_user URL.',
    );
  }
  const url = new URL(base);
  url.username = 'app_user';
  url.password = 'sms_app_user_password';
  // Append connection_limit if not already set — avoids pool exhaustion when
  // multiple integration tests run in the same process.
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', '5');
  }
  return url.toString();
}

/**
 * Ensure the `app_user` Postgres role exists with the grants required to run
 * SELECT/INSERT/UPDATE/DELETE against the schema (without rolbypassrls).
 *
 * Mirrors tests/tenancy/rls-isolation.test.ts:78-87. Idempotent — safe to run
 * across multiple describe() blocks.
 */
async function ensureAppUserRoleExists(): Promise<void> {
  await testPrisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN PASSWORD 'sms_app_user_password';
      END IF;
    END $$;
  `);
  await testPrisma.$executeRawUnsafe(
    `GRANT USAGE ON SCHEMA public TO app_user`,
  );
  await testPrisma.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user`,
  );
  await testPrisma.$executeRawUnsafe(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user`,
  );
}

/**
 * Construct a PrismaClient bound to the `app_user` role — the production
 * connection posture under FORCE RLS. Ensures the role exists first (via
 * testPrisma as superuser) then connects.
 *
 * Caller is responsible for `$disconnect()` in afterAll.
 */
export async function createAppUserPrisma(): Promise<PrismaClient> {
  await ensureAppUserRoleExists();
  const client = new PrismaClient({ datasourceUrl: buildAppUserDatasourceUrl() });
  await client.$connect();
  return client;
}

/**
 * Wrap an app_user PrismaClient in the tenancy extension so guard/service
 * tests can receive the same TENANCY_CLIENT-shaped client that production DI
 * provides. After the extension is applied, queries emit set_config via CLS
 * signals exactly like production.
 */
export function createAppUserTenancyClient(
  appUserPrisma: PrismaClient,
  cls: ClsService,
) {
  return createTenancyExtension(appUserPrisma, cls);
}

/**
 * Minimal ClsService stub for guard/service unit tests. Backed by a Map so
 * tests can inspect which CLS keys were set after the guard ran. Structurally
 * compatible with `ClsService` via `as unknown as ClsService`.
 */
export function makeTestClsService(
  initial: Record<string, string> = {},
): ClsService {
  const store = new Map<string, string>(Object.entries(initial));
  const stub = {
    set(key: string, value: string): void {
      store.set(key, value);
    },
    get<T = unknown>(key: string): T | undefined {
      return store.get(key) as T | undefined;
    },
    has(key: string): boolean {
      return store.has(key);
    },
  };
  return stub as unknown as ClsService;
}
