import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import { createTestUser, createTestSession } from '../helpers/auth';
import { cleanupTestData } from '../helpers/tenancy';
import { randomUUID } from 'crypto';

describe('AUTH-02: Session persistence and validation', () => {
  beforeEach(async () => {
    await cleanupTestData(testPrisma);
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('should retrieve session by token', async () => {
    const user = await createTestUser(testPrisma, {
      email: 'session-test@example.com',
      name: 'Session Test User',
    });

    const session = await createTestSession(testPrisma, user.id);

    const found = await testPrisma.session.findUnique({
      where: { token: session.token },
      include: { user: true },
    });

    expect(found).toBeDefined();
    expect(found!.userId).toBe(user.id);
    expect(found!.user.email).toBe('session-test@example.com');
    expect(found!.token).toBe(session.token);
  });

  it('should detect expired session', async () => {
    const user = await createTestUser(testPrisma, {
      email: 'expired-session@example.com',
      name: 'Expired Session User',
    });

    // Create an expired session
    const expiredSession = await testPrisma.session.create({
      data: {
        id: randomUUID(),
        token: `expired-token-${randomUUID()}`,
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000), // Already expired
      },
    });

    const session = await testPrisma.session.findUnique({
      where: { token: expiredSession.token },
    });

    expect(session).not.toBeNull();
    expect(session!.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('should store activeOrganizationId on session when set', async () => {
    const user = await createTestUser(testPrisma, {
      email: 'active-org-test@example.com',
      name: 'Active Org Test User',
    });

    const session = await createTestSession(testPrisma, user.id);

    const org = await testPrisma.organization.create({
      data: {
        id: randomUUID(),
        name: 'Session Test Org',
        slug: `session-test-org-${randomUUID().slice(0, 8)}`,
      },
    });

    await testPrisma.session.update({
      where: { token: session.token },
      data: { activeOrganizationId: org.id },
    });

    const found = await testPrisma.session.findUnique({
      where: { token: session.token },
    });

    expect(found).not.toBeNull();
    expect(found!.activeOrganizationId).toBe(org.id);
  });
});
