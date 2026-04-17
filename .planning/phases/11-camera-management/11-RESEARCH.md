# Phase 11: Camera Management - Research

**Researched:** 2026-04-17
**Domain:** React DataTable, HLS streaming, Sheet panel UI, IntersectionObserver
**Confidence:** HIGH

## Summary

This phase replaces the existing camera list page and camera detail page with a unified camera management interface built on the Phase 8 DataTable system. The work is primarily frontend component composition -- no new npm dependencies, no new backend APIs, and no new shadcn components are needed. All building blocks exist in the codebase.

The main technical challenges are: (1) managing multiple concurrent HLS player instances in card view without crashing the browser, (2) implementing the hover-to-preview pattern with proper debounce and cleanup, and (3) wiring the View Stream sheet to switch camera context without unmounting. The existing `HlsPlayer` component already has good buffer management (`maxBufferLength`, `backBufferLength`) that can be reused for the hover preview variant.

**Primary recommendation:** Follow the established column definition pattern (see `stream-profiles-columns.tsx`) for camera columns, compose reusable components into the new page, and focus testing effort on the HLS player lifecycle in card view.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Use Phase 8 DataTable with columns: Status dot, Name, Project, Site, Codec, Resolution, Created, Actions ("...")
- D-02: Filters: Search + Status faceted filter (online/offline/degraded/connecting/reconnecting) + Site faceted filter + Project faceted filter -- all using Phase 8 DataTableFacetedFilter
- D-03: Client-side pagination (camera count per org is manageable)
- D-04: 4-column grid (desktop), responsive down to 2 (tablet) and 1 (mobile)
- D-05: Each card shows: placeholder/camera icon + status badge by default, camera name + status dot + site + "..." menu at bottom
- D-06: Hover behavior: start HLS player muted on hover, destroy on mouse leave -- IntersectionObserver limits max concurrent hover players
- D-07: Click card opens View Stream sheet (same as table row "View Stream" action)
- D-08: Actions in "..." dropdown: Edit, View Stream, Delete, Record (toggle Start/Stop), Embed Code -- 5 items total
- D-09: "Disable" action removed -- not needed
- D-10: Edit dialog includes Stream Profile selection (combined into one dialog, not separate action)
- D-11: Create Camera dialog also includes Stream Profile selection
- D-12: Record action shows as "Start Recording" / "Stop Recording" based on current state -- menu item changes label
- D-13: Delete = confirm AlertDialog, deletes camera only, keeps recordings (orphaned)
- D-14: Embed Code opens dialog (reuse existing EmbedCodeDialog)
- D-15: shadcn Sheet, side="right", 50% width (half-screen)
- D-16: 3 tabs: Preview, Policies, Activity (Embed Code tab removed -- available via quick actions)
- D-17: Preview tab: HLS player (auto-play muted) at top + camera info below
- D-18: Policies tab: reuse existing ResolvedPolicyCard component
- D-19: Activity tab: reuse AuditLogDataTable filtered to this camera
- D-20: Clicking different camera row/card while sheet is open switches the sheet content (no close/reopen needed)
- D-21: Toggle buttons (Table icon / Grid icon) in DataTable toolbar, right side next to Add Camera button
- D-22: Default view: Table view
- D-23: Filter/search bar shared between both views -- switching view preserves active filters
- D-24: View preference not persisted (always opens as table)
- D-25: Remove existing camera detail page (`/app/cameras/[id]` and `/admin/cameras/[id]`) -- all functionality moved to list page + sheet + dialogs

### Claude's Discretion
- Card hover preview implementation details (debounce timing, transition effects)
- IntersectionObserver max concurrent player count (4-6 range)
- HLS player buffer limits for hover preview
- Sheet transition animation
- Empty state design for no cameras
- Loading skeleton for table and card views
- Exact card dimensions and spacing

