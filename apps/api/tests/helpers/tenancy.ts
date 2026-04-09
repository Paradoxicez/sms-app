import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

interface CreateTestOrganizationOptions {
  name?: string;
  slug?: string;
  packageId?: string;
}

interface CreateTestPackageOptions {
  name?: string;
  maxCameras?: number;
  maxViewers?: number;
  maxBandwidthMbps?: number;
  maxStorageGb?: number;
  features?: Record<string, boolean>;
}

/**
 * Creates a test organization with sensible defaults.
 */
export async function createTestOrganization(
  prisma: PrismaClient,
  overrides: CreateTestOrganizationOptions = {},
) {
  const id = randomUUID();
  return prisma.organization.create({
    data: {
      id,
      name: overrides.name ?? 'Test Org',
      slug: overrides.slug ?? `test-org-${id.slice(0, 8)}`,
      packageId: overrides.packageId,
    },
  });
}

/**
 * Creates a test package with default limits.
 */
export async function createTestPackage(
  prisma: PrismaClient,
  overrides: CreateTestPackageOptions = {},
) {
  return prisma.package.create({
    data: {
      name: overrides.name ?? 'Basic',
      maxCameras: overrides.maxCameras ?? 10,
      maxViewers: overrides.maxViewers ?? 50,
      maxBandwidthMbps: overrides.maxBandwidthMbps ?? 100,
      maxStorageGb: overrides.maxStorageGb ?? 50,
      features: overrides.features ?? {},
    },
  });
}

/**
 * Cleans up all test data in the correct order to respect foreign key constraints.
 */
export async function cleanupTestData(prisma: PrismaClient) {
  await prisma.playbackSession.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.camera.deleteMany();
  await prisma.site.deleteMany();
  await prisma.project.deleteMany();
  await prisma.streamProfile.deleteMany();
  await prisma.orgSettings.deleteMany();
  await prisma.userPermissionOverride.deleteMany();
  await prisma.member.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.package.deleteMany();
}
