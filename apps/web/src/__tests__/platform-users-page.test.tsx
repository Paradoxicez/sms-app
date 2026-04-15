/**
 * VALIDATION: TBD-14 — AUTH-03/AUTH-04 Super Admin users list + role filter
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockAuthClient } from "@/test-utils/mock-auth-client";

vi.mock("@/lib/auth-client", () => ({
  authClient: mockAuthClient,
  useSession: () => ({
    data: {
      user: { id: "u1", role: "admin" },
      session: { activeOrganizationId: null },
    },
  }),
}));

const fetchMock = vi.fn(async (url: string | URL | Request) => ({
  ok: true,
  status: 200,
  json: async () => ({
    users: [
      {
        id: "u1",
        email: "a@test.com",
        name: "Admin A",
        role: "admin",
        organizations: [{ id: "o1", name: "Org A" }],
        createdAt: new Date("2026-04-01T00:00:00Z").toISOString(),
      },
      {
        id: "u2",
        email: "b@test.com",
        name: "User B",
        role: "user",
        organizations: [{ id: "o2", name: "Org B" }],
        createdAt: new Date("2026-04-02T00:00:00Z").toISOString(),
      },
    ],
    lastFetchedUrl: String(url),
  }),
}));
vi.stubGlobal("fetch", fetchMock);

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/users",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Expected RED: page does not yet exist.
import PlatformUsersPage from "@/app/admin/users/page";

describe("Platform Users page (AUTH-03/AUTH-04)", () => {
  beforeEach(() => {
    fetchMock.mockClear();
  });

  it("renders users table with columns per UI-SPEC: Email, Name, Role, Org, Created At", async () => {
    render(<PlatformUsersPage />);
    for (const col of ["Email", "Name", "Role", "Org", "Created At"]) {
      expect(
        await screen.findByRole("columnheader", { name: new RegExp(`^${col}$`, "i") }),
      ).toBeInTheDocument();
    }
  });

  it("renders role filter with options {admin, operator, developer, viewer}", async () => {
    render(<PlatformUsersPage />);
    const filter = await screen.findByLabelText(/role filter/i);
    expect(filter).toBeInTheDocument();
    for (const role of ["admin", "operator", "developer", "viewer"]) {
      expect(
        screen.getByRole("option", { name: new RegExp(role, "i") }),
      ).toBeInTheDocument();
    }
  });

  it("filters list when role filter changes", async () => {
    render(<PlatformUsersPage />);
    const filter = await screen.findByLabelText(/role filter/i);
    await userEvent.selectOptions(filter, "operator");

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("role=operator"))).toBe(true);
    });
  });

  it("opens 'Add Platform User' dialog with User.role enum {admin, user}", async () => {
    render(<PlatformUsersPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Add Platform User/i }),
    );
    expect(await screen.findByText(/^Add Platform User$/)).toBeInTheDocument();

    // This dialog targets User.role — platform-level — distinct from Team dialog.
    const roleField = await screen.findByLabelText(/User Role/i);
    const optionNames = Array.from(roleField.querySelectorAll("option")).map(
      (o) => o.getAttribute("value"),
    );
    expect(optionNames).toEqual(expect.arrayContaining(["admin", "user"]));
    expect(optionNames).not.toEqual(expect.arrayContaining(["operator"]));
  });
});
