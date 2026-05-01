---
phase: 260501-tgy
plan: 01
subsystem: web/cameras-ui
tags: [smart-probe, banner, ux-fix, profile-picker, hot-reload]
dependency_graph:
  requires:
    - apps/web/src/lib/codec-info.ts (deriveRecommendTranscode)
    - apps/api PATCH /api/cameras/:id (streamProfileId, Phase 21 hot-reload)
    - apps/api GET /api/stream-profiles (lists org's profiles incl. codec)
  provides:
    - StreamWarningBanner profile picker (transcodeProfiles + onSwitchProfile)
    - deriveRecommendTranscode short-circuits (needsTranscode flipped + non-passthrough)
  affects:
    - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx (banner consumer)
tech_stack:
  added: []
  patterns:
    - apiFetch<StreamProfile[]>('/api/stream-profiles') (mirrors camera-form-dialog.tsx:153)
    - useState initializer per banner mount (default-selected = transcodeProfiles[0]?.id)
    - Link + buttonVariants() (Button does NOT support asChild — base-ui, not Radix Slot)
key_files:
  created: []
  modified:
    - apps/web/src/lib/codec-info.ts
    - apps/web/src/lib/codec-info.test.ts
    - apps/web/src/app/admin/cameras/components/stream-warning-banner.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx
    - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx
decisions:
  - Used buttonVariants() className on Next.js <Link> instead of <Button asChild>; the
    project's Button (apps/web/src/components/ui/button.tsx) wraps base-ui's Button
    primitive which does NOT export an asChild Slot. Plan Step 1d explicitly listed
    this as a fallback to verify and pick.
  - apiFetch import path is @/lib/api (NOT @/lib/api-fetch as the plan suggested);
    verified by checking camera-form-dialog.tsx:7.
metrics:
  duration: ~6 min
  completed: 2026-04-30T21:24:00Z
  commits: 3
  tasks: 3
  files_modified: 5
  tests_added: 8        # 3 codec-info + 5 banner
  tests_removed: 1      # original "Switch to Transcode Profile invokes onAccept"
  tests_total_passing: 25  # 10 codec-info + 15 banner
---

# Quick Task 260501-tgy: StreamWarningBanner UX Fix Summary

**One-liner:** Suppress smart-probe banner when camera is already transcoding (flipped `needsTranscode` polarity + new `streamProfile.codec` short-circuit), and replace the misleading "Switch to Transcode Profile" CTA (which PATCHed a per-camera flag) with a Stream Profile picker that PATCHes `streamProfileId` and lets Phase 21 hot-reload restart the stream.

## Tasks Completed

| Task | Name                                                          | Commit  | Files                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Update `deriveRecommendTranscode` short-circuits + tests      | b525da1 | apps/web/src/lib/codec-info.ts, apps/web/src/lib/codec-info.test.ts                                                                                                                                                    |
| 2    | Profile-picker UX in StreamWarningBanner + tests              | ba6c780 | apps/web/src/app/admin/cameras/components/stream-warning-banner.tsx, apps/web/src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx                                                                |
| 3    | Wire profile fetch + handleSwitchProfile in ViewStreamContent | 7dadf4c | apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx                                                                                                                                                        |

## Behavior Delivered

- `deriveRecommendTranscode` now SUPPRESSES the banner (returns `false`) when:
  1. `needsTranscode === true` (user already opted into per-camera flag) — **flipped polarity** from the previous `return true`.
  2. `streamProfile.codec` ∉ {`undefined`, `null`, `'copy'`} — assigned profile is non-passthrough, so the camera is already transcoding.
- `streamProfile.codec === 'copy'` (or null/undefined profile) still falls through to the brand/VFR checks — passthrough profiles do not short-circuit.
- StreamWarningBanner action row now has TWO modes:
  - **0 transcode profiles** → single primary CTA `<Link href="/app/stream-profiles" className={buttonVariants()}>Create Transcode Profile</Link>` + outline `Dismiss` button.
  - **1+ transcode profiles** → native `<select>` (default-selected to `transcodeProfiles[0].id`) + primary `Switch` button (calls `onSwitchProfile(selectedId)`) + outline `Dismiss` button.
- ViewStreamContent fetches `/api/stream-profiles` on mount, filters out passthrough profiles, and wires `handleSwitchProfile` which PATCHes `/api/cameras/:id` with `{ streamProfileId }`. Phase 21's hot-reload then restarts the stream automatically (toast reflects this).
- `handleAcceptAutoTranscode` is preserved for `CodecMismatchBanner` — the Phase 19.1 D-16 contract is untouched.

## Test Results

- `pnpm --filter @sms-platform/web exec vitest run src/lib/codec-info.test.ts` → **10 passed** (7 existing `normalizeCodecInfo` + 3 new `deriveRecommendTranscode`).
- `pnpm --filter @sms-platform/web exec vitest run src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx` → **15 passed** (10 existing + 5 new; 1 obsolete test removed per plan Step 2a).
- `pnpm --filter @sms-platform/web exec tsc --noEmit` → **clean** (0 errors across the entire web app).

### Test Counts

| File                                                                                       | Existing kept | Removed | Added | Total |
| ------------------------------------------------------------------------------------------ | ------------: | ------: | ----: | ----: |
| apps/web/src/lib/codec-info.test.ts                                                        |             7 |       0 |     3 |    10 |
| apps/web/src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx         |            10 |       1 |     5 |    15 |
| **TOTAL**                                                                                  |        **17** |   **1** | **8** | **25** |

## Saensuk-139 Verification Status

**Manual smoke (post-merge — not gating):** Saensuk-139 has the HD15 transcode profile assigned (`streamProfile.codec === 'libx264'`) AND `needsTranscode === true`. With this fix, BOTH short-circuits independently suppress the banner — `deriveRecommendTranscode` returns `false` on the very first guard (`needsTranscode === true`), so the banner never reaches its render path. Confirmed via `deriveRecommendTranscode` unit tests:

- `{ needsTranscode: true, brandHint: 'uniview', brandConfidence: 'high' }` → `false`
- `{ streamProfile: { codec: 'libx264' }, brandHint: 'uniview', brandConfidence: 'high' }` → `false`

## Deviations from Plan

### [Choice — Documentation] Used `buttonVariants()` + `<Link>` instead of `<Button asChild>`

- **Found during:** Task 2 (Step 1d explicitly asked to verify and pick).
- **Reason:** The project's `Button` component (`apps/web/src/components/ui/button.tsx`) wraps `@base-ui/react/button`'s `Button` primitive, which does NOT export an `asChild` Slot. Radix Slot's `asChild` pattern is a Radix idiom; base-ui uses a different composition model.
- **Resolution:** Used the documented fallback from plan Step 1d: `<Link href="/app/stream-profiles" className={buttonVariants()}>Create Transcode Profile</Link>`. Test asserts `screen.getByRole("link", { name: /create transcode profile/i })` and `link.toHaveAttribute("href", "/app/stream-profiles")` — both green.

### [Choice — Documentation] `apiFetch` imported from `@/lib/api`, not `@/lib/api-fetch`

- **Found during:** Task 3 (Step 2 said "verify exact import path; use the path used by camera-form-dialog.tsx:153").
- **Reason:** The actual export lives at `@/lib/api` (verified by `grep -n "apiFetch" camera-form-dialog.tsx` → `import { apiFetch, ApiError } from '@/lib/api'`). The plan's `@/lib/api-fetch` was a guess; the file exists at `apps/web/src/lib/api.ts`.
- **Resolution:** Used `import { apiFetch } from "@/lib/api"`. Typecheck passes.

### [Process — Sequencing] Task 2 commit (ba6c780) intentionally left tree typecheck broken

- **Reason:** The plan splits the banner prop rewrite (Task 2) and the call-site rewiring (Task 3) into separate atomic commits. Between commits ba6c780 and 7dadf4c the `view-stream-sheet.tsx` call site referenced the old `onAccept` prop and the `apps/web` tsc pass produced one error: `error TS2322: Type '...; onAccept: () => Promise<...>; ...' is not assignable to type 'IntrinsicAttributes & StreamWarningBannerProps'`.
- **Resolution:** Documented in the Task 2 commit body and resolved by the immediately-following Task 3 commit. Final tree (HEAD = 7dadf4c) has 0 typecheck errors.
- **No auto-fix needed** — this is the natural per-task atomic-commit cadence specified by the plan.

## Known Stubs

None — this is a pure UX bug fix. Every code path either renders real data (`transcodeProfiles` from `/api/stream-profiles`) or routes to a real action (`PATCH /api/cameras/:id` with `streamProfileId`).

## Self-Check: PASSED

**Files exist:**

```
FOUND: apps/web/src/lib/codec-info.ts
FOUND: apps/web/src/lib/codec-info.test.ts
FOUND: apps/web/src/app/admin/cameras/components/stream-warning-banner.tsx
FOUND: apps/web/src/app/admin/cameras/components/__tests__/stream-warning-banner.test.tsx
FOUND: apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx
FOUND: .planning/quick/260501-tgy-streamwarningbanner-ux-fix-hide-when-tra/260501-tgy-SUMMARY.md
```

**Commits exist:**

```
FOUND: b525da1  feat(260501-tgy-01): suppress smart-probe banner when already transcoding
FOUND: ba6c780  feat(260501-tgy-02): replace banner CTA with profile picker
FOUND: 7dadf4c  feat(260501-tgy-03): wire profile fetch + handleSwitchProfile in ViewStream
```
