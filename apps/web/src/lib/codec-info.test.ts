import { describe, it, expect } from "vitest"
import { normalizeCodecInfo } from "./codec-info"

describe("normalizeCodecInfo — Phase 19 (D-07 legacy migration)", () => {
  it("null/undefined input returns null (render em-dash)", () => {
    expect(normalizeCodecInfo(null)).toBeNull()
    expect(normalizeCodecInfo(undefined)).toBeNull()
  })

  it("empty object {} returns null (never probed)", () => {
    expect(normalizeCodecInfo({})).toBeNull()
  })

  it('legacy { error, probedAt } becomes { status: "failed", error, probedAt, source: "ffprobe" }', () => {
    const out = normalizeCodecInfo({
      error: "Connection refused",
      probedAt: "2026-04-22T00:00:00Z",
    })
    expect(out).toEqual({
      status: "failed",
      error: "Connection refused",
      probedAt: "2026-04-22T00:00:00Z",
      source: "ffprobe",
    })
  })

  it('legacy { codec, width, height, fps, audioCodec, probedAt } becomes { status: "success", video: {...}, audio: {...} }', () => {
    const out = normalizeCodecInfo({
      codec: "h264",
      width: 1920,
      height: 1080,
      fps: 30,
      audioCodec: "aac",
      probedAt: "2026-04-22T00:00:00Z",
    })
    expect(out?.status).toBe("success")
    expect(out?.video).toEqual({
      codec: "h264",
      width: 1920,
      height: 1080,
      fps: 30,
    })
    expect(out?.audio).toEqual({ codec: "aac" })
    expect(out?.probedAt).toBe("2026-04-22T00:00:00Z")
    expect(out?.source).toBe("ffprobe")
  })

  it('new shape { status: "pending", probedAt, source } returns as-is', () => {
    const input = {
      status: "pending",
      probedAt: "2026-04-22T00:00:00Z",
      source: "ffprobe",
    }
    const out = normalizeCodecInfo(input)
    expect(out?.status).toBe("pending")
    expect(out?.source).toBe("ffprobe")
    expect(out?.probedAt).toBe("2026-04-22T00:00:00Z")
  })

  it('new shape { status: "success", video, audio } returns as-is', () => {
    const input = {
      status: "success" as const,
      video: { codec: "H.264", width: 1920, height: 1080 },
      audio: { codec: "AAC" },
      probedAt: "2026-04-22T00:00:00Z",
      source: "srs-api" as const,
    }
    const out = normalizeCodecInfo(input)
    expect(out).toEqual(input)
  })

  it("malformed input (missing probedAt) returns null (invalid shape)", () => {
    expect(normalizeCodecInfo({ status: "success", video: {} })).toBeNull()
    expect(normalizeCodecInfo({ random: "junk" })).toBeNull()
  })
})
