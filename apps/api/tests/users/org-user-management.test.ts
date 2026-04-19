import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { testPrisma } from '../setup';
import {
  cleanupTestData,
  createTestOrganization,
} from '../helpers/tenancy';
import { createTestUser } from '../helpers/auth';
import { UsersService } from '../../src/users/users.service';
import { InviteUserSchema } from '../../src/users/dto/invite-user.dto';

// Mock Better Auth. The real signUpEmail path is tested end-to-end against a
// running Nest process; this unit test only verifies UsersService wiring
// (User update + Member creation + shape of the return value).
vi.mock('../../src/auth/auth.config', () => ({
  getAuth: () => ({
    api: {
      signUpEmail: async ({ body }: { body: { email: string; name: string; password: string } }) => {
        const userId = randomUUID();
        await testPrisma.user.create({
          data: { id: userId, email: body.email, name: body.name, emailVerified: false, role: 'user' },
        });
        await testPrisma.account.create({
          data: {
            id: randomUUID(),
            accountId: userId,
            providerId: 'credential',
            userId,
            password: `mock-hash-of:${body.password}`,
          },
        });
        return { user: { id: userId, email: body.email, name: body.name } };
      },
    },
  }),
}));

describe('Organization User Management', () => {
  let service: UsersService;
  let orgId: string;
  let adminUserId: string;

  beforeEach(async () => {
    await cleanupTestData(testPrisma);
    service = new UsersService(testPrisma as any);

    // Create an org and an admin user
    const org = await createTestOrganization(testPrisma, {
      name: 'Test Org',
      slug: 'test-org',
    });
    orgId = org.id;

    const adminUser = await createTestUser(testPrisma, {
      email: 'admin@test.com',
      name: 'Admin User',
      role: 'admin',
    });
    adminUserId = adminUser.id;

    // Add admin as member
    await testPrisma.member.create({
      data: {
        id: `member-${adminUser.id}`,
        organizationId: orgId,
        userId: adminUser.id,
        role: 'admin',
      },
    });
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('should create a pending invitation for a user', async () => {
    const invitation = await service.inviteUser(orgId, adminUserId, {
      email: 'new@example.com',
      role: 'viewer',
    });

    expect(invitation.id).toBeDefined();
    expect(invitation.email).toBe('new@example.com');
    expect(invitation.role).toBe('viewer');
    expect(invitation.status).toBe('pending');
    expect(invitation.organizationId).toBe(orgId);
    expect(invitation.inviterId).toBe(adminUserId);
    expect(invitation.expiresAt).toBeDefined();

    // Verify expiration is ~7 days from now
    const diff = invitation.expiresAt.getTime() - Date.now();
    expect(diff).toBeGreaterThan(6 * 24 * 60 * 60 * 1000); // > 6 days
    expect(diff).toBeLessThan(8 * 24 * 60 * 60 * 1000); // < 8 days
  });

  it('should create a user and add them as a member to the org', async () => {
    const result = await service.createUser(orgId, {
      email: 'direct@example.com',
      name: 'Direct User',
      password: 'securepassword123',
      role: 'operator',
    });

    expect(result.user.email).toBe('direct@example.com');
    expect(result.user.name).toBe('Direct User');
    expect(result.member.role).toBe('operator');
    expect(result.member.organizationId).toBe(orgId);
  });

  it('should list members with user details and roles', async () => {
    // Add another member
    const viewer = await createTestUser(testPrisma, {
      email: 'viewer@test.com',
      name: 'Viewer User',
    });
    await testPrisma.member.create({
      data: {
        id: `member-${viewer.id}`,
        organizationId: orgId,
        userId: viewer.id,
        role: 'viewer',
      },
    });

    const members = await service.listMembers(orgId);
    expect(members.length).toBe(2);
    expect(members.some((m) => m.user.email === 'admin@test.com')).toBe(true);
    expect(members.some((m) => m.user.email === 'viewer@test.com')).toBe(true);
  });

  it('should update a member role', async () => {
    const viewer = await createTestUser(testPrisma, {
      email: 'viewer@test.com',
    });
    await testPrisma.member.create({
      data: {
        id: `member-${viewer.id}`,
        organizationId: orgId,
        userId: viewer.id,
        role: 'viewer',
      },
    });

    await service.updateRole(orgId, viewer.id, 'operator');

    const updated = await testPrisma.member.findFirst({
      where: { organizationId: orgId, userId: viewer.id },
    });
    expect(updated?.role).toBe('operator');
  });

  it('should reject removing the last admin from an organization', async () => {
    await expect(
      service.removeMember(orgId, adminUserId),
    ).rejects.toThrow('Cannot remove the last admin');
  });

  it('should allow removing a non-last admin', async () => {
    // Add second admin
    const admin2 = await createTestUser(testPrisma, {
      email: 'admin2@test.com',
      name: 'Admin 2',
      role: 'admin',
    });
    await testPrisma.member.create({
      data: {
        id: `member-${admin2.id}`,
        organizationId: orgId,
        userId: admin2.id,
        role: 'admin',
      },
    });

    // Now we can remove the first admin
    await service.removeMember(orgId, adminUserId);

    const remaining = await testPrisma.member.findMany({
      where: { organizationId: orgId },
    });
    expect(remaining.length).toBe(1);
    expect(remaining[0].userId).toBe(admin2.id);
  });

  it('should validate role values using z.enum', () => {
    const valid = InviteUserSchema.safeParse({
      email: 'test@example.com',
      role: 'developer',
    });
    expect(valid.success).toBe(true);

    const invalid = InviteUserSchema.safeParse({
      email: 'test@example.com',
      role: 'superadmin',
    });
    expect(invalid.success).toBe(false);
  });
});
