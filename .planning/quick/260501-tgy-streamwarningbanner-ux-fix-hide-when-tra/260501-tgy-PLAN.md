---
phase: 260501-tgy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/codec-info.ts
  - apps/web/src/lib/codec-info.test.ts
  - apps/web/src/app/admin/cameras/components/stream-warning-banner.tsx
  - apps/web/src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx
  - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx
autonomous: true
requirements:
  - QUICK-260501-tgy
must_haves:
  truths:
    - "Banner is hidden when camera.needsTranscode === true (already opted in)"
    - "Banner is hidden when camera.streamProfile.codec !== 'copy' (effectively transcoding)"
    - "Banner still appears for risk-tier brand at medium+ confidence with passthrough profile"
    - "Banner still appears when streamWarnings includes 'vfr-detected' with passthrough profile"
    - "When org has zero non-passthrough profiles, banner shows a single CTA linking to /app/stream-profiles"
    - "When org has 1+ transcode profiles, banner shows a profile <select> defaulted to first option + Switch button + Dismiss"
    - "Clicking Switch PATCHes /api/cameras/:id with { streamProfileId: <selected> } and toasts success on 2xx"
    - "On Switch success the banner is dismissed for the current sheet session and onRefresh is invoked"
    - "CodecMismatchBanner behavior is unchanged — handleAcceptAutoTranscode (needsTranscode flag) is preserved"
  artifacts:
    - path: "apps/web/src/lib/codec-info.ts"
      provides: "deriveRecommendTranscode with flipped needsTranscode polarity + streamProfile.codec short-circuit"
      contains: "streamProfile"
    - path: "apps/web/src/lib/codec-info.test.ts"
      provides: "Tests covering 3 new short-circuit cases for deriveRecommendTranscode"
      contains: "deriveRecommendTranscode"
    - path: "apps/web/src/app/admin/cameras/components/stream-warning-banner.tsx"
      provides: "Profile picker UX: <select> + Switch + Dismiss (or single Create CTA when 0 transcode profiles)"
      contains: "onSwitchProfile"
    - path: "apps/web/src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx"
      provides: "Tests for empty-list, multi-profile, default-selected, and short-circuit branches"
      contains: "transcodeProfiles"
    - path: "apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx"
      provides: "Fetches /api/stream-profiles, filters codec!='copy', wires handleSwitchProfile, passes streamProfile to banner"
      contains: "handleSwitchProfile"
  key_links:
    - from: "apps/web/src/app/admin/cameras/components/stream-warning-banner.tsx"
      to: "apps/web/src/lib/codec-info.ts"
      via: "deriveRecommendTranscode short-circuit"
      pattern: "deriveRecommendTranscode"
    - from: "apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx"
      to: "/api/cameras/:id"
      via: "PATCH with streamProfileId triggers Phase 21 hot-reload"
      pattern: "streamProfileId"
    - from: "apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx"
      to: "/api/stream-profiles"
      via: "apiFetch on sheet open"
      pattern: "apiFetch.*stream-profiles"
---

<objective>
Fix two real UX bugs in the StreamWarningBanner observed after the Saensuk-139 verification:

1. Banner shows when the camera is ALREADY transcoding — `deriveRecommendTranscode` has wrong polarity for `needsTranscode` (returns true when the user has already opted in) and never inspects `streamProfile.codec` (so a profile with `codec: "libx264"` still triggers the banner).
2. The "Switch to Transcode Profile" CTA is misleading — it PATCHes `needsTranscode: true` (a per-camera flag override) instead of switching the camera's Stream Profile. Replace with a profile picker that PATCHes `streamProfileId` and lets Phase 21's hot-reload restart the stream.

Purpose: Match the documented user-workaround flow (manually pick a transcode profile in Edit Camera) directly inside the banner, while suppressing the banner the moment the camera is effectively transcoding so it never nags users who already followed the recommendation.

