/**
 * Dev / test DB seed.
 *
 * RLS caveat: Member / Account / UserPermissionOverride are under FORCE
 * ROW LEVEL SECURITY. Seeds run outside any HTTP request so no CLS context
 * exists to drive the tenancy extension. We construct the PrismaClient
 * with an explicit datasourceUrl pointing at the sms superuser DSN
 * (DATABASE_URL_MIGRATE, rolbypassrls=true) so every write bypasses RLS
 * naturally. Falls back to DATABASE_URL when only one URL is set.
 *
 * History: datasourceUrl added on 2026-04-22 (quick 260422-ds9) after
 * .planning/debug/org-admin-cannot-add-team-members.md audit S2 flagged
 * that calling `new PrismaClient()` inherits DATABASE_URL — which in dev
 * points at the RLS-enforced app_user role — and Member inserts would
 * silently fail.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL,
});

async function hashPassword(password: string): Promise<string> {
  const { hashPassword: hash } = await import('better-auth/crypto');
  return hash(password);
}

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

  // Create super admin user (configurable via env, defaults for dev)
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@superadmin.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin@5432!';

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      id: 'super-admin-user-id',
      name: 'Super Admin',
      email: adminEmail,
      emailVerified: true,
      role: 'admin',
    },
    update: {
      name: 'Super Admin',
      email: adminEmail,
      role: 'admin',
    },
  });
  console.log('Super admin user:', adminUser.id);

  // Create credential account with hashed password (Better Auth scrypt)
  const hashedPw = await hashPassword(adminPassword);
  await prisma.account.upsert({
    where: { id: 'super-admin-account-id' },
    create: {
      id: 'super-admin-account-id',
      accountId: adminUser.id,
      providerId: 'credential',
      userId: adminUser.id,
      password: hashedPw,
    },
    update: {
      password: hashedPw,
    },
  });
  console.log('Super admin credential account created');

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

  // Create Developer package with all features enabled
  const devPackage = await prisma.package.upsert({
    where: { id: 'dev-package-id' },
    create: {
      id: 'dev-package-id',
      name: 'Developer',
      description: 'Development package with all features enabled',
      maxCameras: 100,
      maxViewers: 1000,
      maxBandwidthMbps: 10000,
      maxStorageGb: 500,
      features: {
        recordings: true,
        webhooks: true,
        map: true,
        auditLog: true,
        apiKeys: true,
      },
    },
    update: {
      features: {
        recordings: true,
        webhooks: true,
        map: true,
        auditLog: true,
        apiKeys: true,
      },
    },
  });
  console.log('Developer package:', devPackage.id);

  // Assign Developer package to system org
  await prisma.organization.update({
    where: { id: 'system-org-id' },
    data: { packageId: devPackage.id },
  });
  console.log('Developer package assigned to system org');

  console.log('\n--- Seed complete ---');
  console.log(`Super Admin: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
