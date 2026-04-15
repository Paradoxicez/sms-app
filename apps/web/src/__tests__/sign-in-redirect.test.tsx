/**
 * VALIDATION: TBD-01 — D-02/D-21 role-aware post-login redirect
 * Expected initial state: RED. The sign-in page does not yet read User.role
 * and branch its router.push target; once Wave 1 implements the role-based
 * redirect, this test should go green.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createMockSession,
  mockAuthClient,
  resetAuthMocks,
} from "@/test-utils/mock-auth-client";

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/sign-in",
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: mockAuthClient,
  signIn: mockAuthClient,
  signOut: mockAuthClient.signOut,
  useSession: () => ({ data: null }),
}));

// NOTE: the import target must resolve — test will FAIL here if module missing,
// which is the expected initial RED state.
import SignInPage from "@/app/(auth)/sign-in/page";

describe("sign-in page role redirect (D-02/D-21)", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    resetAuthMocks();
  });

  it("redirects admin to /admin after login", async () => {
    mockAuthClient.getSession.mockResolvedValueOnce(
      createMockSession({ userRole: "admin", activeOrgId: null }),
    );

    render(<SignInPage />);

    const email = await screen.findByLabelText(/email/i);
    const password = await screen.findByLabelText(/password/i);
    await userEvent.type(email, "admin@test.com");
    await userEvent.type(password, "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/admin");
    });
  });

  it("redirects non-admin to /app/dashboard after login", async () => {
    mockAuthClient.getSession.mockResolvedValueOnce(
      createMockSession({ userRole: "user", activeOrgId: "org-test-1" }),
    );

    render(<SignInPage />);

    const email = await screen.findByLabelText(/email/i);
    const password = await screen.findByLabelText(/password/i);
    await userEvent.type(email, "user@test.com");
    await userEvent.type(password, "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/app/dashboard");
    });
  });
});
