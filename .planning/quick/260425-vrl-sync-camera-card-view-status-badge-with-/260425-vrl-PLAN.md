---
phase: quick-260425-vrl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/admin/cameras/components/camera-status-badge.tsx
  - apps/web/src/app/admin/cameras/components/camera-card.tsx
  - apps/web/src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx
autonomous: true
requirements:
  - QUICK-260425-VRL: Card-view status badge must render with the same visual treatment as table-view StatusPills (red filled LIVE / amber outlined LIVE / gray OFFLINE pill with Radio icon).

must_haves:
  truths:
    - "Card thumbnail overlay shows a red filled pill with Radio icon and `LIVE` text when camera.status is 'online'."
    - "Card thumbnail overlay shows an amber outlined pill with Radio icon and `LIVE` text when camera.status is 'reconnecting' or 'connecting'."
    - "Card thumbnail overlay shows a gray pill with hollow circle dot and `OFFLINE` text for any other status (offline / degraded)."
    - "Both the table view and the card view render their LIVE/OFFLINE pill from the same shared primitive (single source of truth — no duplicated JSX/Tailwind classes)."
    - "All existing StatusPills tests continue to pass without modification (table view visual treatment unchanged: same red-500/95 bg, same amber-500 border + amber-700 text, same border-border/bg-muted offline pill, same Radio icon, same `bg-zinc-900` REC pill, same MAINT pill)."
  artifacts:
    - path: "apps/web/src/app/admin/cameras/components/camera-status-badge.tsx"
      provides: "Shared LIVE/OFFLINE pill primitive consumed by both StatusPills (table) and the new status-only variant used by card-view."
      contains: "export function CameraStatusPill"
    - path: "apps/web/src/app/admin/cameras/components/camera-card.tsx"
      provides: "Camera card thumbnail overlay rendering the new pill-style badge in place of the previous dot+text Badge."
      contains: "CameraStatusPill"
    - path: "apps/web/src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx"
      provides: "Test coverage for the new CameraStatusPill status-only variant covering online → red LIVE, reconnecting → amber LIVE, connecting → amber LIVE, offline → gray OFFLINE, degraded → gray OFFLINE."
      contains: "describe('CameraStatusPill"
  key_links:
    - from: "apps/web/src/app/admin/cameras/components/camera-card.tsx"
      to: "CameraStatusPill in camera-status-badge.tsx"
      via: "named import + usage in the absolute top-2 right-2 overlay div replacing CameraStatusBadge"
      pattern: "<CameraStatusPill status=\\{camera.status\\}"
    - from: "StatusPills (camera-status-badge.tsx) LIVE branch"
      to: "shared pill primitive / shared className constants"
      via: "internal reuse — both StatusPills LIVE branch and CameraStatusPill render through the same className constants so a future visual tweak updates both views in one edit"
      pattern: "(LIVE_RED_CLASSES|LIVE_AMBER_CLASSES|OFFLINE_CLASSES)"
---

<objective>
Make the camera card-view status badge render visually identical to the table-view `StatusPills` for the three states the card needs to communicate (online, reconnecting/connecting, anything-else=offline). Extract a single shared primitive so the table and the card pull from the same source of truth — a future tweak to the LIVE pill colour updates both views in one place.

Purpose: The card overlay currently shows a generic `Badge` with a colored dot + capitalized text label, while the table column uses an expressive LIVE/OFFLINE pill. Two views of the same data should speak one design language. The user has explicitly requested visual parity.

Output:
- A new `CameraStatusPill` (status-only variant) export in `camera-status-badge.tsx`.
- `StatusPills` refactored to reuse the same internal building block (no visual change to the table — pixel-identical output).
- `camera-card.tsx` overlay swapped from `CameraStatusBadge` to `CameraStatusPill`.
- Vitest coverage for the new variant.
- `view-stream-sheet.tsx` left untouched (out of scope; keeps `CameraStatusBadge`).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/admin/cameras/components/camera-status-badge.tsx
@apps/web/src/app/admin/cameras/components/camera-card.tsx
@apps/web/src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx
@apps/web/src/app/admin/cameras/components/cameras-columns.tsx

<interfaces>
<!-- Pulled from the codebase so the executor does not need to scavenger-hunt. -->

From `camera-status-badge.tsx` (current — before change):

