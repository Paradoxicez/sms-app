import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { testPrisma } from '../setup';
import { cleanupTestData, createTestOrganization } from '../helpers/tenancy';
import { TENANCY_CLIENT, createTenancyExtension } from '../../src/tenancy/prisma-tenancy.extension';

describe('TENANT-01: RLS tenant isolation infrastructure', () => {
  beforeAll(async () => {
    await cleanupTestData(testPrisma);
  });

  afterAll(async () => {
    await cleanupTestData(testPrisma);
  });

  it('set_config sets app.current_org_id in PostgreSQL session', async () => {
    const testOrgId = 'test-rls-org-id';

    // Execute set_config and verify via current_setting
    const result = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${testOrgId}, TRUE)`;
      const rows = await tx.$queryRaw<Array<{ current_setting: string }>>`
        SELECT current_setting('app.current_org_id') as current_setting
      `;
      return rows;
    });

    expect(result).toBeDefined();
    expect(result[0].current_setting).toBe(testOrgId);
  });

  it('query without org context proceeds without set_config', async () => {
    // A mock CLS that returns undefined for ORG_ID
    const mockCls = {
      get: (_key: string) => undefined,
    } as any;

    const extended = createTenancyExtension(testPrisma, mockCls);

    // This should succeed without set_config being called
    // Just verify the extension was created and can be used
    expect(extended).toBeDefined();

    // Run a simple query through the extension to verify it works
    const users = await extended.user.findMany({ take: 1 });
    expect(Array.isArray(users)).toBe(true);
  });

  it('TENANCY_CLIENT symbol is defined and injectable', () => {
    expect(TENANCY_CLIENT).toBeDefined();
    expect(typeof TENANCY_CLIENT).toBe('symbol');
    expect(TENANCY_CLIENT.toString()).toBe('Symbol(TENANCY_CLIENT)');
  });

  it('createTenancyExtension returns an extended Prisma client', () => {
    const mockCls = {
      get: (_key: string) => 'some-org-id',
    } as any;

    const extended = createTenancyExtension(testPrisma, mockCls);
    expect(extended).toBeDefined();
    // Extended client should have the same model accessors
    expect(extended.user).toBeDefined();
    expect(extended.organization).toBeDefined();
    expect(extended.session).toBeDefined();
  });
});

describe('RLS policy enforcement on Member table', () => {
  let org1: any;
  let org2: any;
  let user1: any;

  beforeAll(async () => {
    await cleanupTestData(testPrisma);

    // Ensure app_user role exists (non-superuser, RLS enforced)
    await testPrisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user LOGIN PASSWORD 'sms_app_user_password';
        END IF;
      END $$;
    `);
    await testPrisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO app_user`);
    await testPrisma.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user`);
    await testPrisma.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user`);

    // Seed data with superuser flag (positive-signal contract). The testPrisma
    // connection uses the RLS-enforced app_user role, so seeds must opt into the
    // bypass policy via set_config('app.is_superuser', 'true', TRUE).
    const seeded = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superuser', 'true', TRUE)`;

      const o1 = await tx.organization.create({
        data: { id: randomUUID(), name: 'Org Alpha', slug: `org-alpha-${randomUUID().slice(0, 8)}` },
      });
      const o2 = await tx.organization.create({
        data: { id: randomUUID(), name: 'Org Beta', slug: `org-beta-${randomUUID().slice(0, 8)}` },
      });
      const u1 = await tx.user.create({
        data: {
          id: randomUUID(),
          name: 'Test User',
          email: `test-rls-${randomUUID().slice(0, 8)}@test.com`,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await tx.member.create({
        data: { id: randomUUID(), organizationId: o1.id, userId: u1.id, role: 'admin' },
      });
      await tx.member.create({
        data: { id: randomUUID(), organizationId: o2.id, userId: u1.id, role: 'viewer' },
      });

      return { o1, o2, u1 };
    });

    org1 = seeded.o1;
    org2 = seeded.o2;
    user1 = seeded.u1;
  });

  afterAll(async () => {
    await cleanupTestData(testPrisma);
  });

  it('with org context set, only returns members for that org', async () => {
    // Use interactive transaction: SET ROLE app_user to enforce RLS
    // (sms is superuser which bypasses RLS, so we switch to app_user)
    const members = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${org1.id}, TRUE)`;
      const result = await tx.member.findMany();
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });

    expect(members.length).toBe(1);
    expect(members[0].organizationId).toBe(org1.id);
  });

  it('with different org context, returns different members', async () => {
    const members = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${org2.id}, TRUE)`;
      const result = await tx.member.findMany();
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });

    expect(members.length).toBe(1);
    expect(members[0].organizationId).toBe(org2.id);
  });

  it('without org context AND without is_superuser flag, returns 0 rows', async () => {
    // New positive-signal policy: bypass requires explicit app.is_superuser='true'.
    // A session without either signal must see zero rows.
    const members = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      const result = await tx.member.findMany();
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });

    expect(members.length).toBe(0);
  });
});