### Deferred Ideas (OUT OF SCOPE)
- Snapshot/thumbnail API for camera cards -- currently using placeholder, could add server-side snapshot capture later
- Camera disable/enable functionality -- decided not to implement for now
- View preference persistence (localStorage) -- decided to always open as table view
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAM-01 | User can view cameras in a data table with sort, filter, and pagination | DataTable system fully built (Phase 8). Column definition pattern established. Client-side sort/filter/pagination built-in. |
| CAM-02 | User can access camera actions via "..." menu (Edit, View Stream, Delete, Record, Embed Code) | DataTableRowActions component exists with RowAction interface. RecordingControls hook provides start/stop. EmbedCodeDialog ready. |
| CAM-03 | User can toggle between table view and card view with HLS live preview per card | HlsPlayer component exists with buffer limits. IntersectionObserver pattern documented below. View toggle is toolbar children. |
| CAM-04 | User can view stream in a slide-in sheet showing preview, Policies, Embed, and Activity | Sheet component exists (base-ui Dialog). ResolvedPolicyCard and AuditLogDataTable are reusable. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| @tanstack/react-table | (installed) | DataTable foundation | [VERIFIED: codebase] |
| hls.js | (installed) | HLS playback in browser | [VERIFIED: codebase - hls-player.tsx imports Hls] |
| lucide-react | (installed) | Icons | [VERIFIED: codebase] |
| sonner | (installed) | Toast notifications | [VERIFIED: codebase - recording-controls.tsx uses toast] |
| socket.io-client | (installed) | Real-time camera status | [VERIFIED: codebase - use-camera-status.ts] |

### No New Dependencies Required

All components and libraries needed for this phase are already present in the project. No `npm install` needed. [VERIFIED: UI-SPEC registry safety section confirms this]

## Architecture Patterns

### Recommended File Structure

```
apps/web/src/app/admin/cameras/components/
  cameras-columns.tsx          # NEW - column definitions ("use client")
  cameras-data-table.tsx       # NEW - DataTable wrapper + toolbar + view toggle
  camera-card-grid.tsx         # NEW - card view grid
  camera-card.tsx              # NEW - individual card with hover preview
  view-stream-sheet.tsx        # NEW - slide-in sheet with tabs
  camera-form-dialog.tsx       # MODIFY - add stream profile Select
  camera-status-badge.tsx      # REUSE as-is
  embed-code-dialog.tsx        # REUSE as-is
  hls-player.tsx               # REUSE as-is (or create lightweight variant)
  recording-controls.tsx       # REFERENCE for start/stop API calls

apps/web/src/components/pages/
  tenant-cameras-page.tsx      # OVERWRITE - new page orchestrator
```

[VERIFIED: codebase structure matches existing patterns from Phase 10 migrations]

### Pattern 1: Column Definition File (Established Convention)

**What:** Separate "use client" file that exports a `createXxxColumns(callbacks)` function returning `ColumnDef[]`.
**When to use:** Every DataTable migration.
**Source:** `stream-profiles-columns.tsx`, `api-keys-columns.tsx`, `webhooks-columns.tsx`, `users-columns.tsx`

```typescript
// Source: apps/web/src/components/stream-profiles/stream-profiles-columns.tsx [VERIFIED: codebase]
"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"

interface CamerasColumnCallbacks {
  onEdit: (camera: CameraRow) => void
  onViewStream: (camera: CameraRow) => void
  onDelete: (camera: CameraRow) => void
  onRecordToggle: (camera: CameraRow) => void
  onEmbedCode: (camera: CameraRow) => void
}

export function createCamerasColumns(
  callbacks: CamerasColumnCallbacks
): ColumnDef<CameraRow>[] {
  return [
    // ... column definitions with DataTableColumnHeader for sortable columns
    // ... actions column using DataTableRowActions
  ]
}
```

### Pattern 2: DataTable Toolbar Children

**What:** Custom toolbar content passed via `toolbar` prop, rendered in `ml-auto` container.
**When to use:** Adding view toggle and CTA button to toolbar.
**Source:** `data-table-toolbar.tsx` line 74 [VERIFIED: codebase]

```typescript
// The DataTable toolbar renders {children} in a ml-auto flex container
<DataTable
  toolbar={
    <>
      <ViewToggle view={view} onViewChange={setView} />
      <Button onClick={() => setCreateOpen(true)}>
        <Plus className="mr-2 size-4" />
        Add Camera
      </Button>
    </>
  }
/>
```

### Pattern 3: Controlled Sheet with Camera Switching (D-20)

**What:** Sheet open state and selected camera ID managed in parent. Changing camera ID re-renders sheet content without closing.
**When to use:** View Stream sheet.

```typescript
// Parent state
const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null)
const sheetOpen = selectedCameraId !== null

// On row click or card click
function handleViewStream(camera: CameraRow) {
  setSelectedCameraId(camera.id) // Opens or switches
}

// Sheet component reads selectedCameraId as key for internal data fetching
<Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) setSelectedCameraId(null) }}>
  <SheetContent side="right" className="w-full md:w-1/2">
    {selectedCameraId && <ViewStreamContent cameraId={selectedCameraId} />}
  </SheetContent>
</Sheet>
```