```typescript
type CameraStatus = 'online' | 'offline' | 'degraded' | 'connecting' | 'reconnecting';

export function CameraStatusBadge(props: { status: CameraStatus; showLabel?: boolean }): JSX.Element;
export function CameraStatusDot(props: { status: CameraStatus }): JSX.Element;

export interface StatusPillsProps {
  camera: Pick<CameraRow, 'status' | 'isRecording' | 'maintenanceMode'>;
}
export function StatusPills(props: StatusPillsProps): JSX.Element;

// Internal constant currently in the file:
const PILL_BASE =
  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm';
```

Tailwind classes for the three pill variants in `StatusPills` (must match BYTE-FOR-BYTE in the new shared primitive):

- LIVE (online): `'bg-red-500/95 text-white motion-safe:animate-pulse motion-reduce:animate-none'`
- LIVE (reconnecting/connecting): `'border border-amber-500 bg-transparent text-amber-700 dark:text-amber-400 motion-safe:animate-pulse motion-reduce:animate-none [animation-duration:1s]'`
- OFFLINE: `'border border-border bg-muted text-muted-foreground'` with inner `<span class="size-2 rounded-full border border-muted-foreground bg-transparent" aria-hidden="true" />`
- LIVE/reconnecting both wrap a `<Radio className="size-3" aria-hidden="true" />` icon followed by the literal text `LIVE`.

Card overlay context (from `camera-card.tsx:156-159`):

```tsx
{/* Status badge overlay */}
<div className="absolute top-2 right-2">
  <CameraStatusBadge status={camera.status} />
</div>
```

Table cell context (from `cameras-columns.tsx:132-138`):

