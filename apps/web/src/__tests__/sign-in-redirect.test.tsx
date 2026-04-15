/**
 * VALIDATION: TBD-01 — D-02/D-21 role-aware post-login redirect.
 *
 * SignInPage (src/app/(auth)/sign-in/page.tsx) is a client component; after
 * authClient.signIn.email() succeeds it reads session role and calls
 * router.push('/admin') or router.push('/app/dashboard').
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createMockSession,
  mockAuthClient,
  resetAuthMocks,
} from "@/test-utils/mock-auth-client";

const { pushMock, replaceMock, signInEmailMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  signInEmailMock: vi.fn(async () => ({ data: {}, error: null })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/sign-in",
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    ...mockAuthClient,
    signIn: { email: signInEmailMock },
  },
}));

import SignInPage from "@/app/(auth)/sign-in/page";

describe("sign-in page role redirect (D-02/D-21)", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    signInEmailMock.mockReset();
    signInEmailMock.mockResolvedValue({ data: {}, error: null });
    resetAuthMocks();
  });

  it("redirects admin to /admin after login", async () => {
    mockAuthClient.getSession.mockResolvedValue(
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
    mockAuthClient.getSession.mockResolvedValue(
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
