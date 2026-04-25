---
quick_id: 260425-uw0
type: execute
status: complete
completed_at: 2026-04-25
duration_minutes: ~12
commits:
  - 8c68feb: extract stream-profile-mode util + extend findAllCameras include
  - 5ca5168: add Stream Profile column to Cameras table
files_created:
  - apps/web/src/lib/stream-profile-mode.ts
  - apps/web/src/lib/stream-profile-mode.test.ts
files_modified:
  - apps/web/src/components/stream-profiles/stream-profiles-columns.tsx
  - apps/api/src/cameras/cameras.service.ts
  - apps/web/src/app/admin/cameras/components/cameras-columns.tsx
  - apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx
tech_stack:
  patterns:
    - "Shared util for cross-table token reuse (mode-name + badge color map)"
    - "Prisma include with select to keep wire payload tight"
key_decisions:
  - "Use `select: { id, name, codec }` on findAllCameras instead of `streamProfile: true` — keeps the GET /api/cameras payload narrow and decouples from future schema additions to StreamProfile."
  - "accessorFn returns name (or empty string for null) — pushes unassigned cameras to one end of default sort without a custom sortFn."
  - "Em-dash null cell does NOT render a badge, mirroring the Resolution column's null pattern (visual quietness for empty state)."
test_count_delta: +7 cameras-columns + 7 new util tests = +14 tests
---

# Quick 260425-uw0: Add Stream Profile column to Cameras table — Summary

One-liner: Surfaces each camera's assigned stream profile inline on the Cameras table with a name + Transcode/Passthrough/Auto badge, sourced from a shared util that the Stream Profiles page now also imports.

## What changed

### 1. New shared util — single source of truth for mode tokens

`apps/web/src/lib/stream-profile-mode.ts`

```ts
export type StreamProfileModeName = "Passthrough" | "Transcode" | "Auto"

export function getStreamProfileModeName(codec: string): StreamProfileModeName {
  if (codec === "copy") return "Passthrough"
  if (codec === "libx264") return "Transcode"
  return "Auto"
}

export const STREAM_PROFILE_MODE_BADGE: Record<StreamProfileModeName, string> = {
  Passthrough: "bg-green-100 text-green-700",
  Transcode: "bg-amber-100 text-amber-700",
  Auto: "bg-neutral-100 text-neutral-700",
}
```

Backed by 7 unit tests in `stream-profile-mode.test.ts` covering each codec branch and each token value.

### 2. stream-profiles-columns.tsx now imports from the util

Local `getModeName` + `MODE_BADGE` deleted. The Mode cell now reads:

```tsx
accessorFn: (row) => getStreamProfileModeName(row.codec),
// ...
const badgeClass =
  STREAM_PROFILE_MODE_BADGE[mode as keyof typeof STREAM_PROFILE_MODE_BADGE]
  ?? STREAM_PROFILE_MODE_BADGE.Auto
```

Visual output is byte-identical (verified by re-running existing tests). Greppable invariant: zero matches for `getModeName` or `MODE_BADGE` in `apps/web/src/components/stream-profiles/`.

### 3. Backend findAllCameras include

`apps/api/src/cameras/cameras.service.ts:261-280`

```ts
async findAllCameras(siteId?: string) {
  return this.tenancy.camera.findMany({
    where: siteId ? { siteId } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      site: { include: { project: true } },
      streamProfile: { select: { id: true, name: true, codec: true } },
    },
  });
}
```

`select` (not `streamProfile: true`) keeps the GET /api/cameras response payload tight — only the three fields the cell needs. Mirrors precedent from `findCameraById` (which uses bare `streamProfile: true` because it has different downstream consumers). No Prisma schema change — the relation already exists on the Camera model.

### 4. New "Stream Profile" column

`apps/web/src/app/admin/cameras/components/cameras-columns.tsx`

