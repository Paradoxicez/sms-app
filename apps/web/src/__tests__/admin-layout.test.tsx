/**
 * VALIDATION: TBD-02 — D-22 /admin rejects non-admins (threat T-999.1-01)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

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
  useSession: () => ({ data: null }),
}));

import AdminLayout from "@/app/admin/layout";

async function renderLayout() {
  // Server-component-style: await the element, then render.
  const element = await (AdminLayout as unknown as (props: {
    children: React.ReactNode;
  }) => Promise<JSX.Element>)({
    children: <div data-testid="admin-child">ok</div>,
  });
  return render(element);
}

describe("admin layout guard (D-22)", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    resetAuthMocks();
  });

  it("renders children for User.role=admin", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "admin", activeOrgId: null }),
    );

    const { getByTestId } = await renderLayout();
    await waitFor(() => {
      expect(getByTestId("admin-child")).toBeInTheDocument();
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects User.role=user to /app/dashboard", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "user", activeOrgId: "org-test-1" }),
    );

    await expect(renderLayout()).rejects.toThrow(/NEXT_REDIRECT:\/app\/dashboard/);
    expect(redirectMock).toHaveBeenCalledWith("/app/dashboard");
  });

  it("redirects unauthenticated to /sign-in", async () => {
    mockAuthClient.getSession.mockResolvedValue({ data: null });

    await expect(renderLayout()).rejects.toThrow(/NEXT_REDIRECT:\/sign-in/);
    expect(redirectMock).toHaveBeenCalledWith("/sign-in");
  });
});
