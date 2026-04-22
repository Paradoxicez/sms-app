import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { testPrisma } from '../setup';
import {
  duplicateFixture,
  expectedSurvivorIds,
  expectedDedupDeletedCount,
  DUPLICATE_ORG_A,
  DUPLICATE_ORG_B,
  DUPLICATE_SITE,
} from '../../src/test-utils/duplicate-fixtures';

const DEDUP_SQL = readFileSync(
  join(__dirname, '../../src/prisma/migrations/camera_stream_url_unique/migration.sql'),
  'utf8',
);

const FIXTURE_ORG_IDS = [DUPLICATE_ORG_A, DUPLICATE_ORG_B];

// The migration test seeds intentional duplicates bypassing Prisma's @@unique.
// Approach:
//   - Before each test, drop the @@unique index, clean fixture rows, seed
//     base Org/Project/Site rows + the 7-row duplicateFixture via raw SQL.
//   - Run the dedup SQL and assert survivors.
//   - After each test, re-add the @@unique index (idempotent CREATE IF NOT EXISTS).
// This keeps the DB in the same post-Task-4 shape for subsequent test files.

const UNIQUE_INDEX_NAME = 'Camera_orgId_streamUrl_key';

async function dropUniqueIfExists() {
  await testPrisma.$executeRawUnsafe(
    `ALTER TABLE "Camera" DROP CONSTRAINT IF EXISTS "${UNIQUE_INDEX_NAME}"`,
  );
  // Prisma sometimes creates the underlying index separately; drop both shapes.
  await testPrisma.$executeRawUnsafe(
    `DROP INDEX IF EXISTS "${UNIQUE_INDEX_NAME}"`,
  );
}

async function ensureUnique() {
  // Re-add the constraint idempotently so subsequent test files see the same
  // schema shape they expect.
  try {
    await testPrisma.$executeRawUnsafe(
      `ALTER TABLE "Camera" ADD CONSTRAINT "${UNIQUE_INDEX_NAME}" UNIQUE ("orgId", "streamUrl")`,
    );
  } catch (err: any) {
    // Already present — ignore.
    if (!/already exists|duplicate/i.test(err?.message ?? '')) throw err;
  }
}

async function cleanupFixtureRows() {
  await testPrisma.$executeRawUnsafe(
    `DELETE FROM "Camera" WHERE "id" IN (${duplicateFixture
      .map((r) => `'${r.id}'`)
      .join(',')})`,
  );
  await testPrisma.$executeRawUnsafe(
    `DELETE FROM "Site" WHERE "id" = '${DUPLICATE_SITE}'`,
  );
  await testPrisma.$executeRawUnsafe(
    `DELETE FROM "Project" WHERE "orgId" IN (${FIXTURE_ORG_IDS.map(
      (o) => `'${o}'`,
    ).join(',')})`,
  );
  await testPrisma.$executeRawUnsafe(
    `DELETE FROM "Organization" WHERE "id" IN (${FIXTURE_ORG_IDS.map(
      (o) => `'${o}'`,
    ).join(',')})`,
  );
}

async function seedBaseRows() {
  // Organizations — use fixed test UUIDs.
  for (const orgId of FIXTURE_ORG_IDS) {
    await testPrisma.$executeRawUnsafe(`
      INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt", "isActive")
      VALUES ('${orgId}', 'dup-test-${orgId.slice(-4)}', 'dup-${orgId.slice(-4)}', NOW(), NOW(), true)
      ON CONFLICT DO NOTHING
    `);
  }

  // One Project (tied to orgA) then one Site that straddles both orgs — the
  // Site model requires a projectId, so we pick orgA's project and let both
  // orgs reference the same siteId for fixture convenience. Camera rows in
  // orgB ignore the orgId<>site.orgId mismatch because no FK enforces it at
  // the Site.orgId level.
  const projectId = '00000000-0000-0000-0000-0000000000dd';
  await testPrisma.$executeRawUnsafe(`
    INSERT INTO "Project" ("id", "orgId", "name", "createdAt", "updatedAt")
    VALUES ('${projectId}', '${DUPLICATE_ORG_A}', 'dup-project', NOW(), NOW())
    ON CONFLICT DO NOTHING
  `);
  await testPrisma.$executeRawUnsafe(`
    INSERT INTO "Site" ("id", "orgId", "projectId", "name", "createdAt", "updatedAt")
    VALUES ('${DUPLICATE_SITE}', '${DUPLICATE_ORG_A}', '${projectId}', 'dup-site', NOW(), NOW())
    ON CONFLICT DO NOTHING
  `);
}

