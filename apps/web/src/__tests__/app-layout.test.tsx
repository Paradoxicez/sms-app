/**
 * VALIDATION: TBD-03 — D-22 /app rejects admins + bootstraps active org
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

// Expected RED: @/app/app/layout does not exist yet — Wave 1 will create it.
import AppLayout from "@/app/app/layout";

async function renderLayout() {
  const element = await (AppLayout as unknown as (props: {
    children: React.ReactNode;
  }) => Promise<JSX.Element>)({
    children: <div data-testid="app-child">ok</div>,
  });
  return render(element);
}

describe("tenant /app layout guard (D-22)", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    resetAuthMocks();
  });

  it("renders children for User.role=user with active org", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "user", activeOrgId: "org-test-1" }),
    );

    const { getByTestId } = await renderLayout();
    await waitFor(() => expect(getByTestId("app-child")).toBeInTheDocument());
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects User.role=admin to /admin", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "admin", activeOrgId: null }),
    );

    await expect(renderLayout()).rejects.toThrow(/NEXT_REDIRECT:\/admin/);
  });

  it("calls organization.setActive with first org when activeOrganizationId is null", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "user", activeOrgId: null }),
    );
    mockAuthClient.organization.list.mockResolvedValue({
      data: [
        { id: "org-a", name: "Org A" },
        { id: "org-b", name: "Org B" },
      ],
    });

    await renderLayout().catch(() => {
      // redirect may or may not happen depending on implementation; we only
      // care that setActive was invoked with the first org.
    });

    await waitFor(() => {
      expect(mockAuthClient.organization.setActive).toHaveBeenCalledWith({
        organizationId: "org-a",
      });
    });
  });

  it("redirects to /sign-in with toast when user has zero organizations", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "user", activeOrgId: null }),
    );
    mockAuthClient.organization.list.mockResolvedValue({ data: [] });

    await expect(renderLayout()).rejects.toThrow(/NEXT_REDIRECT:\/sign-in/);
  });
});
