/**
 * OrgAdminGuard — app_user + FORCE RLS integration test.
 *
 * Motivating root-cause doc: .planning/debug/org-admin-cannot-add-team-members.md
 *
 * VARIANT 1 — RAW app_user PrismaClient in the `prisma:` slot.
 *
 * On HEAD (pre-Task-2 of quick 260422-ds9), this file reproduces the
 * production failure exactly: FORCE RLS returns zero rows because the guard
 * never emits set_config before its Member.findFirst, so the guard throws
 * `ForbiddenException('Org admin access required')`.
 *
 * Task 2 of 260422-ds9 will rewrite the guard constructor to accept only the
 * tenancy-wrapped client (@Inject(TENANCY_CLIENT)). At that point this file
 * will be rewritten to Variant 2 (instantiation via
 * createAppUserTenancyClient) — the same scenarios then pass GREEN and
 * become the durable regression signal for any future revert.
 *
 * RED→GREEN signal:
 *   - Task 1 (HEAD):        Variant 1 happy-path FAILS with ForbiddenException.
 *   - Task 2 (post-fix):    File rewritten to Variant 2; scenarios PASS.
 *
 * The RED output is captured to /tmp/ds9-task1-red.log during Task 1 verify.
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

describe('OrgAdminGuard — FORCE RLS on app_user connection (Variant 1: raw client; will be rewritten in Task 2)', () => {
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

  it('org admin of orgA can access own org (app_user + RLS) — EXPECTED RED ON HEAD', async () => {
    const cls = makeTestClsService();
    // NOTE: on HEAD the constructor is (prisma: PrismaService, cls: ClsService).
    // We pass the raw app_user client into the prisma slot — this reproduces
    // production RLS behaviour because the raw client has no tenancy extension,
    // so no set_config is emitted before member.findFirst. RLS returns zero
    // rows and the guard throws ForbiddenException.
    const guard = new OrgAdminGuard(appUserPrisma as any, cls);
    const ctx = mkContext({
      session: { user: { id: orgAAdminId, role: 'user' } },
      params: { orgId: orgAId },
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(cls.get('ORG_ID')).toBe(orgAId);
  });

  it('org admin of orgA is rejected from orgB (cross-tenant write blocked)', async () => {
    const cls = makeTestClsService();
    const guard = new OrgAdminGuard(appUserPrisma as any, cls);
    const ctx = mkContext({
      session: { user: { id: orgAAdminId, role: 'user' } },
      params: { orgId: orgBId },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('non-admin member (operator) is rejected from own org', async () => {
    const cls = makeTestClsService();
    const guard = new OrgAdminGuard(appUserPrisma as any, cls);
    const ctx = mkContext({
      session: { user: { id: orgAOperatorId, role: 'user' } },
      params: { orgId: orgAId },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('super admin bypass returns true without DB query (no RLS hit)', async () => {
    // session.user.role === 'admin' path — guard returns true before findFirst.
    // This PASSES on HEAD because the super-admin branch never touches the DB.
    const cls = makeTestClsService();
    const guard = new OrgAdminGuard(appUserPrisma as any, cls);
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
    const guard = new OrgAdminGuard(appUserPrisma as any, cls);
    const ctx = mkContext({
      session: null,
      params: { orgId: orgAId },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
