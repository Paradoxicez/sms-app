/**
 * VALIDATION: TBD-10 — D-23 root route redirects by role
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  createMockSession,
  mockAuthClient,
  resetAuthMocks,
} from "@/test-utils/mock-auth-client";

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: mockAuthClient,
}));

// Expected RED initial state: existing page.tsx is a dashboard, not a redirector.
import RootPage from "@/app/page";

async function runRoot() {
  return (RootPage as unknown as () => Promise<unknown>)();
}

describe("root `/` route redirects by role (D-23)", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    resetAuthMocks();
  });

  it("redirects User.role=admin to /admin", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "admin", activeOrgId: null }),
    );
    await expect(runRoot()).rejects.toThrow(/NEXT_REDIRECT:\/admin/);
  });

  it("redirects User.role=user to /app", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "user", activeOrgId: "org-test-1" }),
    );
    await expect(runRoot()).rejects.toThrow(/NEXT_REDIRECT:\/app/);
  });

  it("redirects unauthenticated to /sign-in", async () => {
    mockAuthClient.getSession.mockResolvedValue({ data: null });
    await expect(runRoot()).rejects.toThrow(/NEXT_REDIRECT:\/sign-in/);
  });
});
