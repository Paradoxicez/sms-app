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

    // Create two orgs and a user (as superuser, bypasses RLS)
    org1 = await createTestOrganization(testPrisma, { name: 'Org Alpha', slug: 'org-alpha' });
    org2 = await createTestOrganization(testPrisma, { name: 'Org Beta', slug: 'org-beta' });
    user1 = await testPrisma.user.create({
      data: {
        id: randomUUID(),
        name: 'Test User',
        email: `test-rls-${randomUUID().slice(0, 8)}@test.com`,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Add user as member of both orgs
    await testPrisma.member.create({
      data: { id: randomUUID(), organizationId: org1.id, userId: user1.id, role: 'admin' },
    });
    await testPrisma.member.create({
      data: { id: randomUUID(), organizationId: org2.id, userId: user1.id, role: 'viewer' },
    });
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

    // Seed two distinct orgs + one camera + one member per org (as superuser, bypasses RLS)
    orgA = await createTestOrganization(testPrisma, { name: 'Positive-Signal Org A', slug: 'pos-org-a' });
    orgB = await createTestOrganization(testPrisma, { name: 'Positive-Signal Org B', slug: 'pos-org-b' });

    userA = await testPrisma.user.create({
      data: {
        id: randomUUID(),
        name: 'Positive Signal User A',
        email: `pos-signal-a-${randomUUID().slice(0, 8)}@test.com`,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    userB = await testPrisma.user.create({
      data: {
        id: randomUUID(),
        name: 'Positive Signal User B',
        email: `pos-signal-b-${randomUUID().slice(0, 8)}@test.com`,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await testPrisma.member.create({
      data: { id: randomUUID(), organizationId: orgA.id, userId: userA.id, role: 'admin' },
    });
    await testPrisma.member.create({
      data: { id: randomUUID(), organizationId: orgB.id, userId: userB.id, role: 'admin' },
    });

    projectA = await testPrisma.project.create({
      data: { id: randomUUID(), orgId: orgA.id, name: 'Project A' },
    });
    projectB = await testPrisma.project.create({
      data: { id: randomUUID(), orgId: orgB.id, name: 'Project B' },
    });

    siteA = await testPrisma.site.create({
      data: { id: randomUUID(), orgId: orgA.id, projectId: projectA.id, name: 'Site A' },
    });
    siteB = await testPrisma.site.create({
      data: { id: randomUUID(), orgId: orgB.id, projectId: projectB.id, name: 'Site B' },
    });

    cameraA = await testPrisma.camera.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        siteId: siteA.id,
        name: 'Camera A',
        streamUrl: 'rtsp://example.com/a',
        status: 'offline',
      },
    });
    cameraB = await testPrisma.camera.create({
      data: {
        id: randomUUID(),
        orgId: orgB.id,
        siteId: siteB.id,
        name: 'Camera B',
        streamUrl: 'rtsp://example.com/b',
        status: 'offline',
      },
    });
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
