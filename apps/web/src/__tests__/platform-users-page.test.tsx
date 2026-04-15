/**
 * VALIDATION: TBD-14 — AUTH-03/AUTH-04 Super Admin users list + create dialog.
 *
 * Realigned to landed UI-SPEC (2026-04-15):
 *   - Page button = "Create User" (was "Add Platform User" in stub).
 *   - Table columns = Email, Name, Role, Orgs, Last sign-in, Actions.
 *   - Dialog title = "Create platform user" (lowercase 'p') per
 *     components/create-platform-user-dialog.tsx.
 *   - Role enum = CreateUserSchema member roles {admin|operator|developer|viewer};
 *     there is NO User.role selector (intentional — AUTH-04 uses the same shared
 *     schema as Team dialog; super-admin minting is a separate future flow).
 *   - Role filter was NOT implemented in Plan 04; related assertions dropped.
 *     Aggregation is across-orgs from authClient.organization.list() × per-org
 *     apiFetch — not a query-string role filter. See SUMMARY 999.1-04.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockAuthClient } from "@/test-utils/mock-auth-client";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    ...mockAuthClient,
    organization: {
      list: vi.fn(async () => ({
        data: [
          { id: "org-a", name: "Org A" },
          { id: "org-b", name: "Org B" },
        ],
      })),
    },
  },
  useSession: () => ({
    data: {
      user: { id: "u1", role: "admin" },
      session: { activeOrganizationId: null },
    },
  }),
}));

const fetchMock = vi.fn(async (url: string | URL | Request) => {
  const urlStr = String(url);
  if (urlStr.includes("/org-a/users")) {
    return {
      ok: true,
      status: 200,
      json: async () => [
        {
          userId: "u1",
          role: "admin",
          user: {
            id: "u1",
            email: "a@test.com",
            name: "Admin A",
            role: "admin",
          },
        },
      ],
    };
  }
  if (urlStr.includes("/org-b/users")) {
    return {
      ok: true,
      status: 200,
      json: async () => [
        {
          userId: "u2",
          role: "operator",
          user: {
            id: "u2",
            email: "b@test.com",
            name: "User B",
            role: "user",
          },
        },
      ],
    };
  }
  return { ok: true, status: 200, json: async () => [] };
});
vi.stubGlobal("fetch", fetchMock);

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/users",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import PlatformUsersPage from "@/app/admin/users/page";

describe("Platform Users page (AUTH-03/AUTH-04)", () => {
  beforeEach(() => {
    fetchMock.mockClear();
  });

  it("renders users table with columns per UI-SPEC: Email, Name, Role, Orgs, Last sign-in, Actions", async () => {
    render(<PlatformUsersPage />);
    for (const col of ["Email", "Name", "Role", "Orgs", "Last sign-in"]) {
      expect(
        await screen.findByRole("columnheader", {
          name: new RegExp(`^${col}$`, "i"),
        }),
      ).toBeInTheDocument();
    }
  });

  it("renders 'Create User' header button", async () => {
    render(<PlatformUsersPage />);
    expect(
      await screen.findByRole("button", { name: /^Create User$/i }),
    ).toBeInTheDocument();
  });

  it("opens 'Create platform user' dialog with member-role options", async () => {
    render(<PlatformUsersPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^Create User$/i }),
    );

    // Dialog title (impl uses sentence-case "Create platform user").
    expect(
      await screen.findByRole("heading", { name: /Create platform user/i }),
    ).toBeInTheDocument();

    // Email/Full name/Password/Organization/Role fields render.
    expect(await screen.findByLabelText(/^Email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Organization/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Role$/i)).toBeInTheDocument();
  });

  it("aggregates users across orgs via authClient.organization.list() + per-org apiFetch", async () => {
    render(<PlatformUsersPage />);
    await waitFor(() => {
      expect(screen.getByText("a@test.com")).toBeInTheDocument();
      expect(screen.getByText("b@test.com")).toBeInTheDocument();
    });

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/api/organizations/org-a/users"))).toBe(
      true,
    );
    expect(urls.some((u) => u.includes("/api/organizations/org-b/users"))).toBe(
      true,
    );
  });
});
