import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll } from 'vitest';

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
  datasourceUrl: process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL,
});

beforeAll(async () => {
  await testPrisma.$connect();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
