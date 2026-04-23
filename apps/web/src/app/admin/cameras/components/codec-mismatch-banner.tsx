"use client"

import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { normalizeCodecInfo } from "@/lib/codec-info"

interface CodecMismatchBannerProps {
  camera: { id: string; codecInfo?: unknown }
  onAccept: () => void | Promise<void>
  onDismiss: () => void
}

/**
 * Phase 19.1 D-16 — amber banner rendered above the HLS player when the probe
 * detected a codec mismatch (camera pushing non-H.264/AAC in passthrough).
 *
 * UI-SPEC copy invariants:
 *   - Heading: "Codec mismatch"
 *   - Body: "Camera is sending {codec}. Your Stream Profile is Passthrough
 *           (requires H.264/AAC). Switch to auto-transcode? This adds CPU,
 *           latency, and bandwidth overhead."
 *   - Primary CTA: "Enable auto-transcode"
 *   - Secondary CTA: "Dismiss"
 *
 * {codec} fallback ladder: info.mismatchCodec ?? info.video?.codec ??
 *   "an unsupported codec". Keeps the sentence grammatical even if the probe
 *   did not identify the offending codec by name.
 *
 * Renders nothing when codecInfo.status !== 'mismatch' — safe to mount
 * unconditionally, composition order in the parent is preserved.
 */
export function CodecMismatchBanner({
  camera,
  onAccept,
  onDismiss,
}: CodecMismatchBannerProps) {
  const info = normalizeCodecInfo(camera.codecInfo)
  if (!info || info.status !== "mismatch") return null

  const codec =
    info.mismatchCodec ?? info.video?.codec ?? "an unsupported codec"

  return (
    <div
      role="alert"
      className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="size-5 text-amber-700 dark:text-amber-400 mt-0.5"
          aria-hidden="true"
        />
        <div className="flex-1 space-y-2">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Codec mismatch
          </h3>
          <p className="text-sm text-foreground">
            Camera is sending {codec}. Your Stream Profile is Passthrough
            (requires H.264/AAC). Switch to auto-transcode? This adds CPU,
            latency, and bandwidth overhead.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={() => onAccept()}>Enable auto-transcode</Button>
            <Button variant="outline" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
