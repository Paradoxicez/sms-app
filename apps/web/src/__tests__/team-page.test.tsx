/**
 * VALIDATION: TBD-13 — TENANT-05 Org Admin Team page create-member dialog
 * (no User.role=admin option — see threat T-999.1-03).
 *
 * Realigned to landed UI (2026-04-15):
 *   - useCurrentRole (not use-current-member) supplies memberRole/activeOrgId.
 *   - AddTeamMemberDialog title = "Add team member" (sentence case);
 *     submit button label = "Create user" (matches impl). Role selector is a
 *     Radix Select component (not native <option>), so role-options are exposed
 *     by clicking the trigger and reading the listbox.
 *   - Non-admin roles DO NOT render an empty Team page; they see a lock
 *     empty-state per src/app/app/team/page.tsx lines 82-95. Button is absent
 *     by virtue of early return, which is the behaviour D-11 wanted.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { useCurrentRoleMock, fetchMock, toastSuccess } = vi.hoisted(() => ({
  useCurrentRoleMock: vi.fn(() => ({
    userRole: "user" as const,
    memberRole: "admin" as const,
    activeOrgId: "org-test-1",
    activeOrgName: "Test Org",
    loading: false,
  })),
  fetchMock: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/hooks/use-current-role", () => ({
  useCurrentRole: () => useCurrentRoleMock(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    getSession: vi.fn(async () => ({
      data: {
        user: { id: "u-admin", role: "user" },
        session: { activeOrganizationId: "org-test-1" },
      },
    })),
  },
  useSession: () => ({
    data: {
      user: { id: "u-admin", role: "user" },
      session: { activeOrganizationId: "org-test-1" },
    },
  }),
}));

vi.stubGlobal("fetch", fetchMock);

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: vi.fn() },
  Toaster: () => null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/team",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import TeamPage from "@/app/app/team/page";

describe("Team page (TENANT-05 Org Admin dialog)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    toastSuccess.mockReset();
    useCurrentRoleMock.mockReturnValue({
      userRole: "user",
      memberRole: "admin",
      activeOrgId: "org-test-1",
      activeOrgName: "Test Org",
      loading: false,
    });
    // Default: /members (list) returns [] → "Just you so far" branch; dialog submit returns 200.
    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "new-user", email: "new@test.com" }),
        } as unknown as Response;
      }
      if (urlStr.includes("/api/organizations/") && urlStr.endsWith("/users")) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response;
    });
  });

  it("renders 'Add Team Member' button for Org Admin", async () => {
    render(<TeamPage />);
    expect(
      await screen.findByRole("button", { name: /Add Team Member/i }),
    ).toBeInTheDocument();
  });

  it("opens create dialog with title 'Add team member' and member-role options (no Platform Role)", async () => {
    render(<TeamPage />);
    await userEvent.click(
      await screen.findAllByRole("button", { name: /Add Team Member/i }).then(
        (buttons) => buttons[0],
      ),
    );

    // Dialog title (matches impl DialogTitle sentence-case text).
    expect(
      await screen.findByRole("heading", { name: /Add team member/i }),
    ).toBeInTheDocument();

    // Open the role Select to verify option labels for member roles only.
    const roleTrigger = screen.getByLabelText(/^Role$/i);
    await userEvent.click(roleTrigger);

    for (const label of ["Org Admin", "Operator", "Developer", "Viewer"]) {
      expect(
        await screen.findByRole("option", { name: new RegExp(label, "i") }),
      ).toBeInTheDocument();
    }

    // MUST NOT expose a platform-level User.role selector (T-999.1-03/10).
    expect(screen.queryByLabelText(/Platform Role/i)).toBeNull();
  });

  it("submits POST /api/organizations/:orgId/users and shows success toast", async () => {
    render(<TeamPage />);
    const buttons = await screen.findAllByRole("button", {
      name: /Add Team Member/i,
    });
    await userEvent.click(buttons[0]);

    await userEvent.type(
      await screen.findByLabelText(/^Email$/i),
      "new@test.com",
    );
    await userEvent.type(screen.getByLabelText(/Full name/i), "New User");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "password123");
    await userEvent.click(
      screen.getByRole("button", { name: /^Create user$/i }),
    );

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(postCalls.length).toBeGreaterThan(0);
      const [url, init] = postCalls[0] as [string, RequestInit];
      expect(url).toMatch(/\/api\/organizations\/[^/]+\/users$/);
      expect(init?.method).toBe("POST");
    });

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringMatching(/User created\. They can sign in now\./),
      );
    });
  });

  it("shows lock empty-state (no Add button) for operator/developer/viewer (D-11)", async () => {
    useCurrentRoleMock.mockReturnValue({
      userRole: "user",
      memberRole: "operator",
      activeOrgId: "org-test-1",
      activeOrgName: "Test Org",
      loading: false,
    });

    render(<TeamPage />);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Add Team Member/i }),
      ).toBeNull();
    });
    expect(
      screen.getByText(/You do not have access to this page/i),
    ).toBeInTheDocument();
  });
});