Output:
- `deriveRecommendTranscode` short-circuits on `needsTranscode === true` and on `streamProfile.codec` ∉ {undefined, null, 'copy'}.
- `StreamWarningBanner` accepts `transcodeProfiles` + `onSwitchProfile`; renders profile picker (1+ profiles) or empty-state Create CTA (0 profiles).
- `ViewStreamContent` fetches org profiles, filters non-passthrough, wires `handleSwitchProfile` (PATCHes `streamProfileId`), and keeps `handleAcceptAutoTranscode` for the unrelated CodecMismatchBanner.
- All existing 12 banner tests still pass; 5 new banner tests + 3 new logic tests cover the new branches.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/lib/codec-info.ts
@apps/web/src/lib/codec-info.test.ts
@apps/web/src/app/admin/cameras/components/stream-warning-banner.tsx
@apps/web/src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx
@apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx
@apps/web/src/app/admin/cameras/components/cameras-columns.tsx
@apps/api/src/cameras/dto/update-camera.dto.ts

<interfaces>
<!-- Key contracts the executor needs. Extracted from the codebase so no scavenger hunt. -->

From apps/web/src/app/admin/cameras/components/cameras-columns.tsx (CameraRow, lines 38-77):
```typescript
export interface CameraRow {
  id: string
  name: string
  // ...
  streamProfileId?: string | null
  /** Quick task 260425-uw0 — populated by findAllCameras include; null when no profile assigned. */
  streamProfile?: { id: string; name: string; codec: string } | null
  needsTranscode?: boolean
  streamWarnings?: string[]
  brandHint?: string | null
  brandConfidence?: string | null
  // ...
}
```

From apps/web/src/lib/codec-info.ts (current `deriveRecommendTranscode` — to be modified):
```typescript
export function deriveRecommendTranscode(cam: {
  needsTranscode?: boolean
  streamWarnings?: string[]
  brandHint?: string | null
  brandConfidence?: string | null
}): boolean {
  if (cam.needsTranscode) return true     // ← WRONG POLARITY (Issue 1)
  // ...brand + VFR fallthroughs unchanged...
}
```

From apps/web/src/app/admin/stream-profiles/components/profile-form-dialog.tsx (StreamProfile shape):
```typescript
interface StreamProfile {
  id: string
  name: string
  codec: string                  // 'copy' === passthrough; anything else === transcode
  preset: string | null
  resolution: string | null
  fps: number | null
  videoBitrate: string | null
  audioCodec: string | null
  audioBitrate: string | null
  isDefault: boolean
}
```

From apps/api/src/streams/stream-profile.service.ts (findAll returns full rows — `codec` IS included):
```typescript
async findAll() {
  return this.prisma.streamProfile.findMany({ orderBy: { createdAt: 'desc' } });
}
```

From apps/api/src/cameras/dto/update-camera.dto.ts (PATCH /api/cameras/:id accepts streamProfileId):
```typescript
streamProfileId: z.string().uuid().optional().nullable(),
needsTranscode: z.boolean().optional(),
```
Phase 21 hot-reload listens on streamProfileId changes — no extra API work needed.

From apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx:153 (apiFetch pattern):
```typescript
apiFetch<StreamProfile[]>('/api/stream-profiles')
  .then(setStreamProfiles)
  .catch(() => setStreamProfiles([]))
```

