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
