import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { CodecStatusCell } from "../codec-status-cell"

describe("CodecStatusCell mismatch state (D-16)", () => {
  it("renders amber AlertTriangle with 'Codec mismatch' tooltip when status=mismatch", () => {
    render(
      <CodecStatusCell
        codecInfo={{
          status: "mismatch",
          mismatchCodec: "H.265",
          probedAt: new Date().toISOString(),
          source: "srs-api",
        }}
        cameraName="cam-1"
        cameraId="c1"
      />,
    )
    const status = screen.getByRole("status")
    expect(status.getAttribute("aria-label")).toMatch(/Codec mismatch for cam-1/)
    expect(status.getAttribute("aria-label")).toMatch(/H\.265/)
  })

  it("falls back to video.codec when mismatchCodec is absent", () => {
    render(
      <CodecStatusCell
        codecInfo={{
          status: "mismatch",
          video: { codec: "HEVC", width: 1920, height: 1080 },
          probedAt: new Date().toISOString(),
          source: "srs-api",
        }}
        cameraName="cam-2"
        cameraId="c2"
      />,
    )
    expect(screen.getByRole("status").getAttribute("aria-label")).toMatch(
      /HEVC/,
    )
  })

  it("does not render retry button (mismatch has no retry — user must open detail sheet)", () => {
    render(
      <CodecStatusCell
        codecInfo={{
          status: "mismatch",
          mismatchCodec: "H.265",
          probedAt: new Date().toISOString(),
          source: "srs-api",
        }}
        cameraName="cam-3"
        cameraId="c3"
      />,
    )
    expect(screen.queryByRole("button")).toBeNull()
  })
})