async function seedFixtures() {
  for (const row of duplicateFixture) {
    await testPrisma.$executeRaw`
      INSERT INTO "Camera" ("id", "orgId", "siteId", "name", "streamUrl", "createdAt", "updatedAt", "status")
      VALUES (${row.id}, ${row.orgId}::uuid, ${row.siteId}::uuid, ${row.name}, ${row.streamUrl}, ${row.createdAt}, ${row.createdAt}, 'offline')
    `;
  }
}

describe('camera_stream_url_unique migration — Phase 19 (D-10c, D-11)', () => {
  beforeAll(async () => {
    // Ensure constraint is present at start so our per-test drop+readd is
    // a real operation (not a no-op on a non-migrated DB).
    await ensureUnique();
  });

  afterAll(async () => {
    await cleanupFixtureRows();
    await ensureUnique();
  });

  beforeEach(async () => {
    // Reset: drop constraint → clean → seed 7-row fixture.
    await cleanupFixtureRows();
    await dropUniqueIfExists();
    await seedBaseRows();
    await seedFixtures();
  });

  it('keep-oldest dedup: 7-row fixture collapses to 4 rows per expectedSurvivorIds', async () => {
    await testPrisma.$executeRawUnsafe(DEDUP_SQL);

    const survivors = await testPrisma.camera.findMany({
      where: { id: { in: duplicateFixture.map((r) => r.id) } },
      select: { id: true },
    });
    const survivorIds = survivors.map((s) => s.id).sort();
    expect(survivorIds).toEqual(expectedSurvivorIds.slice().sort());

    // Re-add the constraint so the following test's beforeEach drop still
    // exercises the "constraint was present" codepath.
    await ensureUnique();
  });

  it('keep-oldest dedup: deletes exactly expectedDedupDeletedCount (3) rows', async () => {
    const before = await testPrisma.camera.count({
      where: { id: { in: duplicateFixture.map((r) => r.id) } },
    });
    expect(before).toBe(duplicateFixture.length); // 7

    await testPrisma.$executeRawUnsafe(DEDUP_SQL);
    const after = await testPrisma.camera.count({
      where: { id: { in: duplicateFixture.map((r) => r.id) } },
    });
    expect(before - after).toBe(expectedDedupDeletedCount); // 3 deleted

    // Idempotency: re-run deletes 0.
    await testPrisma.$executeRawUnsafe(DEDUP_SQL);
    const afterReRun = await testPrisma.camera.count({
      where: { id: { in: duplicateFixture.map((r) => r.id) } },
    });
    expect(afterReRun).toBe(after);

    await ensureUnique();
  });

  it('tenant isolation: orgA and orgB with same streamUrl both survive', async () => {
    await testPrisma.$executeRawUnsafe(DEDUP_SQL);

    const orgA = await testPrisma.camera.findMany({
      where: { orgId: DUPLICATE_ORG_A, streamUrl: 'rtsp://10.0.0.1/s' },
    });
    const orgB = await testPrisma.camera.findMany({
      where: { orgId: DUPLICATE_ORG_B, streamUrl: 'rtsp://10.0.0.1/s' },
    });
    expect(orgA.length).toBe(1);
    expect(orgA[0].id).toBe('cam1-old'); // keep-oldest
    expect(orgB.length).toBe(1);
    expect(orgB[0].id).toBe('cam3-b');

    await ensureUnique();
  });

  it('unique row (cam4-unique) preserved untouched', async () => {
    await testPrisma.$executeRawUnsafe(DEDUP_SQL);

    const row = await testPrisma.camera.findUnique({ where: { id: 'cam4-unique' } });
    expect(row).not.toBeNull();
    expect(row?.streamUrl).toBe('srt://cast.example:9000');

    await ensureUnique();
  });

  it('creating new duplicate after migration fires P2002 with meta.target including streamUrl', async () => {
    await testPrisma.$executeRawUnsafe(DEDUP_SQL);
    await ensureUnique(); // constraint must be in place for P2002 to fire

    try {
      await testPrisma.camera.create({
        data: {
          id: 'cam1-retry',
          orgId: DUPLICATE_ORG_A,
          siteId: DUPLICATE_SITE,
          name: 'Dup attempt',
          streamUrl: 'rtsp://10.0.0.1/s',
          status: 'offline',
        },
      });
      expect.fail('Expected P2002 unique violation');
    } catch (err: any) {
      expect(err.code).toBe('P2002');
      const target = (err.meta?.target as string[] | undefined) ?? [];
      expect(target).toContain('streamUrl');
    } finally {
      // Cleanup the retry row if it somehow got in (shouldn't).
      await testPrisma.$executeRawUnsafe(
        `DELETE FROM "Camera" WHERE "id" = 'cam1-retry'`,
      );
    }
  });
});
