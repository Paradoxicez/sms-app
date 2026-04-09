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

  it('without org context (superuser bypass), returns all members', async () => {
    // As app_user without org context -- bypass policy allows all rows
    const members = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      const result = await tx.member.findMany();
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });

    expect(members.length).toBeGreaterThanOrEqual(2);
  });
});
