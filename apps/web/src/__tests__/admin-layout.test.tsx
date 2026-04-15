/**
 * VALIDATION: TBD-02 — D-22 /admin rejects non-admins (threat T-999.1-01).
 *
 * AdminLayout (src/app/admin/layout.tsx) is a "use client" component; it uses
 * useRouter().push() for auth/role redirects. Tests mock useRouter and assert
 * on push() calls.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import {
  createMockSession,
  mockAuthClient,
  resetAuthMocks,
} from "@/test-utils/mock-auth-client";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/dashboard",
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: mockAuthClient,
  useSession: () => ({ data: null }),
}));

import AdminLayout from "@/app/admin/layout";

describe("admin layout guard (D-22)", () => {
  beforeEach(() => {
    pushMock.mockReset();
    resetAuthMocks();
  });

  it("renders children for User.role=admin", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "admin", activeOrgId: "org-test-1" }),
    );

    const { getByTestId } = render(
      <AdminLayout>
        <div data-testid="admin-child">ok</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      expect(getByTestId("admin-child")).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("redirects User.role=user to /app/dashboard", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "user", activeOrgId: "org-test-1" }),
    );

    render(
      <AdminLayout>
        <div data-testid="admin-child">ok</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/app/dashboard");
    });
  });

  it("redirects unauthenticated to /sign-in", async () => {
    mockAuthClient.getSession.mockResolvedValue({ data: null });

    render(
      <AdminLayout>
        <div data-testid="admin-child">ok</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/sign-in");
    });
  });
});
