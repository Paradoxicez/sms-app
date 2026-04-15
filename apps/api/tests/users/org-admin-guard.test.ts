/**
 * VALIDATION: TBD-09 — OrgAdminGuard via POST /api/organizations/:orgId/users
 *
 * Threat T-999.1-03 (cross-tenant write): an Org Admin of org A must NOT be
 * able to create a user in org B. OrgAdminGuard enforces that the caller has
 * Member.role === 'admin' *in the requested :orgId*, OR is a platform super
 * admin (User.role === 'admin').
 *
 * Expected initial state: RED. The guard does not yet exist under
 * apps/api/src/auth/guards/org-admin.guard.ts. Wave 1 will add it; this test
 * will then switch to GREEN.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { testPrisma } from '../setup';
import {
  cleanupTestData,
  createTestOrganization,
} from '../helpers/tenancy';
import { createTestUser } from '../helpers/auth';

// Expected RED: guard module does not exist yet.
import { OrgAdminGuard } from '../../src/auth/guards/org-admin.guard';

function buildContext(opts: {
  orgId: string;
  session: { user: { id: string; role: 'admin' | 'user' } } | null;
}): ExecutionContext {
  const request: any = {
    headers: {},
    params: { orgId: opts.orgId },
    // Tests may cross-reference the authenticated user id.
    user: opts.session?.user ?? null,
    session: opts.session,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getHandler: () => ({}) as any,
    getClass: () => ({}) as any,
  } as unknown as ExecutionContext;
}

describe('OrgAdminGuard — cross-tenant write (T-999.1-03, D-19)', () => {
  let guard: OrgAdminGuard;
  let orgAId: string;
  let orgBId: string;
  let platformAdminId: string;
  let orgAAdminId: string;
  let orgAOperatorId: string;

  beforeEach(async () => {
    await cleanupTestData(testPrisma);
    guard = new OrgAdminGuard(testPrisma as any);

    const orgA = await createTestOrganization(testPrisma, {
      name: 'Org A',
      slug: 'org-a',
    });
    const orgB = await createTestOrganization(testPrisma, {
      name: 'Org B',
      slug: 'org-b',
    });
    orgAId = orgA.id;
    orgBId = orgB.id;

    const superUser = await createTestUser(testPrisma, {
      email: 'super@test.com',
      role: 'admin',
    });
    platformAdminId = superUser.id;

    const orgAAdmin = await createTestUser(testPrisma, {
      email: 'org-a-admin@test.com',
      role: 'user',
    });
    await testPrisma.member.create({
      data: {
        id: `member-${orgAAdmin.id}`,
        organizationId: orgAId,
        userId: orgAAdmin.id,
        role: 'admin',
      },
    });
    orgAAdminId = orgAAdmin.id;

    const orgAOp = await createTestUser(testPrisma, {
      email: 'org-a-op@test.com',
      role: 'user',
    });
    await testPrisma.member.create({
      data: {
        id: `member-${orgAOp.id}`,
        organizationId: orgAId,
        userId: orgAOp.id,
        role: 'operator',
      },
    });
    orgAOperatorId = orgAOp.id;
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
    vi.restoreAllMocks();
  });

  it('allows super admin (User.role=admin) to create user in any org', async () => {
    const ctx = buildContext({
      orgId: orgBId,
      session: { user: { id: platformAdminId, role: 'admin' } },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows org admin (Member.role=admin in :orgId) to create user in own org (D-19)', async () => {
    const ctx = buildContext({
      orgId: orgAId,
      session: { user: { id: orgAAdminId, role: 'user' } },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects org admin from creating user in a DIFFERENT org (cross-tenant write T-999.1-03)', async () => {
    const ctx = buildContext({
      orgId: orgBId, // admin is only member of org A
      session: { user: { id: orgAAdminId, role: 'user' } },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(/403|Forbidden|not authorized/i);
  });

  it('rejects operator/developer/viewer from creating user in own org', async () => {
    const ctx = buildContext({
      orgId: orgAId,
      session: { user: { id: orgAOperatorId, role: 'user' } },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(/403|Forbidden|not authorized/i);
  });

  it('rejects unauthenticated with 401', async () => {
    const ctx = buildContext({ orgId: orgAId, session: null });
    await expect(guard.canActivate(ctx)).rejects.toThrow(/401|Unauthorized|Not authenticated/i);
  });
});
