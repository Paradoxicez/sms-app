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
// naturally (rolbypassrls=true). Tests that need to verify RLS enforcement
// explicitly switch to the app_user role inside a transaction via
// `SET ROLE app_user` / `RESET ROLE` (see tests/tenancy/rls-isolation.test.ts).
//
// Rationale (Gap 15.1, positive-signal bypass): with the new policy shape,
// app_user sees zero rows unless app.is_superuser='true' is set. Running the
// test harness as app_user would force every seed/fixture call to opt into
// that flag, which (a) is noisy and (b) risks masking real RLS bugs. Using
// the superuser role matches how migrations and seeds run in production.
export const testPrisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

beforeAll(async () => {
  await testPrisma.$connect();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
