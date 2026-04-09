import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization, admin } from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';
import {
  ac,
  adminRole,
  operatorRole,
  developerRole,
  viewerRole,
  superAdminRole,
} from './roles';

const prisma = new PrismaClient();

export const auth = betterAuth({
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
      sendInvitationEmail: async (data) => {
        // TODO: Wire to email service in a future phase
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
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'],
});

export type Auth = typeof auth;
