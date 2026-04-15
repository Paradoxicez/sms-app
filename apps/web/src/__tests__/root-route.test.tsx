/**
 * VALIDATION: TBD-10 — D-23 root route redirects by role (client-redirect pattern).
 *
 * Implementation (see src/app/page.tsx) is a "use client" component that calls
 * useRouter().replace() from next/navigation inside a useEffect. These tests
 * mock useRouter and assert on replace() calls after render.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import {
  createMockSession,
  mockAuthClient,
  resetAuthMocks,
} from "@/test-utils/mock-auth-client";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: mockAuthClient,
}));

import RootPage from "@/app/page";

describe("root `/` route redirects by role (D-23)", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    resetAuthMocks();
  });

  it("redirects User.role=admin to /admin", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "admin", activeOrgId: null }),
    );
    render(<RootPage />);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/admin");
    });
  });

  it("redirects User.role=user to /app", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "user", activeOrgId: "org-test-1" }),
    );
    render(<RootPage />);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/app");
    });
  });

  it("redirects unauthenticated to /sign-in", async () => {
    mockAuthClient.getSession.mockResolvedValue({ data: null });
    render(<RootPage />);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/sign-in");
    });
  });
});