### Pattern 4: Sheet Width Override

**What:** The default Sheet `sm:max-w-sm` must be overridden for the 50% width requirement.
**When to use:** View Stream sheet (D-15).
**Note:** The Sheet component's `SheetContent` has a default `data-[side=right]:sm:max-w-sm` class. Override with `className="w-full md:w-1/2 sm:max-w-none"`. [VERIFIED: sheet.tsx line 56]

### Pattern 5: HLS Hover Preview with IntersectionObserver

**What:** Lightweight HLS player that starts on hover, destroys on leave, with concurrent instance cap.
**When to use:** Card view hover preview (D-06).

```typescript
// Shared ref counter for concurrent players
const activePlayersRef = useRef(0)
const MAX_CONCURRENT = 6

function useHoverPreview(src: string) {
  const [shouldPlay, setShouldPlay] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const onMouseEnter = () => {
    timerRef.current = setTimeout(() => {
      if (activePlayersRef.current < MAX_CONCURRENT) {
        activePlayersRef.current++
        setShouldPlay(true)
      }
    }, 300) // D-06: 300ms debounce
  }

  const onMouseLeave = () => {
    clearTimeout(timerRef.current)
    if (shouldPlay) {
      activePlayersRef.current--
      setShouldPlay(false)
    }
  }

  return { shouldPlay, onMouseEnter, onMouseLeave }
}
```

### Pattern 6: Real-time Status Updates via Socket.IO

**What:** The `useCameraStatus` hook connects to Socket.IO `/camera-status` namespace and emits `camera:status` events.
**When to use:** Camera list page -- update camera status in real time.
**Source:** `hooks/use-camera-status.ts` [VERIFIED: codebase]

The hook requires `orgId` from the auth session. The current `tenant-cameras-page.tsx` already fetches this via `authClient.getSession()`. The new page must preserve this pattern.

### Anti-Patterns to Avoid

- **Creating HLS instances without cleanup:** Every `new Hls()` must have a corresponding `hls.destroy()` in the cleanup function. Failure causes memory leaks that accumulate in card view. [VERIFIED: existing hls-player.tsx handles this correctly]
- **Mounting HLS player on invisible cards:** Cards scrolled out of viewport should NOT have active HLS instances. Use IntersectionObserver to enforce this.
- **Closing and reopening Sheet on camera switch:** Per D-20, changing cameras should NOT unmount the Sheet. Use controlled state with `selectedCameraId`.
- **Using server-side pagination for cameras:** Per D-03, use client-side pagination. Do NOT pass `pageCount` prop to DataTable (that triggers server-side mode).
- **Building custom action menu:** Use the existing `DataTableRowActions` component with `RowAction[]` interface. Do NOT build a new dropdown from scratch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table sort/filter/pagination | Custom table logic | DataTable + @tanstack/react-table | Already handles client-side mode automatically [VERIFIED: data-table.tsx] |
| Row actions menu | Custom DropdownMenu per row | DataTableRowActions | Handles destructive/non-destructive separation, separator, icons [VERIFIED: data-table-row-actions.tsx] |
| Faceted filters | Custom multi-select filter | DataTableFacetedFilter | Already works with column filter state [VERIFIED: data-table-faceted-filter.tsx] |
| HLS playback | Custom video element management | Existing HlsPlayer component | Handles retry, error, live/vod modes, withCredentials [VERIFIED: hls-player.tsx] |
| Status indicators | Custom colored dots | CameraStatusBadge/CameraStatusDot | Already styled for all 5 states [VERIFIED: camera-status-badge.tsx] |
| Embed code dialog | New embed dialog | EmbedCodeDialog | Already has iframe/hls.js/React tabs [VERIFIED: embed-code-dialog.tsx] |
| Policy display | New policy card | ResolvedPolicyCard | Fetches resolved policy by cameraId, shows source levels [VERIFIED: resolved-policy-card.tsx] |
| Audit log | New log table | AuditLogDataTable with apiUrl prop | Already supports custom `apiUrl` prop for filtering [VERIFIED: audit-log-data-table.tsx] |
| Recording toggle | Custom start/stop | startRecording/stopRecording from use-recordings | Existing utility functions [VERIFIED: use-recordings.ts] |
| Real-time status | Custom WebSocket | useCameraStatus hook | Already handles Socket.IO connection lifecycle [VERIFIED: use-camera-status.ts] |

