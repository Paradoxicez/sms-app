import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { CodecStatusCell } from "../codec-status-cell"

const hookState = {
  retry: vi.fn(),
  isRetrying: false,
}

vi.mock("@/hooks/use-probe-retry", () => ({
  useProbeRetry: () => ({
    retry: hookState.retry,
    isRetrying: hookState.isRetrying,
  }),
}))

beforeEach(() => {
  hookState.retry = vi.fn().mockResolvedValue(undefined)
  hookState.isRetrying = false
})

describe("CodecStatusCell — Phase 19 (D-05, D-06, D-07)", () => {
  it('renders Loader2 spinner with aria-label "Probing codec…" when status is "pending"', () => {
    render(
      <CodecStatusCell
        codecInfo={{
          status: "pending",
          probedAt: "2026-04-22T00:00:00Z",
          source: "ffprobe",
        }}
        cameraId="c1"
        cameraName="Cam1"
      />
    )
    expect(
      screen.getByRole("status", { name: /Probing codec for camera Cam1/i })
    ).toBeInTheDocument()
  })

  it('renders AlertTriangle amber + inline RotateCw retry button when status is "failed"', () => {
    render(
      <CodecStatusCell
        codecInfo={{
          status: "failed",
          error: "Connection refused",
          probedAt: "2026-04-22T00:00:00Z",
          source: "ffprobe",
        }}
        cameraId="c1"
        cameraName="Cam1"
      />
    )
    expect(
      screen.getByRole("button", { name: /Retry probe for Cam1/i })
    ).toBeInTheDocument()
  })

  it('renders "H.264" text (codec only) when status is "success" with video.codec', () => {
    render(
      <CodecStatusCell
        codecInfo={{
          status: "success",
          video: { codec: "H.264", width: 1920, height: 1080 },
          probedAt: "2026-04-22T00:00:00Z",
          source: "ffprobe",
        }}
        cameraId="c1"
        cameraName="Cam1"
      />
    )
    expect(screen.getByText("H.264")).toBeInTheDocument()
  })

  it('renders em-dash "—" when codecInfo is null', () => {
    render(
      <CodecStatusCell codecInfo={null} cameraId="c1" cameraName="Cam1" />
    )
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("renders success codec text for legacy shape { codec, width, height, probedAt } via normalizeCodecInfo", () => {
    render(
      <CodecStatusCell
        codecInfo={{
          codec: "h264",
          width: 1920,
          height: 1080,
          probedAt: "2026-04-22T00:00:00Z",
        }}
        cameraId="c1"
        cameraName="Cam1"
      />
    )
    expect(screen.getByText("h264")).toBeInTheDocument()
  })

  it("renders amber + retry for legacy shape { error, probedAt }", () => {
    render(
      <CodecStatusCell
        codecInfo={{ error: "Timeout", probedAt: "2026-04-22T00:00:00Z" }}
        cameraId="c1"
        cameraName="Cam1"
      />
    )
    expect(
      screen.getByRole("button", { name: /Retry probe for Cam1/i })
    ).toBeInTheDocument()
  })

  it("retry button click fires retry() from useProbeRetry", async () => {
    render(
      <CodecStatusCell
        codecInfo={{
          status: "failed",
          error: "x",
          probedAt: "2026-04-22T00:00:00Z",
          source: "ffprobe",
        }}
        cameraId="c1"
        cameraName="Cam1"
      />
    )
    fireEvent.click(
      screen.getByRole("button", { name: /Retry probe for Cam1/i })
    )
    await waitFor(() => expect(hookState.retry).toHaveBeenCalled())
  })

  it("retry button disabled + shows Loader2 during in-flight (isRetrying=true)", () => {
    hookState.isRetrying = true
    render(
      <CodecStatusCell
        codecInfo={{
          status: "failed",
          error: "x",
          probedAt: "2026-04-22T00:00:00Z",
          source: "ffprobe",
        }}
        cameraId="c1"
        cameraName="Cam1"
      />
    )
    const btn = screen.getByRole("button", { name: /Retry probe for Cam1/i })
    expect(btn).toBeDisabled()
  })

  it('exposes "Probe failed: {reason}" via aria-label when status failed and error set', () => {
    render(
      <CodecStatusCell
        codecInfo={{
          status: "failed",
          error: "Connection refused",
          probedAt: "2026-04-22T00:00:00Z",
          source: "ffprobe",
        }}
        cameraId="c1"
        cameraName="Cam1"
      />
    )
    const status = screen.getByRole("status")
    expect(status.getAttribute("aria-label")).toBe(
      "Probe failed for Cam1: Connection refused"
    )
  })

  it('falls back to "Probe failed" when error is missing', () => {
    render(
      <CodecStatusCell
        codecInfo={{
          status: "failed",
          probedAt: "2026-04-22T00:00:00Z",
          source: "ffprobe",
        }}
        cameraId="c1"
        cameraName="Cam1"
      />
    )
    const status = screen.getByRole("status")
    expect(status.getAttribute("aria-label")).toBe("Probe failed for Cam1")
  })

  it("respects motion-safe: spinner uses motion-safe:animate-spin class", () => {
    render(
      <CodecStatusCell
        codecInfo={{
          status: "pending",
          probedAt: "2026-04-22T00:00:00Z",
          source: "ffprobe",
        }}
        cameraId="c1"
        cameraName="Cam1"
      />
    )
    const spinner = screen.getByRole("status").querySelector("svg")
    expect(spinner?.getAttribute("class") ?? "").toContain(
      "motion-safe:animate-spin"
    )
  })
})
