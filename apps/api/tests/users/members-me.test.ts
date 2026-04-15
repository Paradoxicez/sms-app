import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { testPrisma } from '../setup';
import {
  cleanupTestData,
  createTestOrganization,
} from '../helpers/tenancy';
import { createTestUser } from '../helpers/auth';

// Mock auth.config so controller.getSessionUserId works without real Better Auth.
vi.mock('../../src/auth/auth.config', () => ({
  getAuth: () => ({
    api: {
      getSession: vi.fn(async ({ headers }: { headers: Headers }) => {
        const raw = headers.get('x-test-session');
        if (!raw) return null;
        return JSON.parse(raw);
      }),
    },
  }),
}));

import { UsersService } from '../../src/users/users.service';
import { MembersController } from '../../src/users/members.controller';

describe('GET /api/organizations/:orgId/members/me', () => {
  let service: UsersService;
  let controller: MembersController;
  let orgId: string;
  let adminUserId: string;
  let operatorUserId: string;
  let viewerUserId: string;
  let nonMemberUserId: string;

  function mkReq(userId: string | null) {
    const headers: Record<string, string> = {};
    if (userId) {
      headers['x-test-session'] = JSON.stringify({ user: { id: userId, role: 'user' } });
    }
    return { headers } as any;
  }

  beforeEach(async () => {
    await cleanupTestData(testPrisma);
    service = new UsersService(testPrisma as any);
    controller = new MembersController(service);

    const org = await createTestOrganization(testPrisma, {
      name: 'MembersMe Org',
      slug: `members-me-${Date.now()}`,
    });
    orgId = org.id;

    const admin = await createTestUser(testPrisma, { email: 'mm-admin@test.com' });
    adminUserId = admin.id;
    await testPrisma.member.create({
      data: { id: `m-${admin.id}`, organizationId: orgId, userId: admin.id, role: 'admin' },
    });

    const op = await createTestUser(testPrisma, { email: 'mm-op@test.com' });
    operatorUserId = op.id;
    await testPrisma.member.create({
      data: { id: `m-${op.id}`, organizationId: orgId, userId: op.id, role: 'operator' },
    });

    const viewer = await createTestUser(testPrisma, { email: 'mm-viewer@test.com' });
    viewerUserId = viewer.id;
    await testPrisma.member.create({
      data: { id: `m-${viewer.id}`, organizationId: orgId, userId: viewer.id, role: 'viewer' },
    });

    const stranger = await createTestUser(testPrisma, { email: 'mm-stranger@test.com' });
    nonMemberUserId = stranger.id;
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('returns 401 when no session', async () => {
    await expect(
      controller.getMyMembership(orgId, mkReq(null)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns 404 when caller is not a member of :orgId', async () => {
    await expect(
      controller.getMyMembership(orgId, mkReq(nonMemberUserId)),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns { role: 'admin', userId, organizationId } when caller is Org Admin", async () => {
    const result = await controller.getMyMembership(orgId, mkReq(adminUserId));
    expect(result).toEqual({
      userId: adminUserId,
      organizationId: orgId,
      role: 'admin',
    });
  });

  it("returns { role: 'operator' } for an operator member", async () => {
    const result = await controller.getMyMembership(orgId, mkReq(operatorUserId));
    expect(result.role).toBe('operator');
    expect(result.userId).toBe(operatorUserId);
    expect(result.organizationId).toBe(orgId);
  });

  it("returns { role: 'viewer' } for a viewer member", async () => {
    const result = await controller.getMyMembership(orgId, mkReq(viewerUserId));
    expect(result.role).toBe('viewer');
    expect(result.userId).toBe(viewerUserId);
  });
});
