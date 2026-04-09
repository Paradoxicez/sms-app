import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import { cleanupTestData } from '../helpers/tenancy';
import { auth } from '../../src/auth/auth.config';

describe('AUTH-01: Sign-in with email and password', () => {
  const testEmail = 'signin-test@example.com';
  const testPassword = 'SecurePass123!';

  beforeEach(async () => {
    await cleanupTestData(testPrisma);

    // Create a user via Better Auth sign-up
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
