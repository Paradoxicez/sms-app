/**
 * VALIDATION: TBD-12 — GET /api/organizations/:orgId/members/me
 * Returns the caller's Member.role for the target org.
 *
 * Expected initial state: RED. Neither MembersController nor the `getMyMember`
 * service method exists — imports will fail to resolve. Plan 01/02 will turn
 * this green by adding:
 *   apps/api/src/users/members.controller.ts
 *   apps/api/src/users/users.service.ts::getMyMembership(orgId, userId)
 *
 * Route shape: GET /api/organizations/:orgId/members/me
 *   401 when no session
 *   404 when caller has no Member row in :orgId
 *   200 { role, userId, organizationId } otherwise
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import {
  cleanupTestData,
  createTestOrganization,
} from '../helpers/tenancy';
import { createTestUser } from '../helpers/auth';

// Expected RED: module not yet exported.
import { UsersService } from '../../src/users/users.service';

describe('GET /api/organizations/:orgId/members/me (TBD-12)', () => {
  let service: UsersService;
  let orgId: string;

  beforeEach(async () => {
    await cleanupTestData(testPrisma);
    service = new UsersService(testPrisma as any);
    const org = await createTestOrganization(testPrisma, {
      name: 'Members Me Org',
      slug: 'members-me-org',
    });
    orgId = org.id;
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('returns 401 when no session', async () => {
    // HTTP-layer guard behavior; verified indirectly via absence of identity.
    // The service-level call must throw when caller is unresolved.
    await expect(
      (service as any).getMyMembership(orgId, undefined as any),
    ).rejects.toBeTruthy();
  });

  it('returns 404 when caller is not a member of :orgId', async () => {
    const stranger = await createTestUser(testPrisma, {
      email: 'stranger@test.com',
    });
    await expect(
      (service as any).getMyMembership(orgId, stranger.id),
    ).rejects.toThrow(/not a member|404|NotFound/i);
  });

  it("returns { role: 'admin', userId, organizationId } when caller is Org Admin in :orgId", async () => {
    const admin = await createTestUser(testPrisma, {
      email: 'orgadmin@test.com',
      role: 'user',
    });
    await testPrisma.member.create({
      data: {
        id: `member-${admin.id}`,
        organizationId: orgId,
        userId: admin.id,
        role: 'admin',
      },
    });

    const result = await (service as any).getMyMembership(orgId, admin.id);
    expect(result).toMatchObject({
      role: 'admin',
      userId: admin.id,
      organizationId: orgId,
    });
  });

  it("returns { role: 'operator' } for an operator member", async () => {
    const op = await createTestUser(testPrisma, { email: 'op@test.com' });
    await testPrisma.member.create({
      data: {
        id: `member-${op.id}`,
        organizationId: orgId,
        userId: op.id,
        role: 'operator',
      },
    });
    const result = await (service as any).getMyMembership(orgId, op.id);
    expect(result.role).toBe('operator');
  });

  it("returns { role: 'viewer' } for a viewer member", async () => {
    const viewer = await createTestUser(testPrisma, { email: 'viewer@test.com' });
    await testPrisma.member.create({
      data: {
        id: `member-${viewer.id}`,
        organizationId: orgId,
        userId: viewer.id,
        role: 'viewer',
      },
    });
    const result = await (service as any).getMyMembership(orgId, viewer.id);
    expect(result.role).toBe('viewer');
  });
});
