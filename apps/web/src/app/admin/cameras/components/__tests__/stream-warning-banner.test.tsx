import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@testing-library/jest-dom/vitest"

import { StreamWarningBanner } from "../stream-warning-banner"

/**
 * Quick task 260501-1n1 Task 3 (original behavior) + 260501-tgy Task 2
 * (profile-picker UX + flipped-polarity short-circuit).
 *
 * Behavior matrix lives in PLAN.md <behavior>. Each `it` corresponds to one
 * row of that matrix. The banner is purely presentational; it derives
 * `recommendTranscode` from the persisted Camera fields via
 * `deriveRecommendTranscode` (covered separately in codec-info.test.ts).
 */
describe("StreamWarningBanner", () => {
  const noop = () => {}

  it("renders nothing when recommendTranscode is undefined (legacy row pre-probe)", () => {
    const { container } = render(
      <StreamWarningBanner
        camera={{ id: "c1" }}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={noop}
      />,
    )
    // No alert role — entire component bails to null
    expect(screen.queryByRole("alert")).toBeNull()
    expect(container.firstChild).toBeNull()
  })

  it("renders nothing when all signals are absent (recommendTranscode evaluates false)", () => {
    render(
      <StreamWarningBanner
        camera={{
          id: "c1",
          needsTranscode: false,
          streamWarnings: [],
          brandHint: "unknown",
          brandConfidence: "low",
        }}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={noop}
      />,
    )
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("renders Uniview-specific title when brandHint=uniview confidence=high", () => {
    render(
      <StreamWarningBanner
        camera={{
          id: "c1",
          needsTranscode: false,
          streamWarnings: [],
          brandHint: "uniview",
          brandConfidence: "high",
        }}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={noop}
      />,
    )
    expect(
      screen.getByText(/Uniview camera detected — transcode profile recommended/i),
    ).toBeInTheDocument()
  })

  it("renders Hikvision-specific title when brandHint=hikvision confidence=medium", () => {
    render(
      <StreamWarningBanner
        camera={{
          id: "c1",
          brandHint: "hikvision",
          brandConfidence: "medium",
        }}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={noop}
      />,
    )
    expect(
      screen.getByText(/Hikvision camera detected — transcode profile recommended/i),
    ).toBeInTheDocument()
  })

  it("renders Dahua-specific title when brandHint=dahua confidence=high", () => {
    render(
      <StreamWarningBanner
        camera={{
          id: "c1",
          brandHint: "dahua",
          brandConfidence: "high",
        }}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={noop}
      />,
    )
    expect(
      screen.getByText(/Dahua camera detected — transcode profile recommended/i),
    ).toBeInTheDocument()
  })

  it("renders VFR-specific title when streamWarnings includes vfr-detected and brand is unknown", () => {
    render(
      <StreamWarningBanner
        camera={{
          id: "c1",
          streamWarnings: ["vfr-detected"],
          brandHint: "unknown",
          brandConfidence: "low",
        }}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={noop}
      />,
    )
    expect(
      screen.getByText(/Variable frame rate detected — transcode profile recommended/i),
    ).toBeInTheDocument()
  })

  it("renders evidence + warning chips when both arrays have entries", () => {
    render(
      <StreamWarningBanner
        camera={{
          id: "c1",
          streamWarnings: ["vfr-detected", "high-profile"],
          brandHint: "uniview",
          brandConfidence: "high",
        }}
        brandEvidence={["url-path:/media/video2", "tags.encoder:Hisilicon V200"]}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={noop}
      />,
    )
    expect(screen.getByText("vfr-detected")).toBeInTheDocument()
    expect(screen.getByText("high-profile")).toBeInTheDocument()
    expect(screen.getByText("url-path:/media/video2")).toBeInTheDocument()
    expect(screen.getByText("tags.encoder:Hisilicon V200")).toBeInTheDocument()
  })

  it("secondary CTA 'Dismiss' invokes onDismiss", async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(
      <StreamWarningBanner
        camera={{
          id: "c1",
          brandHint: "uniview",
          brandConfidence: "high",
        }}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={onDismiss}
      />,
    )
    await user.click(screen.getByRole("button", { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("brand title uses generic fallback when brandConfidence='low' (insufficient signal)", () => {
    // Low-confidence brand alone does NOT trigger recommendTranscode → banner
    // bails out. Validate the bail-out so we never show a 'Uniview' banner
    // off a single weak signal.
    const { container } = render(
      <StreamWarningBanner
        camera={{
          id: "c1",
          brandHint: "uniview",
          brandConfidence: "low",
        }}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={noop}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("does NOT render a brand-specific title when brandHint is 'generic-onvif' (not in risk tier)", () => {
    // generic-onvif is medium-confidence in detectBrand but is NOT included
    // in the risk-tier set {uniview, hikvision, dahua}, so recommendTranscode
    // stays false unless other signals fire. Banner should bail out.
    const { container } = render(
      <StreamWarningBanner
        camera={{
          id: "c1",
          brandHint: "generic-onvif",
          brandConfidence: "medium",
        }}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={noop}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  // ─── Quick task 260501-tgy — flipped polarity + profile-picker UX ───

  it("returns null when needsTranscode === true (flipped polarity short-circuit)", () => {
    const { container } = render(
      <StreamWarningBanner
        camera={{
          id: "c1",
          needsTranscode: true,
          brandHint: "uniview",
          brandConfidence: "high",
        }}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={noop}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("returns null when streamProfile.codec is non-passthrough (already transcoding)", () => {
    const { container } = render(
      <StreamWarningBanner
        camera={{
          id: "c1",
          streamProfile: { codec: "libx264" },
          brandHint: "uniview",
          brandConfidence: "high",
        }}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={noop}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("with 0 transcode profiles renders 'Create Transcode Profile' link to /app/stream-profiles, no <select>", () => {
    render(
      <StreamWarningBanner
        camera={{ id: "c1", brandHint: "uniview", brandConfidence: "high" }}
        transcodeProfiles={[]}
        onSwitchProfile={noop}
        onDismiss={noop}
      />,
    )
    const link = screen.getByRole("link", { name: /create transcode profile/i })
    expect(link).toHaveAttribute("href", "/app/stream-profiles")
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.queryByRole("button", { name: /^switch$/i })).toBeNull()
  })

  it("with 2+ transcode profiles renders <select> with each option and Switch button calls onSwitchProfile with selected id", async () => {
    const user = userEvent.setup()
    const onSwitchProfile = vi.fn()
    render(
      <StreamWarningBanner
        camera={{ id: "c1", brandHint: "uniview", brandConfidence: "high" }}
        transcodeProfiles={[
          { id: "p1", name: "HD15", codec: "libx264" },
          { id: "p2", name: "SD10", codec: "libx264" },
        ]}
        onSwitchProfile={onSwitchProfile}
        onDismiss={noop}
      />,
    )
    const select = screen.getByRole("combobox", {
      name: /select transcode profile/i,
    }) as HTMLSelectElement
    expect(select.value).toBe("p1") // default-selected = first
    expect(screen.getByRole("option", { name: "HD15" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "SD10" })).toBeInTheDocument()

    await user.selectOptions(select, "p2")
    await user.click(screen.getByRole("button", { name: /^switch$/i }))
    expect(onSwitchProfile).toHaveBeenCalledTimes(1)
    expect(onSwitchProfile).toHaveBeenCalledWith("p2")
  })

  it("default-selected profile is the first one in transcodeProfiles when user does not change selection", async () => {
    const user = userEvent.setup()
    const onSwitchProfile = vi.fn()
    render(
      <StreamWarningBanner
        camera={{ id: "c1", brandHint: "uniview", brandConfidence: "high" }}
        transcodeProfiles={[
          { id: "p1", name: "HD15", codec: "libx264" },
          { id: "p2", name: "SD10", codec: "libx264" },
        ]}
        onSwitchProfile={onSwitchProfile}
        onDismiss={noop}
      />,
    )
    await user.click(screen.getByRole("button", { name: /^switch$/i }))
    expect(onSwitchProfile).toHaveBeenCalledWith("p1")
  })
})
