import { vi } from "vitest";

/**
 * Session shape mirrors `authClient.getSession()` return value from better-auth.
 * See apps/web/src/lib/auth-client.ts (organizationClient + adminClient plugins).
 */
export type MockUserRole = "admin" | "user";

export interface MockSessionUser {
  id: string;
  email: string;
  name: string;
  role: MockUserRole;
}

export interface MockSessionData {
  user: MockSessionUser;
  session: {
    activeOrganizationId: string | null;
  };
}

export interface MockOrganization {
  id: string;
  name: string;
}

export interface CreateMockSessionOpts {
  userRole?: MockUserRole;
  activeOrgId?: string | null;
  memberships?: MockOrganization[];
}

/**
 * Build a session payload compatible with `authClient.getSession().data`.
 */
export function createMockSession(
  opts: CreateMockSessionOpts = {},
): { data: MockSessionData | null } {
  const {
    userRole = "user",
    activeOrgId = "org-test-1",
    memberships: _memberships = [{ id: "org-test-1", name: "Test Org" }],
  } = opts;

  return {
    data: {
      user: {
        id: "user-test-1",
        email: "user@test.com",
        name: "Test User",
        role: userRole,
      },
      session: {
        activeOrganizationId: activeOrgId,
      },
    },
  };
}

/**
 * Fabricated vi.fn() fixture that stand-ins for `authClient`.
 * Test files should `vi.mock("@/lib/auth-client", () => ({ authClient: mockAuthClient }))`.
 */
export const mockAuthClient = {
  getSession: vi.fn(async () => createMockSession()),
  organization: {
    list: vi.fn(async () => ({
      data: [{ id: "org-test-1", name: "Test Org" }] as MockOrganization[],
    })),
    setActive: vi.fn(async (_args: { organizationId: string }) => ({ data: {} })),
  },
  signOut: vi.fn(async () => ({ data: {} })),
};

export function resetAuthMocks(): void {
  mockAuthClient.getSession.mockReset();
  mockAuthClient.organization.list.mockReset();
  mockAuthClient.organization.setActive.mockReset();
  mockAuthClient.signOut.mockReset();

  // Restore sane defaults so tests that don't explicitly stub get a valid user session.
  mockAuthClient.getSession.mockImplementation(async () => createMockSession());
  mockAuthClient.organization.list.mockImplementation(async () => ({
    data: [{ id: "org-test-1", name: "Test Org" }],
  }));
  mockAuthClient.organization.setActive.mockImplementation(async () => ({ data: {} }));
  mockAuthClient.signOut.mockImplementation(async () => ({ data: {} }));
}
