/**
 * Stream profile mode badge tokens — single source of truth.
 *
 * Used by both the Stream Profiles table (Mode column) and the Cameras
 * table (Stream Profile column). Token strings are intentionally
 * duplicated nowhere else — if you find yourself writing
 * `bg-green-100 text-green-700` in another file, import this instead.
 */
export type StreamProfileModeName = "Passthrough" | "Transcode" | "Auto"

export function getStreamProfileModeName(codec: string): StreamProfileModeName {
  if (codec === "copy") return "Passthrough"
  if (codec === "libx264") return "Transcode"
  return "Auto"
}

export const STREAM_PROFILE_MODE_BADGE: Record<StreamProfileModeName, string> =
  {
    Passthrough: "bg-green-100 text-green-700",
    Transcode: "bg-amber-100 text-amber-700",
    Auto: "bg-neutral-100 text-neutral-700",
  }
