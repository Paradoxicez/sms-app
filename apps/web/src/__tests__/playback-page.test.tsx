/**
 * VALIDATION: Phase 17 — REC-01, REC-02, supporting (date-change, error states)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  createMockFeatures,
  useFeaturesMockFn,
  resetUseFeaturesMock,
} from "@/test-utils/mock-use-features";
import { mockAuthClient } from "@/test-utils/mock-auth-client";

const pushMock = vi.fn();
const backMock = vi.fn();

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
  useRouter: () => ({ push: pushMock, back: backMock, replace: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

// Capture HlsPlayer + TimelineBar props
let capturedHlsSrc = "";
let capturedTimelineProps: any = null;
vi.mock("@/components/recordings/hls-player", () => ({
  HlsPlayer: (props: any) => {
    capturedHlsSrc = props.src;
    return <div data-testid="hls-player" data-src={props.src} />;
  },
}));
vi.mock("@/components/recordings/timeline-bar", () => ({
  TimelineBar: (props: any) => {
    capturedTimelineProps = props;
    return (
      <button
        data-testid="timeline-bar"
        onClick={() => props.onSeek(8)}
        onKeyDown={(e) => {
          if (e.key === "Empty") props.onSeek(15); // helper
        }}
      />
    );
  },
}));

import { apiFetch } from "@/lib/api";
import PlaybackPage from "@/app/app/recordings/[id]/page";

const baseRecording = {
  id: "rec-1",
  cameraId: "cam-1",
  status: "complete",
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

function setApiFetchSequence(handler: (url: string) => any) {
  (apiFetch as any).mockImplementation((url: string) =>
    Promise.resolve(handler(url)),
  );
}

describe("PlaybackPage (Phase 17)", () => {
  beforeEach(() => {
    resetUseFeaturesMock();
    useFeaturesMockFn.mockImplementation(() => ({
      features: createMockFeatures({ recordings: true }),
      isEnabled: (k: string) =>
        createMockFeatures({ recordings: true })[k] === true,
      loading: false,
      error: null,
    }));
    pushMock.mockClear();
    backMock.mockClear();
    capturedHlsSrc = "";
    capturedTimelineProps = null;
    (apiFetch as any).mockReset();
  });

  it("REC-01: mounts HlsPlayer with src=/api/recordings/:id/manifest when recording loads", async () => {
    setApiFetchSequence((url) => {
      if (
        url.startsWith("/api/recordings/rec-1") &&
        !url.includes("/timeline") &&
        !url.includes("/calendar") &&
        !url.includes("?date=")
      ) {
        return baseRecording;
      }
      if (url.includes("/timeline")) return { hours: [] };
      if (url.includes("/calendar")) return { days: [] };
      return [baseRecording];
    });

    render(<PlaybackPage />);
    await waitFor(() => {
      expect(screen.getByTestId("hls-player")).toBeInTheDocument();
    });
    expect(capturedHlsSrc).toBe("/api/recordings/rec-1/manifest");
  });

  it("REC-02 click-to-seek: timeline click navigates to recording containing the hour", async () => {
    const otherRec = { ...baseRecording, id: "rec-2" };
    setApiFetchSequence((url) => {
      if (
        url.startsWith("/api/recordings/rec-1") &&
        !url.includes("/timeline") &&
        !url.includes("/calendar") &&
        !url.includes("?date=")
      ) {
        return baseRecording;
      }
      if (url.includes("/timeline"))
        return {
          hours: Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            hasData: h === 8,
          })),
        };
      if (url.includes("/calendar")) return { days: [] };
      if (url.includes("?date=")) return [otherRec]; // recordings list for the date contains rec-2 at 08-09
      return [];
    });

    render(<PlaybackPage />);
    await waitFor(() => screen.getByTestId("timeline-bar"));
    await waitFor(() => expect(capturedTimelineProps).not.toBeNull());

    capturedTimelineProps.onSeek(8);
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/app/recordings/rec-2");
    });
  });

  it("REC-02 empty hour no-op: timeline click on hour with no recording does NOT call router.push", async () => {
    setApiFetchSequence((url) => {
      if (
        url.startsWith("/api/recordings/rec-1") &&
        !url.includes("/timeline") &&
        !url.includes("/calendar") &&
        !url.includes("?date=")
      ) {
        return baseRecording;
      }
      if (url.includes("/timeline"))
        return {
          hours: Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            hasData: false,
          })),
        };
      if (url.includes("/calendar")) return { days: [] };
      if (url.includes("?date=")) return []; // no recordings on the date
      return [];
    });

    render(<PlaybackPage />);
    await waitFor(() => expect(capturedTimelineProps).not.toBeNull());

    pushMock.mockClear();
    capturedTimelineProps.onSeek(15);
    // give the effect a tick
    await new Promise((r) => setTimeout(r, 10));
    // No navigation should occur — neither from the empty-hour click nor from the date-change effect
    // (recordings list is empty, so the date-change effect never finds a target).
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("date-change navigation: picking a new date navigates to first recording on that date", async () => {
    const otherRec = {
      ...baseRecording,
      id: "rec-other",
      startedAt: "2026-04-19T10:00:00.000Z",
    };
    // Two phases of apiFetch: first returns rec-1 + empty timeline/list for 2026-04-18
    // Then once selectedDate flips to 2026-04-19 we return [otherRec] for the date list
    setApiFetchSequence((url) => {
      if (
        url.startsWith("/api/recordings/rec-1") &&
        !url.includes("/timeline") &&
        !url.includes("/calendar") &&
        !url.includes("?date=")
      ) {
        return baseRecording;
      }
      if (url.includes("/timeline")) return { hours: [] };
      if (url.includes("/calendar")) return { days: [] };
      if (url.includes("?date=2026-04-19")) return [otherRec];
      if (url.includes("?date=2026-04-18")) return [baseRecording];
      return [];
    });

    const { container } = render(<PlaybackPage />);
    await waitFor(() => screen.getByTestId("timeline-bar"));

    // Simulate the header's onDateChange by finding the Next-day button and clicking it
    const nextBtn = container.querySelector(
      'button[aria-label="Next day"]',
    ) as HTMLButtonElement;
    expect(nextBtn).toBeTruthy();
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/app/recordings/rec-other");
    });
  });

  it("error states: 404 renders 'Recording not available'", async () => {
    (apiFetch as any).mockImplementation(() =>
      Promise.reject(new Error("API request failed: 404")),
    );
    render(<PlaybackPage />);
    expect(
      await screen.findByText(/Recording not available/i),
    ).toBeInTheDocument();
  });

  it("error states: forbidden renders FeatureGateEmptyState", async () => {
    (apiFetch as any).mockImplementation(() =>
      Promise.reject(new Error("API request failed: 403")),
    );
    render(<PlaybackPage />);
    expect(
      await screen.findByText(/Recordings are not included in your plan/i),
    ).toBeInTheDocument();
  });

  it("error states: network error renders Retry CTA", async () => {
    (apiFetch as any).mockImplementation(() =>
      Promise.reject(new Error("Network failure")),
    );
    render(<PlaybackPage />);
    expect(await screen.findByText(/Retry/i)).toBeInTheDocument();
  });
});
