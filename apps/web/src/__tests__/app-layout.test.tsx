/**
 * VALIDATION: TBD-03 — D-22 /app rejects admins + bootstraps active org.
 *
 * AppLayout (src/app/app/layout.tsx) is a "use client" component using
 * useRouter().push()/replace() + authClient.getSession() inside useEffect.
 * Tests mock next/navigation and authClient and assert on router call args.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import {
  createMockSession,
  mockAuthClient,
  resetAuthMocks,
} from "@/test-utils/mock-auth-client";
import {
  createMockFeatures,
  useFeaturesMockFn,
  resetUseFeaturesMock,
} from "@/test-utils/mock-use-features";

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: vi.fn() }),
  usePathname: () => "/app/dashboard",
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: mockAuthClient,
  useSession: () => ({ data: null }),
}));

const useCurrentRoleMock = vi.fn(() => ({
  userRole: "user",
  memberRole: "admin",
  activeOrgId: "org-test-1",
  activeOrgName: "Test Org",
  loading: false,
}));

vi.mock("@/hooks/use-current-role", () => ({
  useCurrentRole: () => useCurrentRoleMock(),
}));

vi.mock("@/hooks/use-features", () => ({
  useFeatures: (orgId: string | null | undefined) => useFeaturesMockFn(orgId),
}));

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
  Toaster: () => null,
}));

import AppLayout from "@/app/app/layout";

describe("tenant /app layout guard (D-22)", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    toastErrorMock.mockReset();
    resetAuthMocks();
    resetUseFeaturesMock();
    useFeaturesMockFn.mockImplementation(() => ({
      features: createMockFeatures(),
      isEnabled: () => true,
      loading: false,
      error: null,
    }));
    useCurrentRoleMock.mockReturnValue({
      userRole: "user",
      memberRole: "admin",
      activeOrgId: "org-test-1",
      activeOrgName: "Test Org",
      loading: false,
    });
  });

  it("renders children for User.role=user with active org", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "user", activeOrgId: "org-test-1" }),
    );

    const { getByTestId } = render(
      <AppLayout>
        <div data-testid="app-child">ok</div>
      </AppLayout>,
    );

    await waitFor(() => expect(getByTestId("app-child")).toBeInTheDocument());
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("redirects User.role=admin to /admin", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "admin", activeOrgId: null }),
    );

    render(
      <AppLayout>
        <div data-testid="app-child">ok</div>
      </AppLayout>,
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/admin");
    });
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

    render(
      <AppLayout>
        <div data-testid="app-child">ok</div>
      </AppLayout>,
    );

    await waitFor(() => {
      expect(mockAuthClient.organization.setActive).toHaveBeenCalledWith({
        organizationId: "org-a",
      });
    });
  });

  it("redirects to /sign-in when user has zero organizations", async () => {
    mockAuthClient.getSession.mockResolvedValue(
      createMockSession({ userRole: "user", activeOrgId: null }),
    );
    mockAuthClient.organization.list.mockResolvedValue({ data: [] });

    render(
      <AppLayout>
        <div data-testid="app-child">ok</div>
      </AppLayout>,
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/sign-in");
    });
    expect(toastErrorMock).toHaveBeenCalled();
  });
});
