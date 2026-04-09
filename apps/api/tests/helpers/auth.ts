import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

interface CreateTestUserOptions {
  email?: string;
  name?: string;
  role?: string;
}

/**
 * Creates a test user record in the database.
 */
export async function createTestUser(
  prisma: PrismaClient,
  overrides: CreateTestUserOptions = {},
) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      email: overrides.email ?? `test-${id}@example.com`,
      name: overrides.name ?? 'Test User',
      role: overrides.role ?? 'viewer',
      emailVerified: false,
    },
  });
}

/**
 * Creates a test session for a given user.
 */
export async function createTestSession(
  prisma: PrismaClient,
  userId: string,
) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  return prisma.session.create({
    data: {
      id: randomUUID(),
      token,
      userId,
      expiresAt,
    },
  });
}

/**
 * Creates a super admin user in the System organization.
 * Assumes the System organization already exists.
 */
export async function createSuperAdmin(prisma: PrismaClient) {
  const user = await createTestUser(prisma, {
    email: 'admin@system.local',
    name: 'Super Admin',
    role: 'admin',
  });

  return user;
}
