"use client"

import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { deriveRecommendTranscode } from "@/lib/codec-info"

interface StreamWarningBannerProps {
  camera: {
    id: string
    needsTranscode?: boolean
    streamWarnings?: string[]
    brandHint?: string | null
    brandConfidence?: string | null
  }
  /**
   * Optional — populated only if a future API surfaces ProbeResult.brandEvidence.
   * Tier 1 does NOT persist this column; the banner falls back to streamWarnings
   * chips alone if absent.
   */
  brandEvidence?: string[]
  onAccept: () => void | Promise<void>
  onDismiss: () => void
}

/**
 * Quick task 260501-1n1 — soft warning banner displayed in the camera detail
 * sheet's Preview tab when the smart probe detects characteristics that
 * historically break HLS playback (Uniview/Hikvision/Dahua firmware quirks,
 * VFR streams, H.265 source).
 *
 * Renders ABOVE the existing CodecMismatchBanner — both can render
 * simultaneously when both apply (e.g. an H.265 Uniview camera).
 *
 * Surfaces the saensuk-139 user workaround (manually switching to Transcode
 * profile) AT probe time. NEVER auto-forces transcode (false-positive risk
 * preserved per memory `[feedback_ui_pro_minimal]` — single primary CTA,
 * user-driven).
 *
 * Title priority (matches PLAN.md <behavior>):
 *   1. Risk-tier brand (uniview/hikvision/dahua) at medium+ confidence
 *   2. VFR detected
 *   3. Generic "may need transcode profile" fallback
 *
 * Renders nothing when `deriveRecommendTranscode(camera) === false` — safe to
 * mount unconditionally so the parent's composition order stays stable.
 */
function brandLabel(brand?: string | null): string | null {
  switch (brand) {
    case "uniview":
      return "Uniview"
    case "hikvision":
      return "Hikvision"
    case "dahua":
      return "Dahua"
    case "axis":
      return "Axis"
    case "generic-onvif":
      return "Generic ONVIF"
    default:
      return null
  }
}

export function StreamWarningBanner({
  camera,
  brandEvidence,
  onAccept,
  onDismiss,
}: StreamWarningBannerProps) {
  if (!deriveRecommendTranscode(camera)) return null

  const warnings = camera.streamWarnings ?? []
  const brand = brandLabel(camera.brandHint)
  const goodConfidence =
    camera.brandConfidence === "medium" || camera.brandConfidence === "high"
  const isRiskBrand =
    camera.brandHint === "uniview" ||
    camera.brandHint === "hikvision" ||
    camera.brandHint === "dahua"

  // Title priority — brand-specific (medium+ conf, risk tier) > VFR > generic
  let title = "Stream may need transcode profile"
  let body =
    "Probe detected characteristics that historically break HLS playback. Switching to the Transcode profile is recommended."
  if (brand && isRiskBrand && goodConfidence) {
    title = `${brand} camera detected — transcode profile recommended`
    body = `${brand} firmware has known issues that can break HLS preview (PTS skew, smart-codec quirks). Switching to the Transcode profile re-encodes the stream and bypasses these issues.`
  } else if (warnings.includes("vfr-detected")) {
    title = "Variable frame rate detected — transcode profile recommended"
    body =
      "The camera advertises one frame rate but delivers another. Variable frame rate streams can break HLS playback. Switching to the Transcode profile re-encodes to a constant frame rate."
  }

  const hasChips = (brandEvidence?.length ?? 0) > 0 || warnings.length > 0

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
            {title}
          </h3>
          <p className="text-sm text-foreground">{body}</p>
          {hasChips ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {warnings.map((w) => (
                <Badge key={`w-${w}`} variant="outline" className="text-xs">
                  {w}
                </Badge>
              ))}
              {(brandEvidence ?? []).map((e) => (
                <Badge key={`e-${e}`} variant="outline" className="text-xs">
                  {e}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={() => onAccept()}>
              Switch to Transcode Profile
            </Button>
            <Button variant="outline" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
