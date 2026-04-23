import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { ViewStreamSheet } from "../view-stream-sheet"
import type { CameraRow } from "../cameras-columns"

// Mock sonner (side-effect).
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock the HLS player — hls.js needs a real <video> DOM + MSE, not available in
// jsdom. We don't care about player rendering for these composition tests.
vi.mock("@/components/recordings/hls-player", () => ({
  HlsPlayer: () => <div data-testid="hls-player" />,
}))

// Mock the resolved-policy card — it otherwise fires apiFetch on mount.
vi.mock("@/app/admin/policies/components/resolved-policy-card", () => ({
  ResolvedPolicyCard: () => <div data-testid="resolved-policy-card" />,
}))

// Mock the audit-log data table — it renders a network-backed table.
vi.mock("@/components/audit/audit-log-data-table", () => ({
  AuditLogDataTable: () => <div data-testid="audit-log-data-table" />,
}))

// Mock each push composite so we can assert composition without pulling their
// internal render details into the composition test.
vi.mock("../push-url-section", () => ({
  PushUrlSection: () => <div data-testid="push-url-section" />,
}))
vi.mock("../codec-mismatch-banner", () => ({
  CodecMismatchBanner: ({
    camera,
  }: {
    camera: { codecInfo?: { status?: string } }
  }) =>
    camera?.codecInfo?.status === "mismatch" ? (
      <div data-testid="codec-mismatch-banner" />
    ) : null,
}))
vi.mock("../waiting-for-first-publish", () => ({
  WaitingForFirstPublish: ({
    camera,
  }: {
    camera: { firstPublishAt: string | null; status: string }
  }) =>
    camera?.firstPublishAt == null && camera?.status !== "online" ? (
      <div data-testid="waiting-for-first-publish" />
    ) : null,
}))

const basePull: CameraRow = {
  id: "c1",
  name: "Pull Cam",
  status: "online",
  isRecording: false,
  maintenanceMode: false,
  streamUrl: "rtsp://h/a",
  ingestMode: "pull",
  streamKey: null,
  firstPublishAt: null,
  codecInfo: null,
  createdAt: new Date().toISOString(),
}

const basePush: CameraRow = {
  id: "c2",
  name: "Push Cam",
  status: "offline",
  isRecording: false,
  maintenanceMode: false,
  streamUrl: "rtmp://h:1935/push/KEY1234567890123456789",
  ingestMode: "push",
  streamKey: "KEY1234567890123456789",
  firstPublishAt: null,
  codecInfo: null,
  createdAt: new Date().toISOString(),
}

describe("ViewStreamSheet push composition (D-07, D-16, D-26)", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("does not render push composites for pull cameras", () => {
    render(
      <ViewStreamSheet
        open
        camera={basePull}
        onOpenChange={() => {}}
      />,
    )
    expect(screen.queryByTestId("push-url-section")).toBeNull()
    expect(screen.queryByTestId("waiting-for-first-publish")).toBeNull()
    expect(screen.queryByTestId("codec-mismatch-banner")).toBeNull()
  })

  it("renders PushUrlSection for push cameras", () => {
    render(
      <ViewStreamSheet
        open
        camera={basePush}
        onOpenChange={() => {}}
      />,
    )
    expect(screen.getByTestId("push-url-section")).toBeTruthy()
  })

  it("renders WaitingForFirstPublish when firstPublishAt is null and status is not online", () => {
    render(
      <ViewStreamSheet
        open
        camera={basePush}
        onOpenChange={() => {}}
      />,
    )
    expect(screen.getByTestId("waiting-for-first-publish")).toBeTruthy()
  })

  it("hides WaitingForFirstPublish when firstPublishAt is set (even for push)", () => {
    const camera: CameraRow = {
      ...basePush,
      firstPublishAt: new Date().toISOString(),
      status: "online",
    }
    render(
      <ViewStreamSheet open camera={camera} onOpenChange={() => {}} />,
    )
    expect(screen.queryByTestId("waiting-for-first-publish")).toBeNull()
  })

  it("renders CodecMismatchBanner when codecInfo.status === 'mismatch'", () => {
    const camera: CameraRow = {
      ...basePush,
      codecInfo: {
        status: "mismatch",
        mismatchCodec: "H.265",
        probedAt: "2026-01-01T00:00:00Z",
        source: "srs-api",
      },
    }
    render(
      <ViewStreamSheet open camera={camera} onOpenChange={() => {}} />,
    )
    expect(screen.getByTestId("codec-mismatch-banner")).toBeTruthy()
  })
})

// Small second describe to exercise the Accept auto-transcode handler without
// the mismatch-banner mock — we reach into the real banner's click surface.
describe("ViewStreamSheet auto-transcode accept (D-16)", () => {
  beforeEach(() => {
    vi.resetModules()
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("Accept click on CodecMismatchBanner PATCHes needsTranscode=true and toasts success", async () => {
    vi.doUnmock("../codec-mismatch-banner")
    // Re-import with the real banner. The other mocks (hls-player, policy card,
    // audit log, push-url-section, waiting-for-first-publish) remain mocked so
    // we stay focused on the accept-flow wiring.
    const { ViewStreamSheet: RealSheet } = await import("../view-stream-sheet")
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "c2", needsTranscode: true }),
    })
    const { toast } = await import("sonner")

    const camera: CameraRow = {
      ...basePush,
      codecInfo: {
        status: "mismatch",
        mismatchCodec: "H.265",
        probedAt: "2026-01-01T00:00:00Z",
        source: "srs-api",
      },
    }
    render(
      <RealSheet open camera={camera} onOpenChange={() => {}} />,
    )
    fireEvent.click(screen.getByText("Enable auto-transcode"))
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/cameras/c2",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ needsTranscode: true }),
        }),
      ),
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Auto-transcode enabled. Retry publish from your camera.",
      ),
    )
  })
})
