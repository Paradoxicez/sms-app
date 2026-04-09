import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import { createTestUser } from '../helpers/auth';
import { createTestOrganization, cleanupTestData } from '../helpers/tenancy';
import { ROLE_PERMISSIONS } from '../../src/auth/roles';
import { checkPermission } from '../../src/auth/permissions';

describe('AUTH-03: RBAC role definitions', () => {
  it('viewerRole has exactly camera:read and stream:view', () => {
    const viewer = ROLE_PERMISSIONS['viewer'];
    expect(viewer).toBeDefined();
    expect(viewer.size).toBe(2);
    expect(viewer.has('camera:read')).toBe(true);
    expect(viewer.has('stream:view')).toBe(true);
    expect(viewer.has('camera:create')).toBe(false);
  });

  it('developerRole has apiKey permissions', () => {
    const developer = ROLE_PERMISSIONS['developer'];
    expect(developer).toBeDefined();
    expect(developer.has('apiKey:create')).toBe(true);
    expect(developer.has('apiKey:read')).toBe(true);
    expect(developer.has('apiKey:revoke')).toBe(true);
    expect(developer.has('camera:read')).toBe(true);
    expect(developer.has('stream:view')).toBe(true);
  });

  it('operatorRole has camera CRUD + stream:manage + recording permissions', () => {
    const operator = ROLE_PERMISSIONS['operator'];
    expect(operator).toBeDefined();
    expect(operator.has('camera:create')).toBe(true);
    expect(operator.has('camera:read')).toBe(true);
    expect(operator.has('camera:update')).toBe(true);
    expect(operator.has('camera:delete')).toBe(true);
    expect(operator.has('camera:start')).toBe(true);
    expect(operator.has('camera:stop')).toBe(true);
    expect(operator.has('stream:view')).toBe(true);
    expect(operator.has('stream:manage')).toBe(true);
    expect(operator.has('recording:view')).toBe(true);
    expect(operator.has('recording:manage')).toBe(true);
    // Operator does NOT have apiKey permissions
    expect(operator.has('apiKey:create')).toBe(false);
  });

  it('adminRole has all permissions', () => {
    const admin = ROLE_PERMISSIONS['admin'];
    expect(admin).toBeDefined();
    expect(admin.has('camera:create')).toBe(true);
    expect(admin.has('camera:read')).toBe(true);
    expect(admin.has('camera:update')).toBe(true);
    expect(admin.has('camera:delete')).toBe(true);
    expect(admin.has('camera:start')).toBe(true);
    expect(admin.has('camera:stop')).toBe(true);
    expect(admin.has('stream:view')).toBe(true);
    expect(admin.has('stream:manage')).toBe(true);
    expect(admin.has('apiKey:create')).toBe(true);
    expect(admin.has('apiKey:read')).toBe(true);
    expect(admin.has('apiKey:revoke')).toBe(true);
    expect(admin.has('recording:view')).toBe(true);
    expect(admin.has('recording:manage')).toBe(true);
  });

  it('unknown role returns undefined from ROLE_PERMISSIONS', () => {
    expect(ROLE_PERMISSIONS['nonexistent']).toBeUndefined();
  });
});

describe('AUTH-03 + D-02: Permission overrides via checkPermission', () => {
  let userId: string;
  let orgId: string;

  beforeEach(async () => {
    await cleanupTestData(testPrisma);

    const user = await createTestUser(testPrisma, {
      email: 'rbac-test@example.com',
      name: 'RBAC Test User',
      role: 'viewer',
    });
    userId = user.id;

    const org = await createTestOrganization(testPrisma, {
      name: 'RBAC Test Org',
      slug: 'rbac-test-org',
    });
    orgId = org.id;

    // Create membership
    await testPrisma.member.create({
      data: {
        id: `rbac-member-${user.id.slice(0, 8)}`,
        organizationId: orgId,
        userId: userId,
        role: 'viewer',
      },
    });
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('checkPermission returns role default when no override exists', async () => {
    // viewer has camera:read by default
    const hasRead = await checkPermission(testPrisma, userId, orgId, 'viewer', 'camera:read');
    expect(hasRead).toBe(true);
  });

  it('checkPermission returns false for permission not in role', async () => {
    // viewer does NOT have camera:create by default
    const hasCreate = await checkPermission(testPrisma, userId, orgId, 'viewer', 'camera:create');
    expect(hasCreate).toBe(false);
  });

  it('checkPermission with "grant" override adds permission not in role', async () => {
    // Grant camera:create to viewer via override
    await testPrisma.userPermissionOverride.create({
      data: {
        userId,
        orgId,
        permission: 'camera:create',
        action: 'grant',
      },
    });

    const hasCreate = await checkPermission(testPrisma, userId, orgId, 'viewer', 'camera:create');
    expect(hasCreate).toBe(true);
  });

  it('checkPermission with "deny" override removes permission that is in role', async () => {
    // Deny camera:read from viewer via override
    await testPrisma.userPermissionOverride.create({
      data: {
        userId,
        orgId,
        permission: 'camera:read',
        action: 'deny',
      },
    });

    const hasRead = await checkPermission(testPrisma, userId, orgId, 'viewer', 'camera:read');
    expect(hasRead).toBe(false);
  });

  it('unknown role returns false for all permissions', async () => {
    const result = await checkPermission(testPrisma, userId, orgId, 'nonexistent', 'camera:read');
    expect(result).toBe(false);
  });
});
