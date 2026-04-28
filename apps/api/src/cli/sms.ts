/**
 * apps/api/src/cli/sms.ts — Phase 29 (DEPLOY-17)
 *
 * Super-admin operator CLI. v1.3 ships ONE subcommand: `create-admin`.
 * Future subcommands (doctor, reset-password, verify-backup) extend the
 * switch in main(). Compiled by nest build (SWC) to apps/api/dist/cli/sms.js
 * and invoked from /app/apps/api/bin/sms in the production image.
 *
 * RLS bypass: Member + Account tables FORCE ROW LEVEL SECURITY. We
 * construct PrismaClient with datasourceUrl = DATABASE_URL_MIGRATE
 * (sms superuser DSN, rolbypassrls=true) so writes succeed without a
 * CLS context. Same pattern as apps/api/src/prisma/seed.ts.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL,
});

async function hashPassword(password: string): Promise<string> {
  const { hashPassword: hash } = await import('better-auth/crypto');
  return hash(password);
}

interface ParsedArgs {
  email?: string;
  password?: string;
  force: boolean;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const out: ParsedArgs = { force: false };
  let i = 0;
  while (i < argv.length) {
    const flag = argv[i];
    switch (flag) {
      case '--email': {
        const value = argv[i + 1];
        if (typeof value !== 'string' || value.startsWith('--')) {
          return null;
        }
        out.email = value;
        i += 2;
        break;
      }
      case '--password': {
        const value = argv[i + 1];
        if (typeof value !== 'string' || value.startsWith('--')) {
          return null;
        }
        out.password = value;
        i += 2;
        break;
      }
      case '--force': {
        out.force = true;
        i += 1;
        break;
      }
      default:
        return null;
    }
  }
  return out;
}

const SYSTEM_ORG_ID = 'system-org-id';

async function createAdmin(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  if (!parsed || !parsed.email || !parsed.password) {
    process.stderr.write(
      'Usage: bin/sms create-admin --email <email> --password <password> [--force]\n',
    );
    process.exit(2);
  }
  const { email, password, force } = parsed;

  // v1.3 supports single super-admin only — refuse a second admin with a different email.
  // (D-04 idempotency for SAME email + --force still works below.)
  const existingAdmin = await prisma.user.findFirst({
    where: {
      role: 'admin',
      members: { some: { organizationId: SYSTEM_ORG_ID } },
    },
  });
  if (existingAdmin && existingAdmin.email !== email) {
    process.stderr.write(
      `Error: Super-admin already exists with email ${existingAdmin.email}. ` +
        `v1.3 supports single super-admin only. ` +
        `Use --force with the same email to rotate password; multi-admin support lands in v1.4 (DEPLOY-29).\n`,
    );
    process.exit(1);
  }

  // D-04: refuse to clobber the SAME-email user unless --force.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !force) {
    process.stderr.write(
      `Error: User ${email} already exists. Use --force to update password.\n`,
    );
    process.exit(1);
  }

  // Step 1: upsert System organization (D-06 step 1 — copied from seed.ts:30-39)
  const systemOrg = await prisma.organization.upsert({
    where: { slug: 'system' },
    create: {
      id: SYSTEM_ORG_ID,
      name: 'System',
      slug: 'system',
      metadata: JSON.stringify({ isSystem: true }),
    },
    update: {},
  });
  console.log(`[create-admin] System organization: ${systemOrg.id}`);

  // Step 2: upsert User (D-06 step 2 — by-email upsert; deterministic id derived from existing
  // row or `super-admin-${ts}` on first run).
  const adminUser = await prisma.user.upsert({
    where: { email },
    create: {
      id: existing?.id ?? `super-admin-${Date.now()}`,
      name: 'Super Admin',
      email,
      emailVerified: true,
      role: 'admin',
    },
    update: {
      name: 'Super Admin',
      role: 'admin',
    },
  });
  console.log(`[create-admin] Super admin user: ${adminUser.id}`);

  // Step 3: upsert credential Account with scrypt-hashed password (D-05 + D-06 step 3).
  // Account has no compound @@unique([userId, providerId]); we pin id to `acct-<userId>`
  // so re-runs hit the same row deterministically.
  const hashedPw = await hashPassword(password);
  const accountId = `acct-${adminUser.id}`;
  await prisma.account.upsert({
    where: { id: accountId },
    create: {
      id: accountId,
      accountId: adminUser.id,
      providerId: 'credential',
      userId: adminUser.id,
      password: hashedPw,
    },
    update: {
      password: hashedPw,
    },
  });
  console.log('[create-admin] Credential account upserted');

  // Step 4: upsert Member of System org (D-06 step 4 — id pinned to `member-<userId>` for idempotency).
  const memberId = `member-${adminUser.id}`;
  await prisma.member.upsert({
    where: { id: memberId },
    create: {
      id: memberId,
      organizationId: systemOrg.id,
      userId: adminUser.id,
      role: 'admin',
    },
    update: {},
  });
  console.log('[create-admin] Membership upserted');

  if (existing && force) {
    console.log(`[create-admin] Updated password for ${email}.`);
  } else {
    console.log(`[create-admin] Created super-admin ${email}.`);
  }
}

function printUsage(): void {
  process.stderr.write(
    'Usage: bin/sms <subcommand> [options]\n' +
      '\n' +
      'Subcommands:\n' +
      '  create-admin --email <email> --password <password> [--force]\n' +
      '\n',
  );
}

async function main(): Promise<void> {
  const [, , subcmd, ...rest] = process.argv;
  switch (subcmd) {
    case 'create-admin':
      await createAdmin(rest);
      break;
    case undefined:
    case '-h':
    case '--help':
      printUsage();
      process.exit(0);
      break;
    default:
      process.stderr.write(`Unknown subcommand: ${subcmd}\n`);
      printUsage();
      process.exit(2);
  }
}

main()
  .catch((err) => {
    console.error('[sms-cli] FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
