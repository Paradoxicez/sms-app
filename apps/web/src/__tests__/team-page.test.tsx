/**
 * VALIDATION: TBD-13 — TENANT-05 Org Admin Team page create-member dialog
 * (no User.role=admin option — see threat T-999.1-03)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockAuthClient } from "@/test-utils/mock-auth-client";

vi.mock("@/lib/auth-client", () => ({
  authClient: mockAuthClient,
  useSession: () => ({
    data: {
      user: { id: "u-admin", role: "user" },
      session: { activeOrganizationId: "org-test-1" },
    },
  }),
}));

const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({ id: "new-user", email: "new@test.com" }),
  status: 200,
}));
vi.stubGlobal("fetch", fetchMock);

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: vi.fn() },
  Toaster: () => null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/team",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Stub member context so component can infer caller role.
vi.mock("@/hooks/use-current-member", () => ({
  useCurrentMember: () => ({ role: "admin", loading: false }),
}));

// Expected RED: page and/or dialog do not exist yet.
import TeamPage from "@/app/app/team/page";

describe("Team page (TENANT-05 Org Admin dialog)", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    toastSuccess.mockClear();
  });

  it("renders 'Add Team Member' button for Org Admin", async () => {
    render(<TeamPage />);
    expect(
      await screen.findByRole("button", { name: /Add Team Member/ }),
    ).toBeInTheDocument();
  });

  it("opens create dialog with title 'Add Team Member' and role options limited to admin|operator|developer|viewer", async () => {
    render(<TeamPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Add Team Member/ }),
    );

    // Dialog title
    expect(await screen.findByText(/^Add Team Member$/)).toBeInTheDocument();

    // Role options present — Member roles only.
    for (const role of ["admin", "operator", "developer", "viewer"]) {
      expect(screen.getByRole("option", { name: new RegExp(role, "i") })).toBeInTheDocument();
    }

    // MUST NOT expose the platform-level User.role selector — prevents tenant
    // admins from minting super admins (threat T-999.1-03).
    expect(screen.queryByLabelText(/Platform Role/i)).toBeNull();
  });

  it("submits POST /api/organizations/:orgId/users with Member role and shows success toast", async () => {
    render(<TeamPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Add Team Member/ }),
    );

    await userEvent.type(await screen.findByLabelText(/email/i), "new@test.com");
    await userEvent.type(screen.getByLabelText(/name/i), "New User");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/organizations\/[^/]+\/users$/);
    expect(init?.method).toBe("POST");

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringMatching(/User created\. They can sign in now\./),
      );
    });
  });

  it("hides 'Add Team Member' button for operator/developer/viewer roles (D-11)", async () => {
    const useMember = await import("@/hooks/use-current-member");
    vi.spyOn(useMember, "useCurrentMember").mockReturnValue({
      role: "operator",
      loading: false,
    });

    render(<TeamPage />);
    // Wait a tick for initial render; button should never appear.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Add Team Member/ }),
      ).toBeNull();
    });
  });
});
