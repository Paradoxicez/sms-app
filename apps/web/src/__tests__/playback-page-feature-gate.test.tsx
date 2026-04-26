/**
 * VALIDATION: Phase 17 — feature gate on /app/recordings/[id]
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
  useParams: () => ({ id: "rec-1" }),
  usePathname: () => "/app/recordings/rec-1",
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/components/recordings/hls-player", () => ({
  HlsPlayer: (props: any) => <div data-testid="hls-player" data-src={props.src} />,
}));
vi.mock("@/components/recordings/timeline-bar", () => ({
  TimelineBar: () => <div data-testid="timeline-bar" />,
}));

import { apiFetch } from "@/lib/api";
import PlaybackPage from "@/app/app/recordings/[id]/page";

const baseRecording = {
  id: "rec-1",
  cameraId: "cam-1",
  status: "complete" as const,
  startedAt: "2026-04-18T08:00:00.000Z",
  stoppedAt: "2026-04-18T09:00:00.000Z",
  totalSize: 500,
  totalDuration: 3600,
  camera: {
    id: "cam-1",
    name: "Front Door",
    site: { id: "s", name: "HQ", project: { id: "p", name: "Office" } },
  },
  _count: { segments: 30 },
};

describe("PlaybackPage feature gate (Phase 17)", () => {
  beforeEach(() => {
    resetUseFeaturesMock();
    (apiFetch as any).mockReset();
  });

  it("renders FeatureGateEmptyState when features.recordings=false", async () => {
    useFeaturesMockFn.mockImplementation(() => ({
      features: createMockFeatures({ recordings: false }),
      isEnabled: (k: string) =>
        createMockFeatures({ recordings: false })[k] === true,
      loading: false,
      error: null,
    }));
    // Even with recordings disabled, ensure apiFetch never gets called for the [id] route
    (apiFetch as any).mockResolvedValue(null);

    render(<PlaybackPage />);
    expect(
      await screen.findByText(/Recordings are not included in your plan/i),
    ).toBeInTheDocument();
  });

  it("renders the playback page (HlsPlayer mounted) when features.recordings=true", async () => {
    useFeaturesMockFn.mockImplementation(() => ({
      features: createMockFeatures({ recordings: true }),
      isEnabled: (k: string) =>
        createMockFeatures({ recordings: true })[k] === true,
      loading: false,
      error: null,
    }));
    // Mirror playback-page.test.tsx setup: resolve baseRecording for the [id] fetch,
    // empty timeline/calendar/list so the page can render past loading state.
    // Post-fix the per-day list URL uses `startUtc=...` instead of `?date=...`
    // (debug session recordings-detail-timeline-timezone-mismatch.md).
    (apiFetch as any).mockImplementation((url: string) => {
      if (url === "/api/recordings/rec-1") {
        return Promise.resolve(baseRecording);
      }
      if (url.includes("/timeline")) return Promise.resolve({ hours: [] });
      if (url.includes("/calendar")) return Promise.resolve({ days: [] });
      if (
        url.startsWith("/api/recordings/camera/") &&
        url.includes("startUtc=")
      ) {
        return Promise.resolve([baseRecording]);
      }
      return Promise.resolve(null);
    });

    render(<PlaybackPage />);
    // Positive signal #1: feature-gate copy is absent
    expect(
      screen.queryByText(/Recordings are not included in your plan/i),
    ).toBeNull();
    // Positive signal #2: the page actually mounted — HlsPlayer is in the document
    expect(await screen.findByTestId("hls-player")).toBeInTheDocument();
    // Positive signal #3: header rendered the camera name from baseRecording
    expect(await screen.findByText(/Front Door/i)).toBeInTheDocument();
  });
});