describe('RLS superuser bypass uses positive signal app.is_superuser', () => {
  let orgA: any;
  let orgB: any;
  let userA: any;
  let userB: any;
  let projectA: any;
  let projectB: any;
  let siteA: any;
  let siteB: any;
  let cameraA: any;
  let cameraB: any;

  beforeAll(async () => {
    await cleanupTestData(testPrisma);

    // Ensure app_user role exists
    await testPrisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user LOGIN PASSWORD 'sms_app_user_password';
        END IF;
      END $$;
    `);
    await testPrisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO app_user`);
    await testPrisma.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user`);
    await testPrisma.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user`);

    // Seed with superuser flag (positive-signal contract).
    const seeded = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superuser', 'true', TRUE)`;

      const oA = await tx.organization.create({
        data: { id: randomUUID(), name: 'Positive-Signal Org A', slug: `pos-org-a-${randomUUID().slice(0, 8)}` },
      });
      const oB = await tx.organization.create({
        data: { id: randomUUID(), name: 'Positive-Signal Org B', slug: `pos-org-b-${randomUUID().slice(0, 8)}` },
      });

      const uA = await tx.user.create({
        data: {
          id: randomUUID(),
          name: 'Positive Signal User A',
          email: `pos-signal-a-${randomUUID().slice(0, 8)}@test.com`,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const uB = await tx.user.create({
        data: {
          id: randomUUID(),
          name: 'Positive Signal User B',
          email: `pos-signal-b-${randomUUID().slice(0, 8)}@test.com`,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await tx.member.create({
        data: { id: randomUUID(), organizationId: oA.id, userId: uA.id, role: 'admin' },
      });
      await tx.member.create({
        data: { id: randomUUID(), organizationId: oB.id, userId: uB.id, role: 'admin' },
      });

      const pA = await tx.project.create({
        data: { id: randomUUID(), orgId: oA.id, name: 'Project A' },
      });
      const pB = await tx.project.create({
        data: { id: randomUUID(), orgId: oB.id, name: 'Project B' },
      });

      const sA = await tx.site.create({
        data: { id: randomUUID(), orgId: oA.id, projectId: pA.id, name: 'Site A' },
      });
      const sB = await tx.site.create({
        data: { id: randomUUID(), orgId: oB.id, projectId: pB.id, name: 'Site B' },
      });

      const cA = await tx.camera.create({
        data: {
          id: randomUUID(),
          orgId: oA.id,
          siteId: sA.id,
          name: 'Camera A',
          streamUrl: 'rtsp://example.com/a',
          status: 'offline',
        },
      });
      const cB = await tx.camera.create({
        data: {
          id: randomUUID(),
          orgId: oB.id,
          siteId: sB.id,
          name: 'Camera B',
          streamUrl: 'rtsp://example.com/b',
          status: 'offline',
        },
      });

      return { oA, oB, uA, uB, pA, pB, sA, sB, cA, cB };
    });

    orgA = seeded.oA;
    orgB = seeded.oB;
    userA = seeded.uA;
    userB = seeded.uB;
    projectA = seeded.pA;
    projectB = seeded.pB;
    siteA = seeded.sA;
    siteB = seeded.sB;
    cameraA = seeded.cA;
    cameraB = seeded.cB;
  });

  afterAll(async () => {
    await cleanupTestData(testPrisma);
  });

  it('no current_org_id AND no is_superuser -> 0 rows (closed default)', async () => {
    const cameras = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      const result = await tx.camera.findMany();
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });
    expect(cameras.length).toBe(0);

    const members = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      const result = await tx.member.findMany();
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });
    expect(members.length).toBe(0);
  });

  it("is_superuser='true' without current_org_id -> all rows across orgs", async () => {
    const cameras = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      await tx.$executeRaw`SELECT set_config('app.is_superuser', 'true', TRUE)`;
      const result = await tx.camera.findMany();
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });
    const orgIds = new Set(cameras.map((c) => c.orgId));
    expect(cameras.length).toBeGreaterThanOrEqual(2);
    expect(orgIds.has(orgA.id)).toBe(true);
    expect(orgIds.has(orgB.id)).toBe(true);
  });

  it('current_org_id set AND no is_superuser -> only that org rows (tenant isolation still works)', async () => {
    const cameras = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgA.id}, TRUE)`;
      const result = await tx.camera.findMany();
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });
    expect(cameras.length).toBe(1);
    expect(cameras[0].orgId).toBe(orgA.id);
  });
});
