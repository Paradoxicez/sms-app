/**
 * VALIDATION: Phase 17 — supporting (feature gate on [id] route)
 * Status: scaffolded with it.todo — plan 17-04 fills this in.
 */
import { describe, it, vi, beforeEach } from "vitest";
import {
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
  useParams: () => ({ id: "rec-1" }),
  usePathname: () => "/app/recordings/rec-1",
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

describe("PlaybackPage feature gate (Phase 17)", () => {
  beforeEach(() => {
    resetUseFeaturesMock();
  });

  it.todo("renders FeatureGateEmptyState when features.recordings=false");
  it.todo("renders the playback page when features.recordings=true");
});
