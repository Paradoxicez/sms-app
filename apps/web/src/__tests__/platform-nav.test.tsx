/**
 * VALIDATION: TBD-07 — D-04 platform sidebar = exactly 7 items
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { mockAuthClient } from "@/test-utils/mock-auth-client";

vi.mock("@/lib/auth-client", () => ({
  authClient: mockAuthClient,
  useSession: () => ({ data: null }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ push: vi.fn() }),
}));

// Expected RED: module does not yet exist.
import { PlatformNav } from "@/components/nav/platform-nav";

describe("PlatformNav (D-04, D-06)", () => {
  it("renders exactly 7 items: Dashboard, Organizations, Packages, Cluster Nodes, Stream Engine, Platform Audit, Users", () => {
    render(<PlatformNav />);
    const expected = [
      "Dashboard",
      "Organizations",
      "Packages",
      "Cluster Nodes",
      "Stream Engine",
      "Platform Audit",
      "Users",
    ];
    for (const label of expected) {
      expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
    const allLinks = screen.getAllByRole("link");
    // Exactly seven navigation links, no tenant items bleed in.
    expect(allLinks.length).toBe(7);
  });

  it("does NOT render tenant items (Cameras, Projects, Recordings, etc) (D-06)", () => {
    render(<PlatformNav />);
    for (const label of ["Cameras", "Projects", "Recordings", "Map", "API Keys", "Webhooks", "Policies", "Team"]) {
      expect(screen.queryByRole("link", { name: new RegExp(label, "i") })).toBeNull();
    }
  });

  it("header badge reads 'Platform'", () => {
    render(<PlatformNav />);
    expect(screen.getByText(/^Platform$/)).toBeInTheDocument();
  });
});
