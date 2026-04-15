import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { testPrisma } from '../setup';
import {
  cleanupTestData,
  createTestOrganization,
} from '../helpers/tenancy';
import { createTestUser } from '../helpers/auth';

// Mock the Better Auth config so we can control the session returned to the guard.
// The guard imports getAuth() from '../auth.config' and calls auth.api.getSession({ headers }).
vi.mock('../../src/auth/auth.config', () => {
  return {
    getAuth: () => ({
      api: {
        getSession: vi.fn(async ({ headers }: { headers: Headers }) => {
          const raw = headers.get('x-test-session');
          if (!raw) return null;
          return JSON.parse(raw);
        }),
      },
    }),
  };
});

import { OrgAdminGuard } from '../../src/auth/guards/org-admin.guard';

/**
 * Build a fake ExecutionContext carrying request with headers + params.
 * x-test-session header value is a JSON-serialised Better Auth session.
 */
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

describe('OrgAdminGuard (T-999.1-03: cross-tenant write blocked)', () => {
  let orgAId: string;
  let orgBId: string;
  let superAdminId: string;
  let orgAAdminId: string;
  let orgAOperatorId: string;

  beforeEach(async () => {
    await cleanupTestData(testPrisma);

    const orgA = await createTestOrganization(testPrisma, {
      name: 'Org A',
      slug: `org-a-${Date.now()}`,
    });
    orgAId = orgA.id;
    const orgB = await createTestOrganization(testPrisma, {
      name: 'Org B',
      slug: `org-b-${Date.now()}`,
    });
    orgBId = orgB.id;

    const superAdmin = await createTestUser(testPrisma, {
      email: 'super@test.com',
      role: 'admin',
    });
    superAdminId = superAdmin.id;

    const orgAAdmin = await createTestUser(testPrisma, {
      email: 'orga-admin@test.com',
      role: 'user',
    });
    orgAAdminId = orgAAdmin.id;
    await testPrisma.member.create({
      data: {
        id: `member-${orgAAdminId}`,
        organizationId: orgAId,
        userId: orgAAdminId,
        role: 'admin',
      },
    });

    const orgAOperator = await createTestUser(testPrisma, {
      email: 'orga-op@test.com',
      role: 'user',
    });
    orgAOperatorId = orgAOperator.id;
    await testPrisma.member.create({
      data: {
        id: `member-${orgAOperatorId}`,
        organizationId: orgAId,
        userId: orgAOperatorId,
        role: 'operator',
      },
    });
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('allows super admin (User.role=admin) to access any org', async () => {
    const guard = new OrgAdminGuard(testPrisma as any);
    const ctx = mkContext({
      session: { user: { id: superAdminId, role: 'admin' } },
      params: { orgId: orgBId },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows org admin of :orgId to access own org', async () => {
    const guard = new OrgAdminGuard(testPrisma as any);
    const ctx = mkContext({
      session: { user: { id: orgAAdminId, role: 'user' } },
      params: { orgId: orgAId },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects org admin from accessing a DIFFERENT org (cross-tenant write blocked)', async () => {
    const guard = new OrgAdminGuard(testPrisma as any);
    const ctx = mkContext({
      session: { user: { id: orgAAdminId, role: 'user' } },
      params: { orgId: orgBId },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rejects operator/viewer member (not admin) from writes in own org', async () => {
    const guard = new OrgAdminGuard(testPrisma as any);
    const ctx = mkContext({
      session: { user: { id: orgAOperatorId, role: 'user' } },
      params: { orgId: orgAId },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rejects unauthenticated with 401', async () => {
    const guard = new OrgAdminGuard(testPrisma as any);
    const ctx = mkContext({
      session: null,
      params: { orgId: orgAId },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
