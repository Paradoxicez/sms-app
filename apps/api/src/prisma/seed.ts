import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create System organization for super admin (per D-08)
  const systemOrg = await prisma.organization.upsert({
    where: { slug: 'system' },
    create: {
      id: 'system-org-id',
      name: 'System',
      slug: 'system',
      metadata: JSON.stringify({ isSystem: true }),
    },
    update: {},
  });
  console.log('System organization:', systemOrg.id);

  // Create super admin user
  // Note: In production, super admin is created via CLI or first-run setup
  // This seed creates a dev super admin for local development
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@sms-platform.local' },
    create: {
      id: 'super-admin-user-id',
      name: 'Super Admin',
      email: 'admin@sms-platform.local',
      emailVerified: true,
      role: 'admin',
    },
    update: {},
  });
  console.log('Super admin user:', adminUser.id);

  // Add super admin as member of System org
  await prisma.member.upsert({
    where: { id: 'super-admin-member-id' },
    create: {
      id: 'super-admin-member-id',
      organizationId: systemOrg.id,
      userId: adminUser.id,
      role: 'admin',
    },
    update: {},
  });
  console.log('Super admin membership created');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