```tsx
cell: ({ row }) => {
  const camera = row.original
  return (
    <div className="flex items-center gap-1">
      <StatusPills camera={camera} />
      {/* error tooltip elided */}
    </div>
  )
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract shared LIVE/OFFLINE pill primitive and add status-only CameraStatusPill variant</name>
  <files>
    apps/web/src/app/admin/cameras/components/camera-status-badge.tsx,
    apps/web/src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx
  </files>
  <behavior>
    New `CameraStatusPill({ status })` export in `camera-status-badge.tsx` — these tests live in the existing test file under a new `describe('CameraStatusPill (card-view variant)', () => { ... })` block:

    - Test 1 (online → red LIVE): `<CameraStatusPill status="online" />` renders a single element with `aria-label="Live"`, text content `LIVE`, className contains `bg-red-500/95`, `text-white`, `motion-safe:animate-pulse`. Element contains a `Radio` icon (`svg` with `lucide-radio` class OR `aria-hidden="true"` on an svg sibling).
    - Test 2 (reconnecting → amber LIVE): `<CameraStatusPill status="reconnecting" />` renders `aria-label="Live"`, text `LIVE`, className contains `border-amber-500`, `bg-transparent`, `text-amber-700`, `motion-safe:animate-pulse`, `[animation-duration:1s]`. Contains Radio icon.
    - Test 3 (connecting → amber LIVE): `<CameraStatusPill status="connecting" />` matches Test 2 exactly (connecting and reconnecting share the amber LIVE treatment, mirroring `StatusPills` lines 89: `const isReconnecting = status === 'reconnecting' || status === 'connecting'`).
    - Test 4 (offline → gray OFFLINE): `<CameraStatusPill status="offline" />` renders `aria-label="Offline"`, text `OFFLINE`, className contains `border-border`, `bg-muted`, `text-muted-foreground`. Inner hollow circle: queryable as `.size-2.rounded-full.border-muted-foreground` with `bg-transparent`.
    - Test 5 (degraded → gray OFFLINE): `<CameraStatusPill status="degraded" />` matches Test 4 exactly (any non-online/non-reconnecting status falls to OFFLINE per task brief: "anything else → OFFLINE gray").
    - Test 6 (shared primitive — table parity): existing `StatusPills` tests (lines 19-160 of the test file) continue to pass UNMODIFIED. Add ONE new assertion in the new `describe` block: render both `<StatusPills camera={{ status: 'online', isRecording: false, maintenanceMode: false }} />` and `<CameraStatusPill status="online" />`, query each LIVE element by `aria-label="Live"`, and `expect(tableLive.className).toBe(cardLive.className)`. This proves the shared primitive (single source of truth) — if a future PR diverges the classes, this test fails immediately.
  </behavior>
  <action>
    Refactor `apps/web/src/app/admin/cameras/components/camera-status-badge.tsx`:

    1. Lift the three pill className constants out of `StatusPills`'s JSX into module-level `const`s near `PILL_BASE`:
       ```ts
       const PILL_LIVE_RED = cn(PILL_BASE, 'bg-red-500/95 text-white motion-safe:animate-pulse motion-reduce:animate-none');
       const PILL_LIVE_AMBER = cn(PILL_BASE, 'border border-amber-500 bg-transparent text-amber-700 dark:text-amber-400 motion-safe:animate-pulse motion-reduce:animate-none [animation-duration:1s]');
       const PILL_OFFLINE = cn(PILL_BASE, 'border border-border bg-muted text-muted-foreground');
       ```
       Note: the existing `cn(PILL_BASE, '...')` calls inside `StatusPills` line 97-99, 109-113, and 147 already produce the exact same string concatenation, so lifting them to module scope changes ZERO bytes of rendered className output. This is the "shared primitive" the must-haves call for — if the tokens ever change, both views update together.

    2. Update `StatusPills` LIVE/reconnecting/offline branches to use these constants verbatim. The internal hollow circle for OFFLINE (line 150-153) and the `Radio` icon (lines 103, 116) stay inline since they are the icon body, not a className. Pixel output MUST be identical — confirm by running the existing tests.

    3. Add the new export AFTER `StatusPills`:
       ```tsx
       export interface CameraStatusPillProps {
         status: CameraStatus;
       }

       export function CameraStatusPill({ status }: CameraStatusPillProps) {
         const isOnline = status === 'online';
         const isReconnecting = status === 'reconnecting' || status === 'connecting';

         if (isOnline) {
           return (
             <span className={PILL_LIVE_RED} aria-label="Live">
               <Radio className="size-3" aria-hidden="true" />
               LIVE
             </span>
           );
         }
         if (isReconnecting) {
           return (
             <span className={PILL_LIVE_AMBER} aria-label="Live">
               <Radio className="size-3" aria-hidden="true" />
               LIVE
             </span>
           );
         }
         return (
           <span className={PILL_OFFLINE} aria-label="Offline">
             <span
               className="size-2 rounded-full border border-muted-foreground bg-transparent"
               aria-hidden="true"
             />
             OFFLINE
           </span>
         );
       }
       ```

    4. Do NOT delete `CameraStatusBadge` or `CameraStatusDot` — both are still consumed by `view-stream-sheet.tsx:280` (info panel) and `camera-card.tsx:167` (the small dot beside the camera name in the info area, which is intentionally kept distinct from the overlay pill per the task-brief constraint "Out of scope ... HoverPreviewPlayer logic" — the info-area dot is unrelated to the overlay). Keeping these exports preserves backward-compatibility with the other consumer.

    5. Add a new `describe('CameraStatusPill (card-view variant)', () => { ... })` block at the bottom of `apps/web/src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx` containing Tests 1-6 from the `<behavior>` section.

    Why this shape (vs. just inlining a copy in camera-card): a single shared primitive prevents drift. The user's must-have #4 says "Both consumers should call the same underlying badge component" — lifting the className constants to module scope and reading them from both `StatusPills` and `CameraStatusPill` satisfies that without an awkward "render one pill" helper that StatusPills would have to call in a loop.
  </action>
  <verify>
    <automated>cd apps/web && pnpm vitest run src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx</automated>
  </verify>
  <done>
    - All existing `StatusPills` tests pass unmodified.
    - 6 new `CameraStatusPill` tests pass.
    - Module exports `CameraStatusPill` with the exact signature `({ status }: { status: CameraStatus }) => JSX.Element`.
    - `PILL_LIVE_RED`, `PILL_LIVE_AMBER`, `PILL_OFFLINE` defined at module scope and consumed by BOTH `StatusPills` (table) and `CameraStatusPill` (card) — proven by Test 6 (table-vs-card className equality assertion).
    - `CameraStatusBadge` and `CameraStatusDot` exports unchanged (both still consumed by `view-stream-sheet.tsx` and the card info area — do not break those call sites).
  </done>
</task>

<task type="auto">
  <name>Task 2: Swap card-view overlay to CameraStatusPill + typecheck</name>
  <files>apps/web/src/app/admin/cameras/components/camera-card.tsx</files>
  <action>
    Edit `apps/web/src/app/admin/cameras/components/camera-card.tsx`:

    1. Update the import on line 24-27 from:
       ```tsx
       import {
         CameraStatusBadge,
         CameraStatusDot,
       } from "@/app/admin/cameras/components/camera-status-badge"
       ```
       to:
       ```tsx
       import {
         CameraStatusDot,
         CameraStatusPill,
       } from "@/app/admin/cameras/components/camera-status-badge"
       ```
       Drop `CameraStatusBadge` from the import list — the card no longer uses it (info-area dot uses `CameraStatusDot`, overlay now uses `CameraStatusPill`).

    2. Replace line 158 inside the overlay:
       ```tsx
       <CameraStatusBadge status={camera.status} />
       ```
       with:
       ```tsx
       <CameraStatusPill status={camera.status} />
       ```

    3. Leave line 167's `<CameraStatusDot status={camera.status} />` untouched — the small dot beside the camera name is a separate, intentional UI element distinct from the overlay pill (the task brief is explicit that overlay style must match the table; nothing about replacing the inline name-dot).

    4. After edit, the file should:
       - Import `CameraStatusDot` and `CameraStatusPill` only (no `CameraStatusBadge`).
       - Render `<CameraStatusPill status={camera.status} />` at line ~158 inside `absolute top-2 right-2`.
       - Render `<CameraStatusDot status={camera.status} />` unchanged at the info area.

    Do NOT change the overlay positioning (`absolute top-2 right-2`) — the new pill (`text-[10px] font-bold` + `px-1.5 py-0.5`) is similar in footprint to the prior `Badge` (`text-xs` + default badge padding), so the existing `top-2 right-2` placement remains visually clean. The shadow-sm on the pill helps it stand out against the camera thumbnail. (Per task-brief: "Adjust size/spacing only as needed so the pill fits cleanly as a top-right overlay" — current positioning already fits; no adjustment needed.)
  </action>
  <verify>
    <automated>cd apps/web && pnpm typecheck && pnpm lint -- src/app/admin/cameras/components/camera-card.tsx</automated>
  </verify>
  <done>
    - `camera-card.tsx` imports `CameraStatusDot` and `CameraStatusPill` (no `CameraStatusBadge`).
    - Overlay div renders `<CameraStatusPill status={camera.status} />`.
    - Info-area dot still renders `<CameraStatusDot status={camera.status} />`.
    - `pnpm typecheck` passes (no TS errors).
    - `pnpm lint` passes for the modified file (no new lint errors).
  </done>
</task>

</tasks>

<verification>
End-to-end checks the executor MUST run before declaring the plan complete:

1. **Unit tests** (Task 1 verify command): `pnpm vitest run src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx` — all StatusPills tests + 6 new CameraStatusPill tests pass.
2. **Typecheck** (Task 2 verify command): `pnpm typecheck` from `apps/web` — clean.
3. **Lint** (Task 2 verify command): `pnpm lint` includes `camera-card.tsx` — clean.
4. **Visual sanity grep** — these greps should each return EXACTLY ONE hit, confirming the swap is complete and no stale `CameraStatusBadge` reference remains in the card:
   ```bash
   grep -n "CameraStatusBadge" apps/web/src/app/admin/cameras/components/camera-card.tsx   # → no output (removed)
   grep -n "CameraStatusPill"  apps/web/src/app/admin/cameras/components/camera-card.tsx   # → 2 hits (import + usage)
   grep -n "PILL_LIVE_RED"     apps/web/src/app/admin/cameras/components/camera-status-badge.tsx  # → ≥2 hits (decl + StatusPills + CameraStatusPill)
   ```
5. `view-stream-sheet.tsx` STILL imports and renders `CameraStatusBadge` (out of scope) — `grep "CameraStatusBadge" apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx` returns its 2 hits.
</verification>

<success_criteria>
- Card thumbnail overlay renders the same red/amber/gray LIVE/OFFLINE pill as the table column for online / reconnecting / connecting / offline / degraded.
- Table view visual treatment is byte-for-byte unchanged (existing StatusPills test suite untouched and passing).
- The shared className constants live at module scope in `camera-status-badge.tsx` and are read from both `StatusPills` (table) and `CameraStatusPill` (card) — single source of truth.
- All tests, typecheck, and lint pass.
- Atomic commit with message in the form: `feat(quick-260425-vrl): sync camera card overlay with table StatusPills`.

Out of scope and intentionally unchanged: snapshot thumbnails, HoverPreviewPlayer, view-stream-sheet's CameraStatusBadge, the small CameraStatusDot beside the camera name in the info area, the table view itself.
</success_criteria>

<output>
After completion, create `.planning/quick/260425-vrl-sync-camera-card-view-status-badge-with-/260425-vrl-SUMMARY.md` summarizing:
- Files modified
- The shared-primitive refactor (PILL_LIVE_RED / PILL_LIVE_AMBER / PILL_OFFLINE constants now read from both code paths)
- Test counts before/after
- Confirmation that `view-stream-sheet.tsx` was deliberately left on `CameraStatusBadge`
</output>
