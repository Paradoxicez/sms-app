/**
 * UAT user seed.
 *
 * RLS caveat: same as seed.ts — Member inserts run against a FORCE-RLS
 * table outside any HTTP request / CLS context. Pin the PrismaClient to
 * the sms superuser DSN (DATABASE_URL_MIGRATE, rolbypassrls=true) so
 * Member.upsert always succeeds, regardless of whether the caller's shell
 * has DATABASE_URL pointing at app_user or sms.
 *
 * History: datasourceUrl added on 2026-04-22 (quick 260422-ds9) —
 * see .planning/debug/org-admin-cannot-add-team-members.md audit S2.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL,
});

async function hashPassword(password: string): Promise<string> {
  const { hashPassword: hash } = await import('better-auth/crypto');
  return hash(password);
}

interface Seed {
  userId: string;
  accountId: string;
  memberId: string;
  email: string;
  password: string;
  orgSlug: string;
}

const SEEDS: Seed[] = [
  {
    userId: 'uat-user-a-id',
    accountId: 'uat-user-a-account',
    memberId: 'uat-user-a-member',
    email: 'user-a@test.local',
    password: 'password123',
    orgSlug: 'test-a',
  },
  {
    userId: 'uat-user-b-id',
    accountId: 'uat-user-b-account',
    memberId: 'uat-user-b-member',
    email: 'user-b@test.local',
    password: 'password123',
    orgSlug: 'test-b',
  },
];

async function main() {
  for (const s of SEEDS) {
    const org = await prisma.organization.findUnique({ where: { slug: s.orgSlug } });
    if (!org) throw new Error(`Org ${s.orgSlug} not found — create it first`);

    const user = await prisma.user.upsert({
      where: { email: s.email },
      create: {
        id: s.userId,
        email: s.email,
        name: s.email.split('@')[0],
        emailVerified: true,
        role: 'user',
      },
      update: { emailVerified: true },
    });

    const hashed = await hashPassword(s.password);
    await prisma.account.upsert({
      where: { id: s.accountId },
      create: {
        id: s.accountId,
        accountId: user.id,
        providerId: 'credential',
        userId: user.id,
        password: hashed,
      },
      update: { password: hashed },
    });

    await prisma.member.upsert({
      where: { id: s.memberId },
      create: {
        id: s.memberId,
        organizationId: org.id,
        userId: user.id,
        role: 'admin',
      },
      update: {},
    });

    console.log(`Seeded ${s.email} → ${s.orgSlug}`);
  }
  console.log('\nUAT users ready:');
  console.log('  user-a@test.local / password123 (admin of test-a)');
  console.log('  user-b@test.local / password123 (admin of test-b)');
}

main().catch(console.error).finally(() => prisma.$disconnect());