- `CameraRow` gains `streamProfile?: { id: string; name: string; codec: string } | null` as a sibling to the existing `streamProfileId?: string | null`. Both are kept — the FK ID stays available for callers that need it (e.g. camera-form-dialog).
- New column inserted between `id: "resolution"` and `accessorKey: "createdAt"`. Renders profile name (font-medium) + outlined Badge with the shared tokens. Null/undefined profile collapses to a muted em-dash with no badge.
- `accessorFn` returns `row.streamProfile?.name ?? ""` so TanStack's default sort orders alphabetically and groups unassigned at one end.
- No `filterFn` (out of scope — sort-only).
- No `size` (auto-sizes like Name).

### 5. Tests

`cameras-columns.test.tsx` gains a new describe block (`Stream Profile column (quick 260425-uw0)`) with 7 cases:
- Transcode badge for codec=libx264
- Passthrough badge for codec=copy
- Auto badge for unknown codec (h264_nvenc)
- Em-dash + no badge when streamProfile=null
- Em-dash when streamProfile=undefined (legacy rows)
- Position invariant: streamProfile is at index resolution+1, createdAt at streamProfile+1
- accessorFn returns name (or "") for sorting

All 18 existing tests in the file continue to pass.

## Verification

| Check | Command | Result |
|-------|---------|--------|
| Util tests | `pnpm --filter @sms-platform/web exec vitest run src/lib/stream-profile-mode.test.ts` | 7/7 pass |
| Columns tests | `pnpm --filter @sms-platform/web exec vitest run src/app/admin/cameras/components/cameras-columns.test.tsx` | 25/25 pass |
| Wider Cameras test net | `pnpm --filter @sms-platform/web exec vitest run src/app/admin/cameras src/components/pages/__tests__ src/lib/stream-profile-mode.test.ts` | 232/232 pass across 18 files |
| Web type-check | `pnpm --filter @sms-platform/web exec tsc --noEmit` | clean |
| API build | `pnpm --filter @sms-platform/api build` | 161 files compiled, exit 0 |

## Deviations from plan

**[Rule 1 — Bug] Fix TS2352 cast error in test file**
- Found during: end-to-end tsc check after Task 2 GREEN
- Issue: `delete (cam as Record<string, unknown>).streamProfile` failed with "neither type sufficiently overlaps" because CameraRow has no string index signature.
- Fix: Cast through `unknown` first — `delete (cam as unknown as Record<string, unknown>).streamProfile`.
- Files modified: `apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx`
- Folded into commit: 5ca5168

**[Note — Plan verification step 6]**: The plan's "single-source-of-truth grep" expects ONLY `stream-profile-mode.ts` to contain `bg-green-100 text-green-700`, `bg-amber-100 text-amber-700`, `bg-neutral-100 text-neutral-700`. In practice, several unrelated files in the codebase (`users-columns.tsx`, `user-details-dialog.tsx`, `audit-log-columns.tsx`, `org-columns.tsx`, `webhooks-columns.tsx`) reuse the same Tailwind utility classes for their own distinct semantic contexts (role/status badges). Those usages predate this quick task and are out of scope per the SCOPE BOUNDARY rule — they semantically map to "developer role" or "active status", not "stream profile mode". The relevant invariant — that stream profile mode tokens are defined once and shared between the Stream Profiles and Cameras tables — is satisfied: both `stream-profiles-columns.tsx` and `cameras-columns.tsx` now import from `@/lib/stream-profile-mode`. No production stream-profile-mode token is duplicated.

## Process lifecycle note

Per task constraints: API process PID 75015 is running and serving the live system. The backend include change (cameras.service.ts) requires an API restart for the live system to surface the new `streamProfile` field on GET /api/cameras. The frontend change does not require a restart. The orchestrator/operator owns process lifecycle — this executor did NOT kill or restart PID 75015.

## Self-Check: PASSED

Verified files exist:
- FOUND: apps/web/src/lib/stream-profile-mode.ts
- FOUND: apps/web/src/lib/stream-profile-mode.test.ts

Verified commits exist:
- FOUND: 8c68feb (Task 1)
- FOUND: 5ca5168 (Task 2)

Verified tests pass: 232/232 web tests, API build exit 0, tsc clean.
