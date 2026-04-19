/**
 * VALIDATION: Phase 17 — REC-01, REC-02, supporting (date-change, error states)
 * Status: scaffolded with it.todo — implementation plans 17-02 and 17-04 fill these in.
 */
import { describe, it, vi, beforeEach } from "vitest";
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
  useParams: () => ({ id: "rec-1" }),
  usePathname: () => "/app/recordings/rec-1",
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

describe("PlaybackPage (Phase 17)", () => {
  beforeEach(() => {
    resetUseFeaturesMock();
    useFeaturesMockFn.mockImplementation(() => ({
      features: createMockFeatures({ recordings: true }),
      isEnabled: (k: string) =>
        createMockFeatures({ recordings: true })[k as keyof ReturnType<typeof createMockFeatures>] === true,
      loading: false,
      error: null,
    }));
  });

  it.todo("REC-01: mounts HlsPlayer with src=/api/recordings/:id/manifest when recording loads");
  it.todo("REC-02 click-to-seek: timeline click navigates to recording containing the hour");
  it.todo("REC-02 empty hour no-op: timeline click on hour with no recording does NOT call router.push");
  it.todo("date-change navigation: picking a new date navigates to first recording on that date");
  it.todo("error states: 404 renders 'Recording not available'");
  it.todo("error states: forbidden renders FeatureGateEmptyState");
  it.todo("error states: network error renders Retry CTA");
});
