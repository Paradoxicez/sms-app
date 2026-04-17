/**
 * VALIDATION: TBD-07 — D-04 platform sidebar = exactly 7 items.
 * Tests adminNavGroups from nav-config.ts (replaces PlatformNav component tests).
 */
import { describe, it, expect } from "vitest";
import { adminNavGroups } from "@/components/nav/nav-config";

describe("adminNavGroups (D-04, D-06)", () => {
  it("contains exactly 1 group with label 'Platform'", () => {
    expect(adminNavGroups).toHaveLength(1);
    expect(adminNavGroups[0].label).toBe("Platform");
  });

  it("Platform group has exactly 7 items", () => {
    expect(adminNavGroups[0].items).toHaveLength(7);
  });

  it("items include Dashboard, Organizations, Packages, Cluster Nodes, Stream Engine, Platform Audit, Users", () => {
    const labels = adminNavGroups[0].items.map((i) => i.label);
    expect(labels).toEqual([
      "Dashboard",
      "Organizations",
      "Packages",
      "Cluster Nodes",
      "Stream Engine",
      "Platform Audit",
      "Users",
    ]);
  });

  it("each item has href, icon, and label defined", () => {
    for (const item of adminNavGroups[0].items) {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.icon).toBeDefined();
    }
  });

  it("does NOT contain any tenant items (Cameras, Projects, Recordings, etc)", () => {
    const labels = adminNavGroups[0].items.map((i) => i.label);
    for (const tenant of ["Cameras", "Projects", "Recordings", "Map", "API Keys", "Webhooks", "Policies", "Team"]) {
      expect(labels).not.toContain(tenant);
    }
  });
});
