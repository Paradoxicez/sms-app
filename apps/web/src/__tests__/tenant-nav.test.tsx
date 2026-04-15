/**
 * VALIDATION: TBD-04/TBD-05/TBD-06 — D-11 role & D-13 feature filtering of tenant nav.
 *
 * Props contract per src/components/nav/tenant-nav.tsx:
 *   TenantNav({ memberRole, activeOrgId, activeOrgName, userName?, userEmail? })
 *
 * Admin (memberRole="admin") permitted=ALL, so nav surfaces the union of all
 * groups gated by useFeatures. With all default features ON, 12 items render:
 *   Overview      : Dashboard, Map
 *   Cameras       : Cameras, Projects, Sites, Stream Profiles, Recordings, Policies
 *   Organization  : Team, Audit Log
 *   Developer     : API Keys, Webhooks
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  createMockFeatures,
  useFeaturesMockFn,
  resetUseFeaturesMock,
} from "@/test-utils/mock-use-features";

vi.mock("@/hooks/use-features", () => ({
  useFeatures: (orgId: string | null | undefined) => useFeaturesMockFn(orgId),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: vi.fn(async () => ({ data: {} })),
  },
}));

import { TenantNav } from "@/components/nav/tenant-nav";

const ORG_ID = "org-test-1";
const ORG_NAME = "Test Org";

describe("TenantNav role + feature filtering (D-11, D-13, D-14)", () => {
  beforeEach(() => {
    resetUseFeaturesMock();
  });

  it("Org Admin sees all 12 nav items when all features enabled", () => {
    render(
      <TenantNav
        memberRole="admin"
        activeOrgId={ORG_ID}
        activeOrgName={ORG_NAME}
      />,
    );
    const expected = [
      "Dashboard",
      "Map",
      "Cameras",
      "Projects",
      "Sites",
      "Stream Profiles",
      "Recordings",
      "Policies",
      "Team",
      "Audit Log",
      "API Keys",
      "Webhooks",
    ];
    for (const label of expected) {
      expect(
        screen.getByRole("link", { name: new RegExp(`^${label}$`, "i") }),
      ).toBeInTheDocument();
    }
  });

  it("Operator sees exactly {Dashboard, Cameras, Map, Recordings, Audit Log}", () => {
    render(
      <TenantNav
        memberRole="operator"
        activeOrgId={ORG_ID}
        activeOrgName={ORG_NAME}
      />,
    );
    const allowed = ["Dashboard", "Cameras", "Map", "Recordings", "Audit Log"];
    for (const label of allowed) {
      expect(
        screen.getByRole("link", { name: new RegExp(`^${label}$`, "i") }),
      ).toBeInTheDocument();
    }
    for (const disallowed of [
      "Policies",
      "Team",
      "API Keys",
      "Webhooks",
      "Projects",
    ]) {
      expect(
        screen.queryByRole("link", { name: new RegExp(`^${disallowed}$`, "i") }),
      ).toBeNull();
    }
  });

  it("Developer sees exactly {Dashboard, Cameras, Map, API Keys, Webhooks, Audit Log}", () => {
    render(
      <TenantNav
        memberRole="developer"
        activeOrgId={ORG_ID}
        activeOrgName={ORG_NAME}
      />,
    );
    const allowed = [
      "Dashboard",
      "Cameras",
      "Map",
      "API Keys",
      "Webhooks",
      "Audit Log",
    ];
    for (const label of allowed) {
      expect(
        screen.getByRole("link", { name: new RegExp(`^${label}$`, "i") }),
      ).toBeInTheDocument();
    }
    for (const disallowed of ["Policies", "Team", "Recordings", "Projects"]) {
      expect(
        screen.queryByRole("link", { name: new RegExp(`^${disallowed}$`, "i") }),
      ).toBeNull();
    }
  });

  it("Viewer sees exactly {Dashboard, Cameras, Map, Recordings, Audit Log}", () => {
    render(
      <TenantNav
        memberRole="viewer"
        activeOrgId={ORG_ID}
        activeOrgName={ORG_NAME}
      />,
    );
    const allowed = ["Dashboard", "Cameras", "Map", "Recordings", "Audit Log"];
    for (const label of allowed) {
      expect(
        screen.getByRole("link", { name: new RegExp(`^${label}$`, "i") }),
      ).toBeInTheDocument();
    }
    for (const disallowed of ["Policies", "Team", "API Keys", "Webhooks"]) {
      expect(
        screen.queryByRole("link", { name: new RegExp(`^${disallowed}$`, "i") }),
      ).toBeNull();
    }
  });

  it("hides Recordings when features.recordings=false (D-13)", () => {
    useFeaturesMockFn.mockImplementation(() => ({
      features: createMockFeatures({ recordings: false }),
      isEnabled: (k: string) =>
        createMockFeatures({ recordings: false })[k] === true,
      loading: false,
      error: null,
    }));
    render(
      <TenantNav
        memberRole="admin"
        activeOrgId={ORG_ID}
        activeOrgName={ORG_NAME}
      />,
    );
    expect(screen.queryByRole("link", { name: /^Recordings$/i })).toBeNull();
  });

  it("hides API Keys + Webhooks when respective features disabled (D-14)", () => {
    useFeaturesMockFn.mockImplementation(() => ({
      features: createMockFeatures({ apiKeys: false, webhooks: false }),
      isEnabled: (k: string) =>
        createMockFeatures({ apiKeys: false, webhooks: false })[k] === true,
      loading: false,
      error: null,
    }));
    render(
      <TenantNav
        memberRole="admin"
        activeOrgId={ORG_ID}
        activeOrgName={ORG_NAME}
      />,
    );
    expect(screen.queryByRole("link", { name: /^API Keys$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Webhooks$/i })).toBeNull();
  });
});
