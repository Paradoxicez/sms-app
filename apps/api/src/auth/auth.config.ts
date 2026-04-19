import { PrismaClient } from '@prisma/client';
import { initAccessControl } from './roles';
import { loadBetterAuth, loadBetterAuthAdapters, loadBetterAuthPlugins } from './esm-loader';

let _auth: any;

export async function initAuth() {
  if (_auth) return _auth;

  const { betterAuth } = await loadBetterAuth();
  const { prismaAdapter } = await loadBetterAuthAdapters();
  const { organization, admin } = await loadBetterAuthPlugins();

  const { ac, adminRole, operatorRole, developerRole, viewerRole, superAdminRole } =
    await initAccessControl();

  // Better Auth owns User/Account/Session/Organization/Member rows and must be
  // able to read/write them regardless of RLS tenancy context. It runs outside
  // any request's CLS context (e.g., during sign-in before a session exists),
  // so it must use a BYPASSRLS role. The `DATABASE_URL_MIGRATE` connection is
  // the sms superuser, which has rolbypassrls = true.
  const prisma = new PrismaClient({
    datasourceUrl:
      process.env.BETTER_AUTH_DATABASE_URL ||
      process.env.DATABASE_URL_MIGRATE ||
      process.env.DATABASE_URL,
  });

  _auth = betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days (remember me extends session)
      updateAge: 60 * 60 * 24, // refresh daily
    },
    plugins: [
      organization({
        ac,
        roles: {
          admin: adminRole,
          operator: operatorRole,
          developer: developerRole,
          viewer: viewerRole,
        },
        allowUserToCreateOrganization: false,
        creatorRole: 'admin',
        sendInvitationEmail: async (data: any) => {
          console.log(`Invitation email to ${data.email}`, data);
        },
      }),
      admin({
        ac,
        roles: {
          superAdmin: superAdminRole,
        },
        defaultRole: 'viewer',
        impersonationSessionDuration: 3600,
      }),
    ],
    trustedOrigins: [
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:3010',
    ],
  });

  return _auth;
}

export function getAuth() {
  if (!_auth) throw new Error('Auth not initialized — call initAuth() first');
  return _auth;
}

export type Auth = Awaited<ReturnType<typeof initAuth>>;
