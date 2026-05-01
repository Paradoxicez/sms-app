"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { deriveRecommendTranscode } from "@/lib/codec-info"

interface StreamWarningBannerProps {
  camera: {
    id: string
    needsTranscode?: boolean
    streamWarnings?: string[]
    brandHint?: string | null
    brandConfidence?: string | null
    /** Quick task 260501-tgy — non-passthrough profile suppresses the banner. */
    streamProfile?: { codec?: string } | null
  }
  /**
   * Optional — populated only if a future API surfaces ProbeResult.brandEvidence.
   * Tier 1 does NOT persist this column; the banner falls back to streamWarnings
   * chips alone if absent.
   */
  brandEvidence?: string[]
  /**
   * Quick task 260501-tgy — caller pre-filters to codec !== 'copy'. Empty list
   * triggers the "Create Transcode Profile" CTA branch; non-empty renders a
   * <select> + Switch button.
   */
  transcodeProfiles: { id: string; name: string; codec: string }[]
  /**
   * Quick task 260501-tgy — replaces the old `onAccept` (per-camera flag
   * override). The parent PATCHes `/api/cameras/:id` with `streamProfileId`
   * and lets Phase 21 hot-reload restart the stream automatically.
   * CodecMismatchBanner keeps its own `onAccept` independently.
   */
  onSwitchProfile: (profileId: string) => void | Promise<void>
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
 *
 * Quick task 260501-tgy adds two short-circuits inherited from
 * `deriveRecommendTranscode`: `needsTranscode === true` (already opted in)
 * and `streamProfile.codec` ∉ {undefined, null, 'copy'} (already
 * transcoding) both bail to null. The action row also swaps the misleading
 * "Switch to Transcode Profile" CTA (which PATCHed the per-camera flag) for
 * a profile picker (`<select>` + Switch button) when the org has 1+
 * transcode profiles, or a single "Create Transcode Profile" link when 0.
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
  transcodeProfiles,
  onSwitchProfile,
  onDismiss,
}: StreamWarningBannerProps) {
  if (!deriveRecommendTranscode(camera)) return null

  // useState initializer runs once per mount; the parent re-mounts the
  // banner per sheet open (warningDismissed gate), so the default tracks
  // fresh transcodeProfiles arrays. When transcodeProfiles is empty the
  // value stays "" (unused — empty-state branch renders the Create CTA).
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    transcodeProfiles[0]?.id ?? "",
  )

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
            {transcodeProfiles.length === 0 ? (
              <>
                <Link
                  href="/app/stream-profiles"
                  className={buttonVariants()}
                >
                  Create Transcode Profile
                </Link>
                <Button variant="outline" onClick={onDismiss}>
                  Dismiss
                </Button>
              </>
            ) : (
              <>
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  aria-label="Select transcode profile"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {transcodeProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button onClick={() => onSwitchProfile(selectedProfileId)}>
                  Switch
                </Button>
                <Button variant="outline" onClick={onDismiss}>
                  Dismiss
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
