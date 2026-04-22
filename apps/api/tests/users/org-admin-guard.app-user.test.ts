/**
 * OrgAdminGuard — app_user + FORCE RLS integration test (Variant 2).
 *
 * Motivating root-cause doc: .planning/debug/org-admin-cannot-add-team-members.md
 *
 * HISTORY:
 *   - Task 1 of quick 260422-ds9 shipped this file in Variant 1 form (raw
 *     app_user PrismaClient in the `prisma:` slot). The happy-path case
 *     FAILED on HEAD with `ForbiddenException: Org admin access required`
 *     — evidence captured in /tmp/ds9-task1-red.log. That RED signal proved
 *     the bug was reproduced in-test.
 *   - Task 2 of quick 260422-ds9 rewrote OrgAdminGuard's constructor to
 *     inject TENANCY_CLIENT and moved `cls.set('ORG_ID', orgId)` ABOVE the
 *     Member.findFirst. The guard's own membership query now flows through
 *     the tenancy extension and emits set_config in the same transaction.
 *   - This file (Variant 2) instantiates the guard with the tenancy-wrapped
 *     app_user client and the same scenarios that RED'd in Task 1 now PASS
 *     GREEN. It is the durable regression signal — any future revert of the
 *     guard to raw PrismaService will surface here.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { testPrisma } from '../setup';
import { cleanupTestData, createTestOrganization } from '../helpers/tenancy';
import { createTestUser } from '../helpers/auth';
import {
  createAppUserPrisma,
  createAppUserTenancyClient,
  makeTestClsService,
} from '../helpers/app-user-tenancy';

// Mock Better Auth getSession the same way the sibling unit test does.
vi.mock('../../src/auth/auth.config', () => ({
  getAuth: () => ({
    api: {
      getSession: vi.fn(async ({ headers }: { headers: Headers }) => {
        const raw = headers.get('x-test-session');
        return raw ? JSON.parse(raw) : null;
      }),
    },
  }),
}));

import { OrgAdminGuard } from '../../src/auth/guards/org-admin.guard';

function mkContext(opts: {
  session?: { user: { id: string; role: string } } | null;
  params?: Record<string, string>;
}): ExecutionContext {
  const headers: Record<string, string> = {};
  if (opts.session) {
    headers['x-test-session'] = JSON.stringify(opts.session);
  }
  const request = { headers, params: opts.params ?? {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/**
 * Seed helper — creates rows via `testPrisma` (sms superuser, rolbypassrls)
 * so fixture creation bypasses RLS naturally, independent of the guard's own
 * RLS posture under test.
 */
async function seedFixtures() {
  await cleanupTestData(testPrisma);

  const orgA = await createTestOrganization(testPrisma, {
    name: 'Org A',
    slug: `org-a-${Date.now()}`,
  });
  const orgB = await createTestOrganization(testPrisma, {
    name: 'Org B',
    slug: `org-b-${Date.now()}-2`,
  });

  const superAdmin = await createTestUser(testPrisma, {
    email: `super-${Date.now()}@test.com`,
    role: 'admin',
  });

  const orgAAdmin = await createTestUser(testPrisma, {
    email: `orga-admin-${Date.now()}@test.com`,
    role: 'user',
  });
  await testPrisma.member.create({
    data: {
      id: `member-${orgAAdmin.id}`,
      organizationId: orgA.id,
      userId: orgAAdmin.id,
      role: 'admin',
    },
  });

  const orgAOperator = await createTestUser(testPrisma, {
    email: `orga-op-${Date.now()}@test.com`,
    role: 'user',
  });
  await testPrisma.member.create({
    data: {
      id: `member-${orgAOperator.id}`,
      organizationId: orgA.id,
      userId: orgAOperator.id,
      role: 'operator',
    },
  });

  return {
    orgAId: orgA.id,
    orgBId: orgB.id,
    superAdminId: superAdmin.id,
    orgAAdminId: orgAAdmin.id,
    orgAOperatorId: orgAOperator.id,
  };
}

describe('OrgAdminGuard — FORCE RLS on app_user connection (Variant 2: tenancy-wrapped client)', () => {
  let appUserPrisma: PrismaClient;
  let orgAId: string;
  let orgBId: string;
  let superAdminId: string;
  let orgAAdminId: string;
  let orgAOperatorId: string;

  beforeAll(async () => {
    appUserPrisma = await createAppUserPrisma();
  });

  afterAll(async () => {
    await appUserPrisma.$disconnect();
  });

  beforeEach(async () => {
    const seeded = await seedFixtures();
    orgAId = seeded.orgAId;
    orgBId = seeded.orgBId;
    superAdminId = seeded.superAdminId;
    orgAAdminId = seeded.orgAAdminId;
    orgAOperatorId = seeded.orgAOperatorId;
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('org admin of orgA can access own org (app_user + RLS)', async () => {
    const cls = makeTestClsService();
    // Variant 2: guard receives the tenancy-wrapped client. Its constructor
    // now injects TENANCY_CLIENT (post-fix); the extension emits
    // set_config('app.current_org_id', orgId, TRUE) once cls.set('ORG_ID')
    // runs, which the guard does before findFirst.
    const tenancy = createAppUserTenancyClient(appUserPrisma, cls);
    const guard = new OrgAdminGuard(tenancy as any, cls);
    const ctx = mkContext({
      session: { user: { id: orgAAdminId, role: 'user' } },
      params: { orgId: orgAId },
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(cls.get('ORG_ID')).toBe(orgAId);
  });

  it('org admin of orgA is rejected from orgB (cross-tenant write blocked)', async () => {
    const cls = makeTestClsService();
    const tenancy = createAppUserTenancyClient(appUserPrisma, cls);
    const guard = new OrgAdminGuard(tenancy as any, cls);
    const ctx = mkContext({
      session: { user: { id: orgAAdminId, role: 'user' } },
      params: { orgId: orgBId },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('non-admin member (operator) is rejected from own org', async () => {
    const cls = makeTestClsService();
    const tenancy = createAppUserTenancyClient(appUserPrisma, cls);
    const guard = new OrgAdminGuard(tenancy as any, cls);
    const ctx = mkContext({
      session: { user: { id: orgAOperatorId, role: 'user' } },
      params: { orgId: orgAId },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('super admin bypass returns true without DB query (no RLS hit)', async () => {
    // session.user.role === 'admin' path — guard returns true before findFirst.
    // The super-admin branch never touches the DB, so RLS doesn't matter here.
    const cls = makeTestClsService();
    const tenancy = createAppUserTenancyClient(appUserPrisma, cls);
    const guard = new OrgAdminGuard(tenancy as any, cls);
    const ctx = mkContext({
      session: { user: { id: superAdminId, role: 'admin' } },
      params: { orgId: orgBId },
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(cls.get('IS_SUPERUSER')).toBe('true');
    expect(cls.get('ORG_ID')).toBe(orgBId);
  });

  it('unauthenticated session throws UnauthorizedException', async () => {
    const cls = makeTestClsService();
    const tenancy = createAppUserTenancyClient(appUserPrisma, cls);
    const guard = new OrgAdminGuard(tenancy as any, cls);
    const ctx = mkContext({
      session: null,
      params: { orgId: orgAId },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
