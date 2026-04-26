/**
 * VALIDATION: Phase 17 — REC-01, REC-02, supporting (date-change, error states)
 *
 * Timezone note: post-fix (debug session
 * `recordings-detail-timeline-timezone-mismatch.md`) the timeline buckets
 * recordings by *local* hour and the hooks send `startUtc`/`endUtc` (no
 * longer `date=YYYY-MM-DD`). Test fixtures use local-midnight-anchored
 * timestamps so the assertions hold regardless of the host TZ — we read
 * the recording's local hour at suite setup and feed that hour to the
 * timeline-click simulation.
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

// Local hour the test recording starts at — depends on host TZ.
// Pre-fix the timeline used getUTCHours() which gave a fixed 8; post-fix
// we read getHours() (local), so a Bangkok-local CI gives 15 and a UTC
// CI gives 8. Compute it once so the click-to-seek test is portable.
const baseRecLocalStartHour = new Date(baseRecording.startedAt).getHours();

// Detector for the per-day "list recordings" call. Pre-fix this was
// `?date=YYYY-MM-DD`; post-fix the hook sends `?startUtc=...&endUtc=...`.
function isListUrl(url: string): boolean {
  return (
    url.startsWith("/api/recordings/camera/") &&
    !url.includes("/timeline") &&
    !url.includes("/calendar") &&
    !url.includes("/schedules") &&
    !url.includes("/retention") &&
    url.includes("startUtc=")
  );
}

// Extract the local-day key (YYYY-MM-DD) from a list URL by parsing the
// startUtc and converting it to a local Date. The hook sends the local-
// midnight as UTC, so converting back via `new Date(startUtc)` yields
// midnight in the host's timezone — `.getDate()` therefore returns the
// day the user picked in their browser.
function localDayKeyFromListUrl(url: string): string | null {
  const m = url.match(/startUtc=([^&]+)/);
  if (!m) return null;
  const d = new Date(decodeURIComponent(m[1]));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
      if (url === "/api/recordings/rec-1") return baseRecording;
      if (url.includes("/timeline")) return { hours: [] };
      if (url.includes("/calendar")) return { days: [] };
      if (isListUrl(url)) return [baseRecording];
      return [];
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
      if (url === "/api/recordings/rec-1") return baseRecording;
      if (url.includes("/timeline"))
        return {
          hours: Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            // The seeded recording occupies its local-start hour. Mark that
            // bucket so the click test exercises a populated hour regardless
            // of host TZ.
            hasData: h === baseRecLocalStartHour,
          })),
        };
      if (url.includes("/calendar")) return { days: [] };
      if (isListUrl(url)) return [otherRec];
      return [];
    });

    render(<PlaybackPage />);
    await waitFor(() => screen.getByTestId("timeline-bar"));
    await waitFor(() => expect(capturedTimelineProps).not.toBeNull());

    capturedTimelineProps.onSeek(baseRecLocalStartHour);
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/app/recordings/rec-2");
    });
  });

  it("REC-02 empty hour no-op: timeline click on hour with no recording does NOT call router.push", async () => {
    setApiFetchSequence((url) => {
      if (url === "/api/recordings/rec-1") return baseRecording;
      if (url.includes("/timeline"))
        return {
          hours: Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            hasData: false,
          })),
        };
      if (url.includes("/calendar")) return { days: [] };
      if (isListUrl(url)) return [];
      return [];
    });

    render(<PlaybackPage />);
    await waitFor(() => expect(capturedTimelineProps).not.toBeNull());

    pushMock.mockClear();
    // Pick an hour that is NOT the recording's local start hour to guarantee
    // the empty-hour code path runs.
    const emptyHour = (baseRecLocalStartHour + 7) % 24;
    capturedTimelineProps.onSeek(emptyHour);
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
    // Two phases of apiFetch: first returns rec-1 + empty timeline/list for the
    // base recording's local day, then once selectedDate flips +1 day we
    // return [otherRec] for the new local day. The discriminator is the
    // local-day key parsed out of `startUtc=`.
    const baseLocalDayKey = (() => {
      const d = new Date(baseRecording.startedAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const nextDay = (() => {
      const d = new Date(baseRecording.startedAt);
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

    setApiFetchSequence((url) => {
      if (url === "/api/recordings/rec-1") return baseRecording;
      if (url.includes("/timeline")) return { hours: [] };
      if (url.includes("/calendar")) return { days: [] };
      if (isListUrl(url)) {
        const dayKey = localDayKeyFromListUrl(url);
        if (dayKey === nextDay) return [otherRec];
        if (dayKey === baseLocalDayKey) return [baseRecording];
      }
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
