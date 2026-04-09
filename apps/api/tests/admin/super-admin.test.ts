import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma } from '../setup';
import { createTestUser, createTestSession } from '../helpers/auth';
import { cleanupTestData } from '../helpers/tenancy';
import { SuperAdminGuard } from '../../src/auth/guards/super-admin.guard';

describe('AUTH-04: Super admin guard and impersonation', () => {
  beforeAll(async () => {
    await cleanupTestData(testPrisma);
  });

  afterAll(async () => {
    await cleanupTestData(testPrisma);
  });

  it('SuperAdminGuard class exists and implements CanActivate', () => {
    const guard = new SuperAdminGuard();
    expect(guard).toBeDefined();
    expect(typeof guard.canActivate).toBe('function');
  });

  it('SuperAdminGuard rejects when no session exists', async () => {
    const guard = new SuperAdminGuard();

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
        }),
      }),
    };

    await expect(
      guard.canActivate(mockContext as any),
    ).rejects.toThrow('Not authenticated');
  });

  it('admin user has role "admin" in database', async () => {
    const admin = await createTestUser(testPrisma, {
      email: 'guard-admin@example.com',
      name: 'Guard Admin',
      role: 'admin',
    });

    expect(admin.role).toBe('admin');
  });

  it('non-admin user has non-admin role', async () => {
    const viewer = await createTestUser(testPrisma, {
      email: 'guard-viewer@example.com',
      name: 'Guard Viewer',
      role: 'viewer',
    });

    expect(viewer.role).toBe('viewer');
    expect(viewer.role).not.toBe('admin');
  });

  it('impersonation session has impersonatedBy field set', async () => {
    const impersonator = await createTestUser(testPrisma, {
      email: 'impersonator@example.com',
      name: 'Impersonator',
      role: 'admin',
    });

    const target = await createTestUser(testPrisma, {
      email: 'target@example.com',
      name: 'Target User',
      role: 'viewer',
    });

    // Create impersonation session manually
    const session = await testPrisma.session.create({
      data: {
        id: 'impersonation-session-id',
        token: 'impersonation-token-123',
        userId: target.id,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        impersonatedBy: impersonator.id,
      },
    });

    expect(session.impersonatedBy).toBe(impersonator.id);

    // Verify we can query it back
    const found = await testPrisma.session.findUnique({
      where: { id: session.id },
    });
    expect(found!.impersonatedBy).toBe(impersonator.id);
  });
});