**Key insight:** This phase is primarily a composition exercise. Nearly every building block exists. The new code orchestrates existing components into a new layout.

## Common Pitfalls

### Pitfall 1: HLS Memory Leak in Card View
**What goes wrong:** Each hls.js instance buffers video data. With 20+ cards visible, browser runs out of memory and crashes.
**Why it happens:** hls.js default `maxBufferLength` is 30 seconds, `backBufferLength` is unlimited.
**How to avoid:** For hover previews, use `maxBufferLength: 4`, `backBufferLength: 0`. Destroy instances immediately on mouse leave. Cap concurrent instances at 6 via shared ref counter.
**Warning signs:** Tab memory exceeding 500MB, video frame drops, browser "Aw, Snap!" page.

### Pitfall 2: Sheet Width Override Not Taking Effect
**What goes wrong:** Sheet stays at default `max-w-sm` (~384px) instead of 50% width.
**Why it happens:** The base Sheet component applies `data-[side=right]:sm:max-w-sm` which overrides custom width classes.
**How to avoid:** Pass `className="w-full md:w-1/2 sm:max-w-none"` to SheetContent to reset the max-width constraint.
**Warning signs:** Sheet appears too narrow on desktop.

### Pitfall 3: Stale Camera Data in Sheet After Status Change
**What goes wrong:** Sheet shows old camera status while the table row shows updated status.
**Why it happens:** Sheet content uses its own state copy instead of reading from the same data source as the table.
**How to avoid:** Pass the camera object from the parent cameras array (which is updated by `useCameraStatus`) rather than fetching separately. Or ensure the sheet also subscribes to status updates.
**Warning signs:** Status dot in sheet differs from status dot in table row.

### Pitfall 4: Faceted Filter Column ID Mismatch
**What goes wrong:** Faceted filters don't work -- clicking filter options has no effect.
**Why it happens:** The `columnId` in `FacetedFilterConfig` doesn't match the column's `accessorKey` or `id` in the column definition.
**How to avoid:** Ensure faceted filter `columnId` exactly matches the column `accessorKey` (e.g., "status", "site", "project"). For nested data like `site.name`, use a computed `accessorFn` with a matching `id`.
**Warning signs:** Filter chip shows selected count but table data doesn't change.

### Pitfall 5: Card Click Bubbles to Action Menu
**What goes wrong:** Clicking the "..." menu on a card also triggers the card's onClick (opening the sheet).
**Why it happens:** Event bubbling -- the card has an onClick handler, and the menu button is inside the card.
**How to avoid:** Add `e.stopPropagation()` on the "..." button click handler.
**Warning signs:** Sheet opens every time you try to use the action menu on a card.

### Pitfall 6: AuditLogDataTable apiUrl for Camera Filtering
**What goes wrong:** Activity tab in sheet shows all audit logs, not filtered to the selected camera.
**Why it happens:** The `AuditLogDataTable` component accepts an `apiUrl` prop (default: `/api/audit-log`). Need to pass camera-specific URL.
**How to avoid:** Pass `apiUrl={`/api/audit-log?cameraId=${cameraId}`}` or whatever the backend API supports for camera-scoped audit logs. Verify the backend endpoint supports this filter parameter.
**Warning signs:** Activity tab shows unrelated audit entries.

## Code Examples

### Camera Column Definition Pattern

```typescript
// Source: Pattern from stream-profiles-columns.tsx [VERIFIED: codebase]
"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader, DataTableRowActions, type RowAction } from "@/components/ui/data-table"
import { CameraStatusDot } from "./camera-status-badge"

export interface CameraRow {
  id: string
  name: string
  status: "online" | "offline" | "degraded" | "connecting" | "reconnecting"
  isRecording: boolean
  streamUrl: string
  codecInfo?: { video?: string; width?: number; height?: number } | null
  streamProfileId?: string | null
  site?: { id: string; name: string; project?: { id: string; name: string } }
  createdAt: string
}

// Column with accessorFn for nested data (site name, project name)
{
  id: "project",
  accessorFn: (row) => row.site?.project?.name ?? "",
  header: ({ column }) => <DataTableColumnHeader column={column} title="Project" />,
  cell: ({ row }) => <span className="text-muted-foreground text-sm">{row.getValue("project") || "-"}</span>,
  filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
}
```

