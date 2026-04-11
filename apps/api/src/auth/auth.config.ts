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

  const prisma = new PrismaClient();

  _auth = betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
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
