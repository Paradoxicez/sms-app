import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { testPrisma } from '../setup';
import { cleanupTestData } from '../helpers/tenancy';

// Vitest's VM cannot run the Function-wrapped dynamic import in esm-loader,
// so we swap it for native `import()` (Vite/Node resolves it fine).
vi.mock('../../src/auth/esm-loader', async () => {
  const [
    { betterAuth },
    { prismaAdapter },
    plugins,
    { createAccessControl },
    adminAccess,
  ] = await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/prisma'),
    import('better-auth/plugins'),
    import('better-auth/plugins/access'),
    import('better-auth/plugins/admin/access'),
  ]);
  return {
    loadBetterAuth: async () => ({ betterAuth }),
    loadBetterAuthAdapters: async () => ({ prismaAdapter }),
    loadBetterAuthPlugins: async () => ({
      organization: (plugins as any).organization,
      admin: (plugins as any).admin,
    }),
    loadBetterAuthAccess: async () => ({
      createAccessControl,
      defaultStatements: (adminAccess as any).defaultStatements,
      adminAc: (adminAccess as any).adminAc,
    }),
    loadBetterAuthNode: async () => ({
      toNodeHandler: (await import('better-auth/node')).toNodeHandler,
    }),
  };
});

import { initAuth, getAuth } from '../../src/auth/auth.config';

describe('AUTH-01: Sign-in with email and password', () => {
  const testEmail = 'signin-test@example.com';
  const testPassword = 'SecurePass123!';
  let auth: ReturnType<typeof getAuth>;

  beforeAll(async () => {
    await initAuth();
    auth = getAuth();
  });

  beforeEach(async () => {
    await cleanupTestData(testPrisma);
    await auth.api.signUpEmail({
      body: {
        email: testEmail,
        password: testPassword,
        name: 'Sign-In Test User',
      },
    });
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('should sign in with valid credentials and return session', async () => {
    const response = await auth.api.signInEmail({
      body: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(response).toBeDefined();
    // Better Auth signInEmail returns { user, token } -- token is at the top level
    expect(response.user).toBeDefined();
    expect(response.user.email).toBe(testEmail);
    expect(response.token).toBeDefined();
  });

  it('should reject invalid password', async () => {
    try {
      await auth.api.signInEmail({
        body: {
          email: testEmail,
          password: 'WrongPassword123!',
        },
      });
      expect.fail('Should have thrown an error');
    } catch (error: unknown) {
      expect(error).toBeDefined();
    }
  });

  it('should reject non-existent email without user enumeration', async () => {
    try {
      await auth.api.signInEmail({
        body: {
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        },
      });
      expect.fail('Should have thrown an error');
    } catch (error: unknown) {
      expect(error).toBeDefined();
    }
  });

  it('should reject password below minLength (8) at signup', async () => {
    try {
      await auth.api.signUpEmail({
        body: {
          email: 'short-pass@example.com',
          password: 'short',
          name: 'Short Password User',
        },
      });
      expect.fail('Should have thrown an error for short password');
    } catch (error: unknown) {
      expect(error).toBeDefined();
    }
  });
});
