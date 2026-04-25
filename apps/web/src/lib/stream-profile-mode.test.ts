import { describe, it, expect } from "vitest"

import {
  getStreamProfileModeName,
  STREAM_PROFILE_MODE_BADGE,
} from "./stream-profile-mode"

describe("stream-profile-mode util (quick 260425-uw0)", () => {
  describe("getStreamProfileModeName", () => {
    it("returns 'Passthrough' for codec 'copy'", () => {
      expect(getStreamProfileModeName("copy")).toBe("Passthrough")
    })

    it("returns 'Transcode' for codec 'libx264'", () => {
      expect(getStreamProfileModeName("libx264")).toBe("Transcode")
    })

    it("returns 'Auto' for any other codec value (e.g. h264_nvenc)", () => {
      expect(getStreamProfileModeName("h264_nvenc")).toBe("Auto")
    })

    it("returns 'Auto' for empty string", () => {
      expect(getStreamProfileModeName("")).toBe("Auto")
    })
  })

  describe("STREAM_PROFILE_MODE_BADGE", () => {
    it("Passthrough token matches the Stream Profiles page green tokens", () => {
      expect(STREAM_PROFILE_MODE_BADGE.Passthrough).toBe(
        "bg-green-100 text-green-700",
      )
    })

    it("Transcode token matches the Stream Profiles page amber tokens", () => {
      expect(STREAM_PROFILE_MODE_BADGE.Transcode).toBe(
        "bg-amber-100 text-amber-700",
      )
    })

    it("Auto token matches the Stream Profiles page neutral tokens", () => {
      expect(STREAM_PROFILE_MODE_BADGE.Auto).toBe(
        "bg-neutral-100 text-neutral-700",
      )
    })
  })
})