Routing note: `/admin/stream-profiles` server-redirects to `/app/stream-profiles` (apps/web/src/app/admin/stream-profiles/page.tsx:9). The empty-state Create CTA href MUST be `/app/stream-profiles` (matches camera-form-dialog.tsx:707 + nav-config.ts:47).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Update deriveRecommendTranscode short-circuits + tests</name>
  <files>apps/web/src/lib/codec-info.ts, apps/web/src/lib/codec-info.test.ts</files>
  <behavior>
    - `deriveRecommendTranscode({ needsTranscode: true, brandHint: 'uniview', brandConfidence: 'high' })` returns `false` (needsTranscode short-circuit, FLIPPED from current behavior).
    - `deriveRecommendTranscode({ streamProfile: { codec: 'libx264' }, brandHint: 'uniview', brandConfidence: 'high' })` returns `false` (effective-transcode short-circuit).
    - `deriveRecommendTranscode({ streamProfile: { codec: 'copy' }, brandHint: 'uniview', brandConfidence: 'high' })` returns `true` (passthrough profile does NOT short-circuit; falls through to brand check).
    - `deriveRecommendTranscode({ streamProfile: { codec: 'h264_nvenc' }, streamWarnings: ['vfr-detected'] })` returns `false` (effective-transcode short-circuit beats VFR).
    - `deriveRecommendTranscode({ streamProfile: null, brandHint: 'uniview', brandConfidence: 'high' })` returns `true` (null profile is NOT a short-circuit).
    - `deriveRecommendTranscode({ streamProfile: undefined, streamWarnings: ['vfr-detected'] })` returns `true` (undefined profile is NOT a short-circuit).
    - All existing brand + VFR + low-confidence cases keep current semantics (the brand/VFR fallthrough block is byte-identical).
  </behavior>
  <action>
    Step 1 — Update `apps/web/src/lib/codec-info.ts`:

    1a. Extend the `deriveRecommendTranscode` parameter shape:
    ```typescript
    export function deriveRecommendTranscode(cam: {
      needsTranscode?: boolean
      streamWarnings?: string[]
      brandHint?: string | null
      brandConfidence?: string | null
      streamProfile?: { codec?: string } | null   // NEW
    }): boolean {
      // Short-circuit: camera is already opted into the auto-transcode flag.
      if (cam.needsTranscode === true) return false   // FLIPPED from `return true`

      // Short-circuit: assigned profile is non-passthrough → already transcoding.
      // null/undefined profile and codec === 'copy' fall THROUGH to brand/VFR checks.
      if (cam.streamProfile?.codec && cam.streamProfile.codec !== 'copy') return false

      // Existing brand-tier check (unchanged)
      const riskBrand =
        cam.brandHint === "uniview" ||
        cam.brandHint === "hikvision" ||
        cam.brandHint === "dahua"
      const goodConf =
        cam.brandConfidence === "medium" || cam.brandConfidence === "high"
      if (riskBrand && goodConf) return true

      // Existing VFR check (unchanged)
      if ((cam.streamWarnings ?? []).includes("vfr-detected")) return true
      return false
    }
    ```

    1b. REPLACE the JSDoc truth-table comment block above the function (currently lines 156-162) so it reflects the new semantics:
    ```
    Truth table (matches PLAN.md Task 1 <behavior>):
      - needsTranscode === true  (already opted in)            → false (suppress)
      - streamProfile.codec ∉ {undefined, null, 'copy'}        → false (already transcoding)
      - brandHint ∈ {uniview, hikvision, dahua} AND
        brandConfidence ∈ {medium, high}                       → true
      - streamWarnings includes 'vfr-detected'                 → true
      - otherwise                                              → false
    Note: Also surface the `recommendTranscode` field in the
    `CameraStreamWarnings` interface stays as documentation; field is still
    re-derived client-side from persisted columns.
    ```

    Step 2 — Add 3 new test cases to `apps/web/src/lib/codec-info.test.ts` in a NEW describe block (do not modify the existing `normalizeCodecInfo` describe). Add the import for `deriveRecommendTranscode` to the existing import statement on line 2:
    ```typescript
    import { normalizeCodecInfo, deriveRecommendTranscode } from "./codec-info"
    ```

    Append after the closing `})` of the existing describe block:
    ```typescript
    describe("deriveRecommendTranscode — quick task 260501-tgy", () => {
      it("returns false when needsTranscode === true (flipped polarity — user already opted in)", () => {
        expect(
          deriveRecommendTranscode({
            needsTranscode: true,
            brandHint: "uniview",
            brandConfidence: "high",
          }),
        ).toBe(false)
      })

      it("returns false when streamProfile.codec is non-passthrough (already transcoding)", () => {
        expect(
          deriveRecommendTranscode({
            streamProfile: { codec: "libx264" },
            brandHint: "uniview",
            brandConfidence: "high",
          }),
        ).toBe(false)
        expect(
          deriveRecommendTranscode({
            streamProfile: { codec: "h264_nvenc" },
            streamWarnings: ["vfr-detected"],
          }),
        ).toBe(false)
      })

      it("returns true when streamProfile.codec === 'copy' AND a brand/VFR trigger fires (no short-circuit)", () => {
        expect(
          deriveRecommendTranscode({
            streamProfile: { codec: "copy" },
            brandHint: "uniview",
            brandConfidence: "high",
          }),
        ).toBe(true)
        expect(
          deriveRecommendTranscode({
            streamProfile: null,
            streamWarnings: ["vfr-detected"],
          }),
        ).toBe(true)
        expect(
          deriveRecommendTranscode({
            // streamProfile undefined
            brandHint: "hikvision",
            brandConfidence: "medium",
          }),
        ).toBe(true)
      })
    })
    ```

    Step 3 — Run the codec-info tests in isolation to verify all 3 new cases pass and the existing `normalizeCodecInfo` cases stay green.
  </action>
  <verify>
    <automated>pnpm --filter @sms-platform/web test -- src/lib/codec-info.test.ts --run</automated>
  </verify>
  <done>
    - `deriveRecommendTranscode` accepts the new `streamProfile?: { codec?: string } | null` field.
    - `needsTranscode === true` returns `false` (verified by new test).
    - `streamProfile.codec === 'libx264'` returns `false` (verified).
    - `streamProfile.codec === 'copy'` falls through to brand/VFR checks (verified).
    - JSDoc truth table reflects the new semantics.
    - All existing `normalizeCodecInfo` tests stay green.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Profile-picker UX in StreamWarningBanner + tests</name>
  <files>apps/web/src/app/admin/cameras/components/stream-warning-banner.tsx, apps/web/src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx</files>
  <behavior>
    - Banner accepts new prop `transcodeProfiles: { id: string; name: string; codec: string }[]` (caller pre-filters to codec !== 'copy').
    - Banner accepts new prop `onSwitchProfile: (profileId: string) => void | Promise<void>` (replaces `onAccept` for THIS banner — CodecMismatchBanner keeps its own `onAccept` separately).
    - Banner accepts new field `streamProfile?: { codec?: string } | null` on the camera prop and forwards it to `deriveRecommendTranscode`.
    - When `transcodeProfiles.length === 0`: render exactly one primary CTA — a Next.js `<Link href="/app/stream-profiles">` styled as a `<Button>` reading "Create Transcode Profile" + a "Dismiss" outline Button. NO `<select>`, NO Switch button.
    - When `transcodeProfiles.length >= 1`: render a native `<select>` with one `<option value={p.id}>{p.name}</option>` per profile, default-selected to `transcodeProfiles[0].id`, plus a primary "Switch" Button and a "Dismiss" outline Button.
    - Clicking "Switch" calls `onSwitchProfile(selectedId)` exactly once with the currently-selected `<select>` value.
    - The default-selected option in the `<select>` matches `transcodeProfiles[0].id`.
    - All 12 existing tests stay green when invoked with the new required props (use sensible defaults: `transcodeProfiles={[]}` and `onSwitchProfile={noop}` for legacy assertions, since they only check title/chip/dismiss render paths).
    - Banner renders nothing when `deriveRecommendTranscode` returns false (verified via two new short-circuit cases below).
    - Banner renders nothing when camera passes `streamProfile: { codec: 'libx264' }` even with brandHint=uniview + confidence=high (verifies the new short-circuit reaches the banner).
    - Banner renders nothing when camera passes `needsTranscode: true` even with brandHint=uniview + confidence=high (verifies the flipped polarity reaches the banner).
  </behavior>
  <action>
    Step 1 — Rewrite `apps/web/src/app/admin/cameras/components/stream-warning-banner.tsx`:

    1a. Update the props interface:
    ```typescript
    interface StreamWarningBannerProps {
      camera: {
        id: string
        needsTranscode?: boolean
        streamWarnings?: string[]
        brandHint?: string | null
        brandConfidence?: string | null
        streamProfile?: { codec?: string } | null      // NEW
      }
      brandEvidence?: string[]
      transcodeProfiles: { id: string; name: string; codec: string }[]   // NEW (required)
      onSwitchProfile: (profileId: string) => void | Promise<void>       // NEW (replaces onAccept)
      onDismiss: () => void
    }
    ```
    REMOVE the old `onAccept` prop entirely. The CodecMismatchBanner (separate component) keeps its own `onAccept` — do NOT touch that file.

    1b. Inside the component, after the `if (!deriveRecommendTranscode(camera)) return null` guard, add a `useState` for the selected profile id, defaulted to `transcodeProfiles[0]?.id ?? ''`:
    ```typescript
    import { useState } from "react"
    import Link from "next/link"
    // ...
    const [selectedProfileId, setSelectedProfileId] = useState<string>(
      transcodeProfiles[0]?.id ?? "",
    )
    ```
    Note: `useState` initializer runs once per mount; the parent re-mounts the banner per sheet open (warningDismissed gate), so the default tracks fresh `transcodeProfiles` arrays. If `transcodeProfiles` length is 0 the value stays empty string (unused — the empty-state branch renders the Create CTA instead).

    1c. Replace the existing `<div className="flex items-center gap-2 pt-1">` action row with a conditional:
    ```tsx
    <div className="flex items-center gap-2 pt-1">
      {transcodeProfiles.length === 0 ? (
        <>
          <Button asChild>
            <Link href="/app/stream-profiles">Create Transcode Profile</Link>
          </Button>
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
    ```
    Per `[feedback_ui_pro_minimal]` — single primary action ("Switch" or "Create Transcode Profile"); Dismiss is the only secondary control. Per `[feedback_language_english_default]` — all copy English-only.

    1d. The `Button asChild` pattern requires the shadcn Button to support `asChild` (Radix Slot). If the current Button does not support it, fall back to:
    ```tsx
    <Link href="/app/stream-profiles" className={buttonVariants()}>
      Create Transcode Profile
    </Link>
    ```
    Verify `apps/web/src/components/ui/button.tsx` for `asChild` / `buttonVariants` exports before choosing — both patterns are valid; pick whichever the existing codebase uses. (Other admin pages already mix Link + Button; check `camera-form-dialog.tsx` line ~707 area for the existing Link-as-button idiom.)

    1e. Update the JSDoc block above `brandLabel` to mention the profile picker behavior and the two new short-circuits inherited from `deriveRecommendTranscode`.

    Step 2 — Update `apps/web/src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx`:

    2a. Update EVERY existing test invocation to add `transcodeProfiles={[]}` and rename `onAccept={...}` → `onSwitchProfile={...}` (keep mock fns where used). For the 12 existing assertions that check title/chips/dismiss, `transcodeProfiles={[]}` is correct (empty-state branch still renders the title/chips/dismiss; only the primary CTA changes from "Switch to Transcode Profile" to a Link). UPDATE the existing test "primary CTA 'Switch to Transcode Profile' invokes onAccept" → split into TWO tests below (covered in Step 2b), and DELETE the original.

    2b. Append the following NEW tests at the end of the describe block:
    ```typescript
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
      const select = screen.getByRole("combobox", { name: /select transcode profile/i }) as HTMLSelectElement
      expect(select.value).toBe("p1")     // default-selected = first
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
    ```

    2c. Run the banner test file in isolation. Verify all original 11 (after removing the now-obsolete "Switch to Transcode Profile" assertion) + 5 new assertions pass.
  </action>
  <verify>
    <automated>pnpm --filter @sms-platform/web test -- src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx --run</automated>
  </verify>
  <done>
    - StreamWarningBanner exports updated props (`transcodeProfiles`, `onSwitchProfile`, `streamProfile` on camera).
    - Empty-list branch renders a Link to `/app/stream-profiles` styled as a Button (no `<select>`, no Switch).
    - Non-empty branch renders a native `<select>` defaulted to `transcodeProfiles[0].id` + a Switch primary button + a Dismiss outline button.
    - Switch click calls `onSwitchProfile(selectedId)` exactly once.
    - All 16 banner test cases pass (11 existing + 5 new).
    - Old `onAccept` prop is removed; CodecMismatchBanner is untouched.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire profile fetch + handleSwitchProfile in ViewStreamContent</name>
  <files>apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx</files>
  <action>
    Step 1 — Add a `StreamProfile` local type at the top of the file (after the imports, before `IdChipRow`):
    ```typescript
    interface StreamProfile {
      id: string
      name: string
      codec: string
    }
    ```

    Step 2 — Add `useEffect` and `apiFetch` imports:
    ```typescript
    import { useEffect, useState } from "react"
    import { apiFetch } from "@/lib/api-fetch"     // verify exact import path; use the
                                                    // path used by camera-form-dialog.tsx:153
    ```
    Search for `apiFetch` in `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` and reuse the SAME import path.

    Step 3 — Inside `ViewStreamContent`, after the existing `warningDismissed` state declaration, add:
    ```typescript
    const [transcodeProfiles, setTranscodeProfiles] = useState<StreamProfile[]>([])

    useEffect(() => {
      apiFetch<StreamProfile[]>("/api/stream-profiles")
        .then((profiles) => {
          // Filter to non-passthrough only; empty list triggers the
          // Create-CTA branch in StreamWarningBanner.
          setTranscodeProfiles(profiles.filter((p) => p.codec !== "copy"))
        })
        .catch(() => setTranscodeProfiles([]))
    }, [])
    ```
    Mirrors the `apiFetch<StreamProfile[]>('/api/stream-profiles')` pattern in `camera-form-dialog.tsx:153`. Per the task scope constraint, do NOT refactor the fetch into a shared hook — duplicate the pattern locally.

    Step 4 — Add the new `handleSwitchProfile` handler near `handleAcceptAutoTranscode` (KEEP `handleAcceptAutoTranscode` intact — CodecMismatchBanner still uses it):
    ```typescript
    async function handleSwitchProfile(newProfileId: string) {
      try {
        const res = await fetch(`/api/cameras/${camera.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ streamProfileId: newProfileId }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setWarningDismissed(true)
        toast.success("Stream Profile switched. Stream will restart momentarily.")
        onRefresh?.()
      } catch {
        toast.error("Failed to switch profile. Try again.")
      }
    }
    ```
    Phase 21 hot-reload picks up the streamProfileId change and triggers a stream restart automatically — no extra restart call from the client. The toast wording reflects this.

    Step 5 — Replace the existing `<StreamWarningBanner ...>` invocation block with the new prop set:
    ```tsx
    {!warningDismissed && (
      <StreamWarningBanner
        camera={{
          id: camera.id,
          needsTranscode: camera.needsTranscode,
          streamWarnings: camera.streamWarnings,
          brandHint: camera.brandHint,
          brandConfidence: camera.brandConfidence,
          streamProfile: camera.streamProfile,    // NEW — already on CameraRow
        }}
        transcodeProfiles={transcodeProfiles}
        onSwitchProfile={handleSwitchProfile}
        onDismiss={() => setWarningDismissed(true)}
      />
    )}
    ```
    LEAVE the `<CodecMismatchBanner ... onAccept={handleAcceptAutoTranscode} ...>` block exactly as it is — that flow is the Phase 19.1 D-16 contract and uses a different mechanism (the `needsTranscode` per-camera flag override).

    Step 6 — Update the inline JSDoc comment block above the StreamWarningBanner JSX (lines ~272-281) to note: (a) the banner now self-suppresses when the camera is already transcoding via a non-passthrough profile, and (b) the Switch CTA delegates to `handleSwitchProfile` which PATCHes `streamProfileId` (NOT the `needsTranscode` flag).

    Step 7 — Run the existing view-stream-sheet smoke (typecheck + any related test). At minimum: `pnpm --filter @sms-platform/web typecheck` to confirm no type regressions in the parent file. (No dedicated test file exists for view-stream-sheet.tsx, so typecheck is the gate here.)
  </action>
  <verify>
    <automated>pnpm --filter @sms-platform/web typecheck && pnpm --filter @sms-platform/web test -- src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx src/lib/codec-info.test.ts --run</automated>
  </verify>
  <done>
    - `view-stream-sheet.tsx` typechecks with the new banner prop set.
    - `transcodeProfiles` state fetches `/api/stream-profiles` on mount, filters codec !== 'copy'.
    - `handleSwitchProfile` PATCHes `/api/cameras/:id` with `{ streamProfileId }` and toasts success/failure.
    - StreamWarningBanner now receives `streamProfile`, `transcodeProfiles`, `onSwitchProfile`, `onDismiss`.
    - CodecMismatchBanner block is untouched — `handleAcceptAutoTranscode` still wired to it.
    - The two earlier test files (codec-info.test.ts + stream-warning-banner.test.tsx) still pass.
  </done>
</task>

</tasks>

<verification>
- `pnpm --filter @sms-platform/web test -- src/lib/codec-info.test.ts src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx --run` — all assertions green.
- `pnpm --filter @sms-platform/web typecheck` — no new errors in modified files.
- Manual UI smoke (post-merge, optional — not gating): open ViewStream sheet for a camera with a libx264 profile; confirm the smart-probe banner does NOT render. Switch the same camera to a `copy` profile; confirm the banner DOES render with a profile picker if the org has 1+ transcode profiles, or a "Create Transcode Profile" link if 0.
- Confirm Saensuk-139 (HD15 profile, codec=libx264, needsTranscode=true) no longer shows the smart-probe banner — both short-circuits independently suppress it.
</verification>

<success_criteria>
- Banner is suppressed for any camera where `needsTranscode === true` OR `streamProfile.codec` is a non-passthrough codec.
- Banner remains visible for cameras with passthrough profile (`copy`) or null profile when brand/VFR triggers fire.
- The "Switch" CTA actually switches the camera's `streamProfileId` via PATCH /api/cameras/:id (not a flag override).
- The empty-state CTA links to `/app/stream-profiles` so users with no transcode profiles can create one.
- 16 StreamWarningBanner tests pass (11 existing + 5 new); codec-info.test.ts deriveRecommendTranscode describe block (3 tests) passes; existing normalizeCodecInfo describe block stays green.
- Typecheck passes; no apps/api changes required (Phase 21 hot-reload triggers automatically).
- Per `[feedback_language_english_default]`: all banner copy English-only.
- Per `[feedback_ui_pro_minimal]`: single primary CTA (Switch OR Create Transcode Profile) + Dismiss secondary; minimal interactive controls.
</success_criteria>

<output>
After completion, create `.planning/quick/260501-tgy-streamwarningbanner-ux-fix-hide-when-tra/260501-tgy-SUMMARY.md` capturing:
- Files modified (5 files)
- Test counts (8 new tests across 2 files, 1 obsolete test removed)
- Saensuk-139 verification status (manual smoke note)
- Any deviations from the plan (e.g., Button asChild vs buttonVariants pattern chosen)
</output>
