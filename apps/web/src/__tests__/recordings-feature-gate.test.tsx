/**
 * VALIDATION: TBD-11 — UAT-8 recordings feature-gate empty state
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  createMockFeatures,
  useFeaturesMockFn,
  resetUseFeaturesMock,
} from "@/test-utils/mock-use-features";
import { mockAuthClient } from "@/test-utils/mock-auth-client";

vi.mock("@/hooks/use-features", () => ({
  useFeatures: (orgId: string | null | undefined) => useFeaturesMockFn(orgId),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: mockAuthClient,
  useSession: () => ({
    data: {
      user: { id: "u1", role: "user" },
      session: { activeOrganizationId: "org-test-1" },
    },
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/recordings",
  useRouter: () => ({ push: vi.fn() }),
}));

// Expected RED: @/app/app/recordings/page does not exist yet.
import RecordingsPage from "@/app/app/recordings/page";

describe("Recordings feature gate (UAT-8)", () => {
  beforeEach(() => {
    resetUseFeaturesMock();
  });

  it("renders empty state 'Recordings are not included in your plan' when features.recordings=false", async () => {
    useFeaturesMockFn.mockImplementation(() => ({
      features: createMockFeatures({ recordings: false }),
      isEnabled: (k: string) => createMockFeatures({ recordings: false })[k] === true,
      loading: false,
      error: null,
    }));

    render(<RecordingsPage />);
    expect(
      await screen.findByText(/Recordings are not included in your plan/i),
    ).toBeInTheDocument();
  });

  it("renders the recordings page content when features.recordings=true", async () => {
    useFeaturesMockFn.mockImplementation(() => ({
      features: createMockFeatures({ recordings: true }),
      isEnabled: (k: string) => createMockFeatures({ recordings: true })[k] === true,
      loading: false,
      error: null,
    }));

    render(<RecordingsPage />);
    // Heading or landmark for recordings content — assert absence of the gate copy.
    expect(
      screen.queryByText(/Recordings are not included in your plan/i),
    ).toBeNull();
  });
});
