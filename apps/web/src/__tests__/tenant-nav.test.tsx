/**
 * VALIDATION: TBD-04/TBD-05/TBD-06 — D-11 role & D-13 feature filtering.
 * Tests tenantNavGroups, filterNavGroups, and ROLE_MATRIX from nav-config.ts
 * (replaces TenantNav component tests).
 */
import { describe, it, expect } from "vitest";
import {
  tenantNavGroups,
  filterNavGroups,
  ROLE_MATRIX,
} from "@/components/nav/nav-config";

describe("tenantNavGroups", () => {
  it("contains exactly 4 groups: Overview, Cameras, Organization, Developer", () => {
    expect(tenantNavGroups).toHaveLength(4);
    expect(tenantNavGroups.map((g) => g.label)).toEqual([
      "Overview",
      "Cameras",
      "Organization",
      "Developer",
    ]);
  });
});

describe("ROLE_MATRIX", () => {
  it("admin has ALL access", () => {
    expect(ROLE_MATRIX.admin).toBe("ALL");
  });

  it("operator includes dashboard, cameras, map, recordings, audit-log", () => {
    expect(ROLE_MATRIX.operator).toContain("/app/dashboard");
    expect(ROLE_MATRIX.operator).toContain("/app/cameras");
    expect(ROLE_MATRIX.operator).toContain("/app/map");
    expect(ROLE_MATRIX.operator).toContain("/app/recordings");
    expect(ROLE_MATRIX.operator).toContain("/app/audit-log");
  });

  it("developer includes developer paths but not recordings", () => {
    expect(ROLE_MATRIX.developer).toContain("/app/developer/api-keys");
    expect(ROLE_MATRIX.developer).not.toContain("/app/recordings");
  });

  it("viewer excludes developer paths", () => {
    expect(ROLE_MATRIX.viewer).not.toContain("/app/developer/api-keys");
  });
});

describe("filterNavGroups", () => {
  const allEnabled = () => true;
  const noneEnabled = () => false;

  it("admin with all features returns all items", () => {
    const result = filterNavGroups(tenantNavGroups, "admin", allEnabled);
    const allHrefs = result.flatMap((g) => g.items.map((i) => i.href));
    // All 12 items when all features are on
    expect(allHrefs).toHaveLength(12);
  });

  it("viewer excludes Developer section items", () => {
    const result = filterNavGroups(tenantNavGroups, "viewer", allEnabled);
    const allHrefs = result.flatMap((g) => g.items.map((i) => i.href));
    expect(allHrefs).not.toContain("/app/developer/api-keys");
    expect(allHrefs).not.toContain("/app/developer/webhooks");
    expect(allHrefs).not.toContain("/app/developer/docs");
  });

  it("operator includes /app/dashboard and /app/cameras but excludes Developer section", () => {
    const result = filterNavGroups(tenantNavGroups, "operator", allEnabled);
    const allHrefs = result.flatMap((g) => g.items.map((i) => i.href));
    expect(allHrefs).toContain("/app/dashboard");
    expect(allHrefs).toContain("/app/cameras");
    expect(allHrefs).not.toContain("/app/developer/api-keys");
  });

  it("feature flag filtering: recordings=false excludes Recordings item", () => {
    const isEnabled = (key: string) => key !== "recordings";
    const result = filterNavGroups(tenantNavGroups, "admin", isEnabled);
    const allLabels = result.flatMap((g) => g.items.map((i) => i.label));
    expect(allLabels).not.toContain("Recordings");
  });

  it("feature flag filtering: apiKeys=false and webhooks=false excludes those items", () => {
    const isEnabled = (key: string) => key !== "apiKeys" && key !== "webhooks";
    const result = filterNavGroups(tenantNavGroups, "admin", isEnabled);
    const allLabels = result.flatMap((g) => g.items.map((i) => i.label));
    expect(allLabels).not.toContain("API Keys");
    expect(allLabels).not.toContain("Webhooks");
    // Dashboard and Docs should still be present
    expect(allLabels).toContain("Dashboard");
    expect(allLabels).toContain("Docs");
  });

  it("removes empty groups after filtering", () => {
    // Viewer with no features enabled: some groups might be empty
    const result = filterNavGroups(tenantNavGroups, "viewer", noneEnabled);
    for (const group of result) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});
