/**
 * D-07: CodecInfo tagged-union type (duplicated from apps/api/src/cameras/types/codec-info.ts
 * to avoid zod 3/4 shared-package risk per RESEARCH Pitfall 4).
 */
export type CodecInfoStatus = "pending" | "failed" | "success"
export type ProbeSource = "ffprobe" | "srs-api"

export interface CodecInfoVideo {
  codec: string
  width: number
  height: number
  fps?: number
  profile?: string
  level?: string
}

export interface CodecInfoAudio {
  codec: string
  sampleRate?: number
  channels?: number
}

export interface CodecInfo {
  status: CodecInfoStatus
  video?: CodecInfoVideo
  audio?: CodecInfoAudio
  error?: string
  probedAt: string
  source: ProbeSource
}

/**
 * Legacy-tolerant reader. Handles three in-the-wild pre-Phase-19 shapes:
 *   - {}                                                    → null (never probed)
 *   - { error, probedAt }                                   → { status: 'failed', ... }
 *   - { codec, width, height, fps, audioCodec, probedAt }   → { status: 'success', video, audio }
 * Returns null for null/undefined/malformed. Next probe self-heals to the new shape.
 */
export function normalizeCodecInfo(raw: unknown): CodecInfo | null {
  if (raw == null) return null
  if (typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>

  // Empty object — never probed
  if (Object.keys(obj).length === 0) return null

  // New shape — has explicit status
  if (typeof obj.status === "string") {
    if (!["pending", "failed", "success"].includes(obj.status)) return null
    if (typeof obj.probedAt !== "string") return null
    return {
      status: obj.status as CodecInfoStatus,
      video: obj.video as CodecInfoVideo | undefined,
      audio: obj.audio as CodecInfoAudio | undefined,
      error: typeof obj.error === "string" ? obj.error : undefined,
      probedAt: obj.probedAt,
      source: (obj.source as ProbeSource) ?? "ffprobe",
    }
  }

  // Legacy: { error, probedAt } — failure blob
  if (typeof obj.error === "string" && typeof obj.probedAt === "string") {
    return {
      status: "failed",
      error: obj.error,
      probedAt: obj.probedAt,
      source: "ffprobe",
    }
  }

  // Legacy: { codec, width, height, fps?, audioCodec?, probedAt } — success blob
  if (
    typeof obj.codec === "string" &&
    typeof obj.width === "number" &&
    typeof obj.height === "number" &&
    typeof obj.probedAt === "string"
  ) {
    const video: CodecInfoVideo = {
      codec: String(obj.codec),
      width: Number(obj.width),
      height: Number(obj.height),
    }
    if (typeof obj.fps === "number") video.fps = obj.fps
    const audio: CodecInfoAudio | undefined =
      typeof obj.audioCodec === "string"
        ? { codec: String(obj.audioCodec) }
        : undefined
    return {
      status: "success",
      video,
      audio,
      probedAt: obj.probedAt,
      source: "ffprobe",
    }
  }

  // Unrecognized shape — fail-safe to null so UI renders em-dash, not crash
  return null
}