### Hover Preview Lightweight HLS Player

```typescript
// Derived from existing hls-player.tsx [VERIFIED: codebase]
// Key differences: no controls, no retry, minimal buffer, immediate destroy

function HoverPreviewPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        maxBufferLength: 4,
        backBufferLength: 0,
        lowLatencyMode: true,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 5,
        xhrSetup: (xhr: XMLHttpRequest) => { xhr.withCredentials = true },
      })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
      })
      hlsRef.current = hls
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [src])

  return <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
}
```

### Recording Toggle in Row Actions

```typescript
// Source: recording-controls.tsx patterns [VERIFIED: codebase]
import { startRecording, stopRecording } from "@/hooks/use-recordings"

// In row action definition:
{
  label: camera.isRecording ? "Stop Recording" : "Start Recording",
  icon: Circle,
  onClick: async (cam) => {
    try {
      if (cam.isRecording) {
        await stopRecording(cam.id)
        toast.success("Recording stopped")
      } else {
        await startRecording(cam.id)
        toast.success("Recording started")
      }
      refreshCameras()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recording action failed")
    }
  },
}
```

### Sheet with Camera Switching

```typescript
// New pattern for this phase
<Sheet open={!!selectedCameraId} onOpenChange={(open) => { if (!open) setSelectedCameraId(null) }}>
  <SheetContent side="right" className="w-full md:w-1/2 sm:max-w-none p-0 flex flex-col">
    <SheetHeader className="p-4 border-b">
      <SheetTitle>{selectedCamera?.name}</SheetTitle>
      <SheetDescription>
        {selectedCamera?.site?.name} &gt; {selectedCamera?.site?.project?.name}
      </SheetDescription>
    </SheetHeader>
    <Tabs defaultValue="preview" className="flex-1 flex flex-col">
      <TabsList className="mx-4">
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="policies">Policies</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="preview" className="flex-1 overflow-y-auto p-4">
        {/* HlsPlayer + camera info */}
      </TabsContent>
      <TabsContent value="policies" className="flex-1 overflow-y-auto p-4">
        <ResolvedPolicyCard cameraId={selectedCameraId!} />
      </TabsContent>
      <TabsContent value="activity" className="flex-1 overflow-y-auto p-4">
        <AuditLogDataTable apiUrl={`/api/audit-log?cameraId=${selectedCameraId}`} />
      </TabsContent>
    </Tabs>
  </SheetContent>
</Sheet>
```

## State of the Art

| Old Approach (current page) | New Approach (this phase) | Impact |
|-------------------------------|---------------------------|--------|
| Plain HTML table without sorting | DataTable with TanStack sort/filter/pagination | Full CAM-01 compliance |
| Custom Popover-based status filter | DataTableFacetedFilter with multi-select | Consistent with all other pages |
| Camera detail page (separate route) | View Stream sheet (slide-in panel) | No navigation away from list; faster context switch |
| No card view | Card grid with hover HLS preview | Visual camera monitoring at a glance |
| Edit on detail page with inline fields | Edit via dialog from quick actions | Consistent with Phase 10 patterns |
| Status updates via polling | Socket.IO real-time (already exists) | No change needed, just preserve |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Backend `/api/audit-log` supports `?cameraId=X` query parameter for filtering | Code Examples (Activity tab) | Activity tab would show all org logs instead of camera-specific; need backend change |
| A2 | Backend `/api/cameras` returns `isRecording` field for each camera | Code Examples (Record toggle) | Cannot show correct record toggle label; need to check recording status separately |
| A3 | The `CameraFormDialog` can be extended to support edit mode (pre-filled fields + PATCH/PUT) | Architecture Patterns | Currently only supports create; may need more significant rework for edit mode |

## Open Questions

1. **Audit log camera filter**
   - What we know: `AuditLogDataTable` accepts `apiUrl` prop. Current page uses it at `/api/audit-log`.
   - What's unclear: Whether the backend audit log API supports filtering by `cameraId` query param.
   - Recommendation: Verify the endpoint; if not supported, the activity tab can be deferred or show all logs with a note.

2. **Camera form edit mode**
   - What we know: `CameraFormDialog` currently only supports create (POST to `/api/sites/{siteId}/cameras`).
   - What's unclear: The detail page has inline edit fields -- the dialog needs to be extended for edit mode (pre-fill + PATCH).
   - Recommendation: Extend `CameraFormDialog` with optional `camera` prop. When present, pre-fill fields and use PATCH on submit.

