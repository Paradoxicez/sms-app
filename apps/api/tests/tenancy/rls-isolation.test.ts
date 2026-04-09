import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma } from '../setup';
import { cleanupTestData } from '../helpers/tenancy';
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