3. **Stream URL for HLS playback in card hover**
   - What we know: The detail page constructs HLS URLs as `${API_BASE}/api/cameras/${id}/stream/index.m3u8`.
   - What's unclear: Whether the list API returns enough info to construct HLS URLs, or if a separate endpoint is needed.
   - Recommendation: Construct URL from camera ID + API base. The pattern is already established in the detail page.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3 |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/web && npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAM-01 | Camera DataTable renders with sort, filter, pagination | unit | `cd apps/web && npx vitest run src/__tests__/cameras-data-table.test.tsx -x` | Wave 0 |
| CAM-02 | Quick actions menu renders correct items, record toggles label | unit | `cd apps/web && npx vitest run src/__tests__/cameras-row-actions.test.tsx -x` | Wave 0 |
| CAM-03 | Card view renders grid, hover preview lifecycle | unit | `cd apps/web && npx vitest run src/__tests__/camera-card-grid.test.tsx -x` | Wave 0 |
| CAM-04 | View Stream sheet opens, switches cameras, shows tabs | unit | `cd apps/web && npx vitest run src/__tests__/view-stream-sheet.test.tsx -x` | Wave 0 |

### Sampling Rate

- **Per task commit:** `cd apps/web && npx vitest run --reporter=verbose`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/web/src/__tests__/cameras-data-table.test.tsx` -- covers CAM-01 (table renders, sorts, filters)
- [ ] `apps/web/src/__tests__/cameras-row-actions.test.tsx` -- covers CAM-02 (action menu items, record label toggle)
- [ ] `apps/web/src/__tests__/camera-card-grid.test.tsx` -- covers CAM-03 (grid renders, hover behavior mock)
- [ ] `apps/web/src/__tests__/view-stream-sheet.test.tsx` -- covers CAM-04 (sheet open/close, tab switching)

Note: HLS playback cannot be tested in jsdom (no MediaSource). Tests should mock `Hls.isSupported()` to return false and verify the component handles that path. Visual HLS testing requires manual browser validation.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Session already enforced by layout guards |
| V3 Session Management | No | Existing session middleware handles this |
| V4 Access Control | Yes (existing) | Camera API already scoped to org via RLS + auth middleware |
| V5 Input Validation | Yes | Camera form uses existing field validation; stream URL input should be validated |
| V6 Cryptography | No | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| HLS URL leakage via embed code | Information Disclosure | Session-based playback URLs with TTL (existing) |
| XSS via camera name in sheet/table | Tampering | React auto-escapes JSX output (built-in) |
| IDOR on camera actions (edit/delete) | Elevation of Privilege | Backend RLS ensures org scoping (existing) |

No new security concerns introduced by this phase. All API endpoints are existing and already protected.

## Sources

### Primary (HIGH confidence)
- **Codebase verification** -- All component files, hooks, and patterns verified by direct file reads
  - `apps/web/src/components/ui/data-table/` -- DataTable system (7 files)
  - `apps/web/src/app/admin/cameras/components/` -- Existing camera components (6 files)
  - `apps/web/src/components/ui/sheet.tsx` -- Sheet component (base-ui Dialog)
  - `apps/web/src/hooks/use-camera-status.ts` -- Socket.IO status hook
  - `apps/web/src/hooks/use-recordings.ts` -- Recording start/stop utilities
  - `apps/web/src/components/audit/audit-log-data-table.tsx` -- Audit log DataTable
  - `apps/web/src/app/admin/policies/components/resolved-policy-card.tsx` -- Policy card
  - `apps/web/src/components/stream-profiles/stream-profiles-columns.tsx` -- Column definition reference pattern

### Secondary (MEDIUM confidence)
- **Phase 11 UI-SPEC** -- `.planning/phases/11-camera-management/11-UI-SPEC.md` -- Detailed visual and interaction contract
- **Phase 11 CONTEXT** -- `.planning/phases/11-camera-management/11-CONTEXT.md` -- 25 locked decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already installed and verified in codebase
- Architecture: HIGH -- patterns directly observed from Phase 10 migrations and existing column files
- Pitfalls: HIGH -- HLS memory concerns well-documented in STATE.md blockers, Sheet width issue verified from component source

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable -- primarily frontend composition, no external dependency changes expected)
