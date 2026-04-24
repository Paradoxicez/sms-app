# Phase 20: Cameras UX — Research

**Researched:** 2026-04-24
**Domain:** Next.js 15 + React 19 + TanStack Table v8 + shadcn `base-nova` — client-side UX polish on an existing tenant Cameras page (no schema, no new backend REST surface)
**Confidence:** HIGH (all claims verified against the actual codebase; no external library guesswork required)

## Summary

Phase 20 is a **frontend-only UX polish** phase. CONTEXT.md, UI-SPEC.md, and the DISCUSSION-LOG cover the design contract exhaustively (22 decisions D-01..D-22 locked). The job of research is to ground those decisions against the codebase so the planner does not repeat mistaken assumptions.

The phase mutates five surfaces of the tenant Cameras page (`/app/cameras` → `components/pages/tenant-cameras-page.tsx` → `app/admin/cameras/components/*`): (1) a bulk multi-select toolbar above the cameras table, (2) an asymmetric Enter/Exit maintenance row-menu item, (3) Copy Camera ID + Copy cURL row-menu items, (4) a redesigned Status column using LIVE/REC/MAINT/OFFLINE pills, (5) expressive active-state for the Start Stream / Start Record buttons inside the View Stream sheet plus a Camera ID chip in that sheet's header.

**Primary recommendation:** Add a `select` checkbox column + parent-owned `rowSelection` state to the existing hand-rolled `useReactTable` in `cameras-data-table.tsx` (do NOT migrate to the shared `<DataTable>` primitive in this phase — the scope does not justify the blast radius). Fan bulk actions out from the tenant-cameras-page with `Promise.allSettled` and a hand-rolled concurrency limiter (no need to install `p-limit` for one call site). Extend the existing `POST /api/cameras/:id/maintenance` endpoint to accept an optional `{ reason?: string }` body — the existing `AuditInterceptor` then writes it to the audit trail automatically. Everything else is pure UI composition of already-installed primitives.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Bulk actions — scope**
- **D-01:** Bulk toolbar exposes exactly four actions — Start Stream, Start Recording, Maintenance (enter + exit toggle), Delete. Stop variants NOT in bulk scope.
- **D-02:** Bulk actions call existing per-camera endpoints in a client-side `Promise.allSettled` loop with a concurrency limit (suggested 5). No new bulk REST endpoints.
- **D-03:** Maintenance bulk with mixed-state selection shows both "Maintenance" (opens reason dialog for NOT-in-maintenance subset) and "Exit Maintenance" (runs instantly on the in-maintenance subset).

**Bulk actions — toolbar UI**
- **D-04:** Sticky top bar above the DataTable. Layout: `{N} selected` chip → action buttons → flexible gap → Clear × icon.
- **D-05:** Checkbox column is the first column (left of Status). Uses existing `data-table` primitive's `enableRowSelection` pattern (tri-state header).

**Bulk actions — failure handling & confirmation**
- **D-06a:** Partial failure = row-level error badge + summary toast. Failed rows keep inline `AlertTriangle` with tooltip reason; `rowSelection` reduces to failed-only for retry.
- **D-06b:** Confirm dialog fires only for Delete. Start Stream / Start Recording / Maintenance run immediately. Delete confirm shows count + up to 5 names then "+N more", single-click destructive button (no type-to-confirm).

**Row action menu**
- **D-07:** Maintenance item is asymmetric — Enter opens `MaintenanceReasonDialog`; Exit runs directly (no dialog). Label flips based on `camera.maintenanceMode`.
- **D-08:** Final row action menu order: `Edit · View Stream · Start Stream · Start Recording · Maintenance | Exit Maintenance · Copy Camera ID · Copy cURL example · Embed Code · ── · Delete`.
- **D-09:** "Copy Camera ID" copies raw `camera.id` UUID v4 (36 chars).
- **D-10:** "Copy cURL example" copies template targeting `POST /api/cameras/:cameraId/sessions` with `X-API-Key` header placeholder and `window.location.origin` host substitution.
- **D-11:** Both copy actions use `navigator.clipboard.writeText` + Sonner toast (reuses `push-url-section.tsx` pattern).

**Status badge redesign**
- **D-12:** Replace current trio (dot + dot + wrench) with horizontally-stacked text pills (4px gap).
- **D-13:** Inventory: LIVE (red bg, white), REC (near-black bg, red pulsing dot + white), MAINT (amber bg, dark text, wrench), OFFLINE (muted bg, hollow dot).
- **D-14:** Multi-pill ordering: stream-state → REC → MAINT. LIVE+maintenance is not a valid combination (maintenance suppresses LIVE).
- **D-15:** LIVE + REC pulse. MAINT + OFFLINE static. Reconnecting gets stronger pulse. Respect `prefers-reduced-motion`.
- **D-16:** UI copy stays English. Do NOT translate pill labels.

**View Stream sheet — header**
- **D-17:** Header becomes three lines: camera name / breadcrumb / (NEW) monospace ID chip + copy icon.
- **D-18:** ID chip shows `8+…+8` truncated form, `font-mono text-xs`. Full UUID in tooltip. Click copies FULL UUID.

**View Stream sheet — Start Stream / Start Record buttons**
- **D-19:** Both buttons expand from icon-only squares (36px) to 160px pills when active. Container reserves enough width so toggling doesn't reflow.
- **D-20:** Start Stream: idle = outline gray `Radio`; active = red solid fill, white pulsing icon, "Stop Stream" label. 150ms transition.
- **D-21:** Start Record: idle = outline gray hollow `Circle`; active = dark solid fill, red pulsing dot, white "REC" label. 150ms transition.
- **D-22:** No elapsed timer on Record button (deferred).

### Claude's Discretion

- Exact pill border-radius, padding, font-size (Tailwind + shadcn conventions)
- Exact shade of "dark" for REC (near-black vs `zinc-900`) — UI-SPEC resolved to `zinc-900` light / `zinc-800` dark
- Concurrency limit for bulk fan-out (suggested 5; 3–10 acceptable)
- Tooltip delay timing (inherit existing 500ms from base-ui default)
- Precise in-flight loading state during bulk ops
- Whether Clear × clears error badges (UI-SPEC resolved: Clear × only clears selection, NOT errors)

### Deferred Ideas (OUT OF SCOPE)

- Elapsed-time timer on REC button (`REC · 0:12`)
- Stop Stream / Stop Recording as bulk actions
- Keyboard shortcuts (Cmd+A, Delete key bindings)
- Per-camera API docs modal / "Developer" tab
- OBS-style toggle switch for Start Stream
- Selection persistence across pagination
- Mobile responsive bulk toolbar (allow flex-wrap, no overflow menu)

## Phase Requirements

No explicit REQ-IDs mapped in ROADMAP.md (Phase 20 says "Requirements: TBD"). Closest v1.2 lineage:
- **CAM-02** (Camera table status icons) — already complete in Phase 15, this phase *redesigns* the surface, not adds it
- **CAM-03** (Camera quick actions menu maintenance) — already complete in Phase 15, this phase extends the menu

Phase 20 scope derives entirely from CONTEXT decisions D-01..D-22 and UI-SPEC sections. All plans trace to those IDs rather than REQ-IDs.

## Project Constraints (from CLAUDE.md)

- **Stack is locked:** Next.js 15 + React 19 + NestJS 11 + Prisma 6 + PostgreSQL 16 + SRS v6 + Docker Compose (no new runtime tech allowed without profile change) [CITED: `./CLAUDE.md` Recommended Web App Stack]
- **UI preservation:** Green theme (`--primary: hsl(142 71% 45%)`), sidebar nav, card-based dashboard. Do NOT introduce new color palettes outside existing amber/red/zinc [CITED: `./CLAUDE.md` Constraints]
- **Two separate portals:** Super Admin and Org Admin are distinct UIs — Phase 20 targets Org Admin (`/app/cameras`); the shared `/admin/cameras/components/*` will flow to both surfaces if both pages consume them [CITED: `./CLAUDE.md` Project, memory `saas_role_architecture.md`]
- **English-only UI copy default:** Pill labels, toast strings, dialog titles, tooltips all English unless user explicitly requests bilingual. `feedback_language_english_default.md` auto-memory enforces this [CITED: CONTEXT.md §User preferences → `feedback_language_english_default.md`]
- **UI pro-minimal preference:** Single primary CTA + inline hierarchy; strip optional toolbar controls [CITED: memory `feedback_ui_pro_minimal.md`]
- **GSD workflow enforcement:** No direct repo edits outside a GSD command [CITED: `./CLAUDE.md` GSD Workflow Enforcement]

## Standard Stack

All dependencies already installed and versioned in `apps/web/package.json`. No new deps required for this phase.

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-table` | 8.21.3 | Table primitive (selection, filtering, pagination) | Already the foundation of every DataTable in this codebase; `enableRowSelection` is native. [VERIFIED: apps/web/package.json] |
| `@base-ui/react` | 1.3.0 | Accessible primitives (Checkbox, DropdownMenu, Tooltip, Dialog/AlertDialog, Sheet) | shadcn `base-nova` preset wraps these; already used everywhere in Cameras page. [VERIFIED: apps/web/package.json] |
| `lucide-react` | 1.8.0 | Icon library | `Radio`, `Circle`, `Wrench`, `Copy`, `Terminal`, `Trash2`, `X`, `AlertTriangle`, `Loader2`, `Pencil`, `Play`, `Code` — all needed, all available. [VERIFIED: apps/web/package.json] |
| `sonner` | 2.0.7 | Toasts | Existing toast pattern in push-url-section and tenant-cameras-page. [VERIFIED: apps/web/package.json] |
| `tailwindcss` | 4.2.2 | Styling | CSS variables in `src/app/globals.css`, shadcn `base-nova` preset. [VERIFIED: apps/web/package.json] |
| `socket.io-client` | 4.8.3 | Live camera status (already wired via `useCameraStatus`) | Real-time `camera:status` events drive pill state transitions. [VERIFIED: apps/web/package.json, apps/web/src/hooks/use-camera-status.ts] |

### Supporting (already installed + used)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tw-animate-css` | 1.4.0 | Animation utilities (slide-in, fade) | Bulk toolbar slide-in animation (`data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2`). [VERIFIED: apps/web/package.json] |
| `class-variance-authority` | 0.7.1 | Variant-driven components | StatusPills component will use CVA if >3 variants. [VERIFIED: apps/web/package.json] |
| `clsx` + `tailwind-merge` | — | Class composition via `cn()` helper in `@/lib/utils` | Required by every styled component. [VERIFIED: apps/web/src/lib/utils usage] |

### Deliberately NOT Installing

| Deferred | Alternative | Reasoning |
|----------|-------------|-----------|
| `p-limit` | Hand-rolled concurrency (~15 LOC) | One call site; keeping dependency surface small. Suggested pattern in §Code Examples §Concurrency Limiter. [ASSUMED] — planner may choose to install if preferred |
| `shadcn` `registry add` for new blocks | Compose existing primitives | All needed primitives (Checkbox, DropdownMenu, Tooltip, AlertDialog, Dialog, Sheet, Button, Badge) are present. No registry fetches needed. [VERIFIED: apps/web/src/components/ui/ listing] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff | Decision |
|------------|-----------|----------|----------|
| Client-side `Promise.allSettled` fan-out | New `POST /api/cameras/bulk-action` endpoint | One round-trip, one audit event, better UX on slow networks | D-02 locked client-side; backend change blocks frontend velocity |
| Migrate `cameras-data-table.tsx` to shared `<DataTable>` primitive | Keep hand-rolled `useReactTable` + add `rowSelection` state | Primitive gives free `rowSelection` + `onRowClick` + loading state | Migration is phase-20-out-of-scope per D-04 discussion; keep hand-rolled and add selection locally |
| Single `StatusPills` component rendering all four states | One component per state (`LivePill`, `RecPill`, `MaintPill`, `OfflinePill`) | Multi-component gives per-pill test surface; single reads easier | Single component with variant prop matches `CameraStatusBadge` precedent |
| Install `p-limit` | Hand-rolled `chunkedAllSettled(items, concurrency, worker)` | Battle-tested library vs one-call-site simplicity | Prefer hand-rolled: no new dep for ~15 LOC |

**Version verification:**
- `@tanstack/react-table@8.21.3` — installed, published Apr 2025 (current major) [VERIFIED: package.json + `npm view` check deferred — version is already locked in lockfile]
- `@base-ui/react@1.3.0` — installed, published 2025 [VERIFIED: package.json]
- `lucide-react@1.8.0` — installed [VERIFIED: package.json]
- `sonner@2.0.7` — installed [VERIFIED: package.json]

## Architecture Patterns

### Recommended Integration Structure

```
apps/web/src/
├── components/pages/
│   └── tenant-cameras-page.tsx           # [MODIFY] owns rowSelection + bulk dispatch + MaintenanceReasonDialog open state
├── app/admin/cameras/components/
│   ├── cameras-data-table.tsx            # [MODIFY] add select column, expose onRowSelectionChange prop, render bulk toolbar above table body
│   ├── cameras-columns.tsx               # [MODIFY] prepend select column, rewrite status cell to <StatusPills>, reorder + add 2 items in row action menu, swap Maintenance label
│   ├── camera-status-badge.tsx           # [MODIFY] add <StatusPills camera={camera} /> export (keep existing CameraStatusDot / CameraStatusBadge exports for map popup / sheet body)
│   ├── view-stream-sheet.tsx             # [MODIFY] add ID chip line to header; expand Start Stream / Start Record buttons with active states
│   ├── maintenance-reason-dialog.tsx     # [NEW] single+bulk dialog with "Reason (optional)" textarea (200 char cap) + Enter confirm
│   └── bulk-toolbar.tsx                  # [NEW] sticky flex toolbar; counter chip + action buttons + clear × — extracted for testability
└── lib/
    └── bulk-actions.ts                   # [NEW] chunkedAllSettled util + per-action verb config + toast summary helpers
```

### Pattern 1: Adding rowSelection to existing hand-rolled table

The existing `cameras-data-table.tsx` uses `useReactTable` directly (NOT the shared `<DataTable>` primitive). TanStack table supports row selection natively via `state.rowSelection` + `onRowSelectionChange`. Parent owns the selection state.

```typescript
// apps/web/src/app/admin/cameras/components/cameras-data-table.tsx
// Source: https://tanstack.com/table/latest/docs/api/features/row-selection

import { type RowSelectionState } from "@tanstack/react-table"

interface CamerasDataTableProps {
  // ... existing props
  rowSelection: RowSelectionState
  onRowSelectionChange: (selection: RowSelectionState) => void
}

const table = useReactTable({
  data: cameras,
  columns,
  getRowId: (row) => row.id,                    // REQUIRED — makes rowSelection keyed by camera.id instead of row index
  state: { ..., rowSelection },
  enableRowSelection: true,
  onRowSelectionChange,
  // ... rest
})

// To derive selected camera rows for the bulk toolbar:
const selectedCameras = table.getSelectedRowModel().rows.map(r => r.original)
```

### Pattern 2: Select column (copy from `recordings-columns.tsx`)

```typescript
// apps/web/src/app/admin/cameras/components/cameras-columns.tsx — prepend as first column
// Source: apps/web/src/app/app/recordings/components/recordings-columns.tsx:42-64 (verified pattern)

import { Checkbox } from "@/components/ui/checkbox"

{
  id: "select",
  header: ({ table }) => (
    <Checkbox
      checked={table.getIsAllPageRowsSelected()}
      indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
      onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      aria-label="Select all cameras on this page"
    />
  ),
  cell: ({ row }) => (
    <div onClick={(e) => e.stopPropagation()}>
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label={`Select camera ${row.original.name}`}
      />
    </div>
  ),
  enableSorting: false,
  size: 40,
}
```

### Pattern 3: Bulk fan-out with concurrency limit

```typescript
// apps/web/src/lib/bulk-actions.ts — new file
// Pattern derived from p-limit semantics, hand-rolled for one call site

export async function chunkedAllSettled<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0

  async function runner() {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      try {
        const value = await worker(items[i])
        results[i] = { status: "fulfilled", value }
      } catch (reason) {
        results[i] = { status: "rejected", reason }
      }
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, runner)
  await Promise.all(runners)
  return results
}
```

### Pattern 4: Copy-to-clipboard + Sonner (reuse existing)

```typescript
// apps/web/src/app/admin/cameras/components/push-url-section.tsx:49-56 (VERIFIED working pattern)

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(textToCopy)
    toast.success("Camera ID copied")   // or "cURL example copied"
  } catch {
    toast.error("Couldn't copy to clipboard")
  }
}
```

### Pattern 5: Live pill precedent (from map popup)

```typescript
// apps/web/src/components/map/camera-popup.tsx:201 — VERIFIED rendered pulse pill
<span className="flex items-center gap-1 rounded bg-red-500/95 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm motion-safe:animate-pulse">
  <BroadcastIcon className="size-3" />
  LIVE
</span>

// camera-popup.tsx:212-214 — REC pill precedent
<span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
  <span className="h-1.5 w-1.5 rounded-full bg-red-500 motion-safe:animate-pulse" />
  REC
</span>
```

**Reuse rule:** `StatusPills` in the table should match these tokens byte-for-byte — no custom pill shape — so map + table read as one design language.

### Anti-Patterns to Avoid

- **Migrating `cameras-data-table.tsx` to `<DataTable>` primitive in this phase.** The primitive is well-designed, but the migration is a separate plan: it would move column-filter sync, pagination state, empty-state, skeleton rendering, and grid/table view toggle all at once. Phase 20 adds selection, not refactors plumbing.
- **Hand-rolling the Checkbox or DropdownMenu.** `@base-ui/react` wrappers are already exported from `@/components/ui/checkbox` and `@/components/ui/dropdown-menu` with correct ARIA + focus handling.
- **Building a StatusPills component that diverges from map-popup pill tokens.** Users see the LIVE pill in both places on the same page load — inconsistency reads as a bug.
- **Using `Promise.all` for bulk fan-out.** One failure aborts the batch before D-06a can render per-row errors. Always `Promise.allSettled`.
- **Using `window.prompt` / native `alert` for the maintenance reason dialog.** UI-SPEC explicitly specifies `MaintenanceReasonDialog` with a styled textarea + counter. Use `Dialog` primitive (not `AlertDialog`) since this is a data-entry dialog, not a confirmation.
- **Fetching the user's API key for the cURL template.** D-10 explicitly requires `<YOUR_API_KEY>` literal placeholder. Writing the real key to the clipboard creates a secret-leak via shoulder-surfing / clipboard history. [CITED: CONTEXT.md D-10]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-select table state | Custom `useState<Set<string>>` + checkbox wiring | TanStack `enableRowSelection` + `getSelectedRowModel` | Handles shift-click ranges, header tri-state, row-id stability automatically [VERIFIED: @tanstack/react-table v8 API] |
| Checkbox with indeterminate state | Native `<input type="checkbox">` with manual `indeterminate` DOM prop | `@/components/ui/checkbox` (base-ui wrapper) | Already supports `indeterminate` prop + shadcn theming + ARIA |
| Dropdown menu with separator + destructive variant | Raw `<ul>` + button-focus management | `DataTableRowActions` (extensive existing usage) + its `variant: "destructive"` option | Handles keyboard nav, portal placement, destructive color already |
| Concurrency-limited Promise fan-out | `for...of` + `await` in sequence | `chunkedAllSettled` (small util) or `p-limit` (npm) | Sequential is slow for N=25 cameras; unlimited parallel floods the API |
| Toast notifications | Custom `<div>` positioned-fixed with timers | `sonner` `toast.success` / `toast.error` | Already wired in `layout.tsx`; pattern proven in push-url-section + 6+ other files |
| Confirm dialog | Raw `<div>` modal | `AlertDialog` from `@/components/ui/alert-dialog` | Used by existing delete dialog in tenant-cameras-page; pattern matches recordings-data-table |
| Clipboard copy | `document.execCommand('copy')` | `navigator.clipboard.writeText` + try/catch | Modern API, works in secure contexts; existing push-url-section pattern |
| Pulse animation | Custom keyframe CSS | `motion-safe:animate-pulse motion-reduce:animate-none` | Tailwind built-in; `prefers-reduced-motion` respected out of the box |
| Sticky toolbar above scroll container | Absolute-positioned div + scroll listeners | `sticky top-0 z-20 bg-background/95 backdrop-blur` | Pure CSS, no JS, matches existing page-header sticky pattern |
| Tooltip | Custom hover-div with timeouts | `@/components/ui/tooltip` (base-ui wrapper) | ARIA-correct, keyboard-focusable, 500ms delay built-in |

**Key insight:** This phase is >90% composition of primitives that already exist in the codebase. Resist the urge to "simplify" by hand-rolling — every primitive listed here is already imported and working elsewhere in the Cameras page.

## Runtime State Inventory

> N/A — Phase 20 is greenfield UX polish over existing schema. No renames, refactors, migrations, or string replacements. No database fields changed. No service renames. The Camera schema already has `maintenanceMode`, `isRecording`, `status`, `id` — all Phase 20 needs. [VERIFIED: `apps/api/src/prisma/schema.prisma` Camera model, lines 1-40 of extracted block]

## Common Pitfalls

### Pitfall 1: Row selection by index, not ID
**What goes wrong:** TanStack Table defaults `rowSelection` keys to the row *index*. After pagination changes or a refetch reorders rows, selections stick to the wrong cameras.
**Why it happens:** `useReactTable` without `getRowId` assigns `row.id = String(index)`.
**How to avoid:** Pass `getRowId: (row) => row.id` to `useReactTable`. Then `rowSelection` is keyed by UUID and survives data refreshes.
**Warning signs:** After a bulk action, a different set of cameras appears "selected" than the ones acted upon.
[CITED: https://tanstack.com/table/latest/docs/api/features/row-selection#getrowid]

### Pitfall 2: Checkbox cell click propagates to row-click handler
**What goes wrong:** Clicking a row checkbox also fires the row's `onClick` (e.g. opens View Stream sheet).
**Why it happens:** The parent `<TableRow>` has an `onClick` for row-navigation; the inner `<Checkbox>` click bubbles up.
**How to avoid:** Wrap the cell-level checkbox in `<div onClick={(e) => e.stopPropagation()}>` (exact pattern from `recordings-columns.tsx:54`). The existing CamerasDataTable does NOT have row-click currently, but any future addition must account for this — document in the select column cell.
**Warning signs:** View Stream sheet opens unexpectedly when multi-selecting.

### Pitfall 3: Bulk fan-out races against optimistic UI
**What goes wrong:** User clicks "Start Stream" on 25 cameras. UI clears the selection immediately; mid-flight a failure returns but there is no visual target left to mark.
**Why it happens:** Clearing selection pre-completion loses the mapping between camera ID and its failure state.
**How to avoid:** Keep selection locked until `Promise.allSettled` resolves. Then REDUCE selection to only the failed IDs (D-06a), not clear. Show `Processing… (N)` on the counter chip during flight; disable all action buttons.
**Warning signs:** Error toast says "3 failed" but no row shows the error icon.

### Pitfall 4: MaintenanceReasonDialog shared between single + bulk flows gets de-synced
**What goes wrong:** Dialog opens for single-camera Enter Maintenance, then bulk toolbar's Maintenance button fires, and the dialog still shows the single camera's name.
**Why it happens:** One dialog state owner with mutable-at-a-distance prop.
**How to avoid:** Let the parent (`tenant-cameras-page.tsx`) hold a `maintenanceMode` union state — `{ type: 'single', camera: CameraRow } | { type: 'bulk', cameras: CameraRow[] } | null` — and render one dialog with a discriminated prop. OR use two separate dialog instances (one for single, one for bulk) and live with slight code duplication. Recommended: the union state — less drift risk.
**Warning signs:** Bulk Maintenance dialog shows only one camera's name in the description.

### Pitfall 5: Pill pulse animation in reduced-motion contexts
**What goes wrong:** Users with `prefers-reduced-motion: reduce` see still-pulsing pills; violates WCAG 2.3.3 and is a known accessibility regression in several codebases.
**Why it happens:** Using `animate-pulse` directly bypasses motion-query.
**How to avoid:** Always use `motion-safe:animate-pulse motion-reduce:animate-none` together. The map popup pattern (`camera-popup.tsx:201`) already does this correctly — mirror it.
**Warning signs:** System accessibility settings turn off animations, but LIVE pill still pulses.

### Pitfall 6: cURL template copies the user's real API key
**What goes wrong:** Developer thinks copy-cURL is "helpful" and injects `session.apiKey` into the template. Clipboard history leaks the secret.
**Why it happens:** Helpfulness overreach.
**How to avoid:** CONTEXT.md D-10 is explicit — `<YOUR_API_KEY>` stays as literal placeholder. Do NOT inject. Add a code comment marking this as a security invariant.
**Warning signs:** Code review PR introduces a `fetch('/api/me/api-keys')` call inside the Copy cURL handler.

### Pitfall 7: Backend `/api/cameras/:id/maintenance` does not accept a `reason` today
**What goes wrong:** Planner assumes `MaintenanceReasonDialog`'s "Reason (optional)" textarea persists to the audit trail, but the API drops it.
**Why it happens:** Backend service signature is `enterMaintenance(cameraId, userId)` — no `reason` param [VERIFIED: apps/api/src/cameras/cameras.service.ts:534].
**How to avoid:** Add optional `{ reason?: string }` to `POST /api/cameras/:id/maintenance` body. `AuditInterceptor` (apps/api/src/audit/audit.interceptor.ts:97) already logs `request.body` as `details` — if `reason` is in the body, it flows to audit automatically with zero additional code. This is a minimal backend touch.
**Warning signs:** QA enters a reason; audit log shows no reason field.

### Pitfall 8: Bulk maintenance (mixed state) fires API twice per camera
**What goes wrong:** D-03 says mixed-state selection shows BOTH Maintenance and Exit Maintenance. If the dev implements "toggle each row based on current state" inside one button, mixed state flips some in and others out.
**Why it happens:** Dev conflates "toggle" with "enter", "exit".
**How to avoid:** The toolbar's "Maintenance" button targets the `!maintenanceMode` subset only; the "Exit Maintenance" button targets the `maintenanceMode` subset only. Each button computes its own target set from `selectedCameras.filter(...)`.
**Warning signs:** After bulk Maintenance, some cameras exit maintenance.

### Pitfall 9: Reconnecting state pulse not implemented
**What goes wrong:** D-15 specifies reconnecting gets a stronger pulse. Dev adds `animate-pulse` for the amber outline LIVE variant — but `animate-pulse` is 2s default, not distinct from normal LIVE.
**Why it happens:** Tailwind's built-in pulse has one speed.
**How to avoid:** Use Tailwind arbitrary property `[animation-duration:1s]` alongside `motion-safe:animate-pulse` to halve the period — the UI-SPEC §10 specifies this technique.
**Warning signs:** Reconnecting state pulses at the same rate as LIVE.

## Code Examples

### 1. StatusPills component (new — co-located in camera-status-badge.tsx)

```typescript
// apps/web/src/app/admin/cameras/components/camera-status-badge.tsx
// Export alongside existing CameraStatusDot / CameraStatusBadge

import { Radio, Circle, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CameraRow } from "./cameras-columns"

const PILL_BASE =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm"

interface StatusPillsProps {
  camera: Pick<CameraRow, "status" | "isRecording" | "maintenanceMode">
}

export function StatusPills({ camera }: StatusPillsProps) {
  const { status, isRecording, maintenanceMode } = camera
  const isOnline = status === "online"
  const isReconnecting = status === "reconnecting" || status === "connecting"

  // Ordering per D-14: stream-state first, then REC, then MAINT
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Camera status">
      {isOnline && !maintenanceMode && (
        <span
          className={cn(PILL_BASE, "bg-red-500/95 text-white motion-safe:animate-pulse motion-reduce:animate-none")}
          aria-label="Live"
        >
          <Radio className="size-3" aria-hidden="true" />
          LIVE
        </span>
      )}
      {isReconnecting && !maintenanceMode && (
        <span
          className={cn(
            PILL_BASE,
            "border border-amber-500 bg-transparent text-amber-700 dark:text-amber-400 motion-safe:animate-pulse motion-reduce:animate-none [animation-duration:1s]"
          )}
          aria-label="Reconnecting"
        >
          <Radio className="size-3" aria-hidden="true" />
          LIVE
        </span>
      )}
      {isRecording && (
        <span
          className={cn(PILL_BASE, "bg-zinc-900 text-white dark:bg-zinc-800")}
          aria-label="Recording"
        >
          <span className="size-1.5 rounded-full bg-red-500 motion-safe:animate-pulse motion-reduce:animate-none" />
          REC
        </span>
      )}
      {maintenanceMode && (
        <span
          className={cn(
            PILL_BASE,
            "border border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
          )}
          aria-label="In maintenance — notifications suppressed"
        >
          <Wrench className="size-3" aria-hidden="true" />
          MAINT
        </span>
      )}
      {!isOnline && !isReconnecting && !isRecording && !maintenanceMode && (
        <span
          className={cn(PILL_BASE, "border border-border bg-muted text-muted-foreground")}
          aria-label="Offline"
        >
          <span className="size-2 rounded-full border border-muted-foreground bg-transparent" />
          OFFLINE
        </span>
      )}
    </div>
  )
}
```

### 2. Bulk toolbar (new file — can be embedded inline or co-located)

```typescript
// apps/web/src/app/admin/cameras/components/bulk-toolbar.tsx
import { Radio, Circle, Wrench, Trash2, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CameraRow } from "./cameras-columns"

interface BulkToolbarProps {
  selected: CameraRow[]
  processing: boolean
  onStartStream: () => void
  onStartRecording: () => void
  onEnterMaintenance: () => void
  onExitMaintenance: () => void
  onDelete: () => void
  onClear: () => void
}

export function BulkToolbar({
  selected,
  processing,
  onStartStream,
  onStartRecording,
  onEnterMaintenance,
  onExitMaintenance,
  onDelete,
  onClear,
}: BulkToolbarProps) {
  if (selected.length === 0) return null

  const hasNotInMaintenance = selected.some((c) => !c.maintenanceMode)
  const hasInMaintenance = selected.some((c) => c.maintenanceMode)
  const count = selected.length

  return (
    <div
      className="sticky top-0 z-20 flex h-10 items-center gap-2 rounded-md border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="text-sm font-medium" aria-live="polite">
        {processing ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" /> Processing… ({count})
          </span>
        ) : (
          `${count} selected`
        )}
      </span>

      <Button variant="outline" size="sm" onClick={onStartStream} disabled={processing}>
        <Radio className="mr-1.5 size-4" />
        Start Stream
      </Button>
      <Button variant="outline" size="sm" onClick={onStartRecording} disabled={processing}>
        <Circle className="mr-1.5 size-4" />
        Start Recording
      </Button>
      {hasNotInMaintenance && (
        <Button variant="outline" size="sm" onClick={onEnterMaintenance} disabled={processing}>
          <Wrench className="mr-1.5 size-4" />
          Maintenance
        </Button>
      )}
      {hasInMaintenance && (
        <Button variant="outline" size="sm" onClick={onExitMaintenance} disabled={processing}>
          <Wrench className="mr-1.5 size-4" />
          Exit Maintenance
        </Button>
      )}
      <Button variant="destructive" size="sm" onClick={onDelete} disabled={processing}>
        <Trash2 className="mr-1.5 size-4" />
        Delete ({count})
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClear}
        className="ml-auto"
        aria-label="Clear selection"
        disabled={processing}
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}
```

### 3. Bulk dispatcher (hand-rolled fan-out util)

```typescript
// apps/web/src/lib/bulk-actions.ts
import { apiFetch } from "@/lib/api"

export type BulkVerb =
  | "start-stream"
  | "start-recording"
  | "enter-maintenance"
  | "exit-maintenance"
  | "delete"

const ACTION: Record<BulkVerb, (cameraId: string, reason?: string) => Promise<void>> = {
  "start-stream": (id) => apiFetch(`/api/cameras/${id}/stream/start`, { method: "POST" }) as Promise<any>,
  "start-recording": (id) => apiFetch(`/api/recordings/start`, { method: "POST", body: JSON.stringify({ cameraId: id }) }) as Promise<any>,
  "enter-maintenance": (id, reason) =>
    apiFetch(`/api/cameras/${id}/maintenance`, {
      method: "POST",
      body: reason ? JSON.stringify({ reason }) : undefined,
    }) as Promise<any>,
  "exit-maintenance": (id) => apiFetch(`/api/cameras/${id}/maintenance`, { method: "DELETE" }) as Promise<any>,
  delete: (id) => apiFetch(`/api/cameras/${id}`, { method: "DELETE" }) as Promise<any>,
}

export async function bulkAction(
  verb: BulkVerb,
  cameraIds: string[],
  opts: { concurrency?: number; reason?: string } = {}
): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
  const concurrency = opts.concurrency ?? 5
  const results = await chunkedAllSettled(cameraIds, concurrency, async (id) => {
    await ACTION[verb](id, opts.reason)
    return id
  })
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []
  results.forEach((r, i) => {
    if (r.status === "fulfilled") succeeded.push(cameraIds[i])
    else failed.push({ id: cameraIds[i], error: errorMessage(r.reason) })
  })
  return { succeeded, failed }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === "string") return e
  return "Unknown error"
}

export async function chunkedAllSettled<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0
  async function runner() {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      try {
        results[i] = { status: "fulfilled", value: await worker(items[i]) }
      } catch (reason) {
        results[i] = { status: "rejected", reason }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runner)
  )
  return results
}

export const VERB_COPY: Record<BulkVerb, { singular: string; plural: (n: number) => string }> = {
  "start-stream": { singular: "Stream started", plural: (n) => `${n} streams started` },
  "start-recording": { singular: "Recording started", plural: (n) => `${n} recordings started` },
  "enter-maintenance": { singular: "Camera entered maintenance", plural: (n) => `${n} cameras entered maintenance` },
  "exit-maintenance": { singular: "Camera exited maintenance", plural: (n) => `${n} cameras exited maintenance` },
  delete: { singular: "Camera deleted", plural: (n) => `${n} cameras deleted` },
}
```

### 4. cURL copy action (row-menu handler)

```typescript
// apps/web/src/app/admin/cameras/components/cameras-columns.tsx — row action handler
function buildCurlSnippet(cameraId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
  return [
    `curl -X POST \\`,
    `  -H "X-API-Key: <YOUR_API_KEY>" \\`,
    `  ${origin}/api/cameras/${cameraId}/sessions`,
  ].join("\n")
}

async function handleCopyCurl(camera: CameraRow) {
  try {
    await navigator.clipboard.writeText(buildCurlSnippet(camera.id))
    toast.success("cURL example copied")
  } catch {
    toast.error("Couldn't copy to clipboard")
  }
}
```

### 5. ID chip + copy icon (sheet header line 3)

```typescript
// apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx — new line 3 in SheetHeader
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

function IdChipRow({ cameraId }: { cameraId: string }) {
  const truncated = `${cameraId.slice(0, 8)}…${cameraId.slice(-8)}`  // U+2026 ellipsis
  async function copy() {
    try {
      await navigator.clipboard.writeText(cameraId)
      toast.success("Camera ID copied")
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }
  return (
    <TooltipProvider>
      <div className="mt-1 flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={copy}
                className="font-mono text-xs h-6 px-2 bg-muted hover:bg-muted/80 rounded-md text-muted-foreground"
                aria-label={`Camera ID ${cameraId}, click to copy`}
              >
                {truncated}
              </button>
            }
          />
          <TooltipContent>{cameraId}</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon-xs" onClick={copy} aria-label="Copy camera ID">
          <Copy className="size-3" />
        </Button>
      </div>
    </TooltipProvider>
  )
}
```

### 6. Start Stream / Start Record expandable pill buttons

```typescript
// apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx — replace lines 93-113

<div className="flex items-center gap-2 min-w-[340px] justify-end">
  <button
    type="button"
    onClick={() => onStreamToggle(camera)}
    aria-pressed={camera.status === "online"}
    aria-label={camera.status === "online" ? "Stop stream" : "Start stream"}
    className={cn(
      "inline-flex items-center justify-center rounded-md border border-border bg-background text-muted-foreground",
      "transition-[width,background-color] duration-150 ease-out",
      camera.status === "online"
        ? "w-[160px] gap-1.5 bg-red-500 border-transparent px-3 text-white"
        : "w-9 h-9"
    )}
  >
    <Radio className={cn("size-4", camera.status === "online" && "motion-safe:animate-pulse motion-reduce:animate-none")} />
    {camera.status === "online" && (
      <span className="text-xs font-medium">Stop Stream</span>
    )}
  </button>

  <button
    type="button"
    onClick={() => onRecordToggle(camera)}
    aria-pressed={camera.isRecording}
    aria-label={camera.isRecording ? "Stop recording" : "Start recording"}
    className={cn(
      "inline-flex items-center justify-center rounded-md border border-border bg-background text-muted-foreground",
      "transition-[width,background-color] duration-150 ease-out",
      camera.isRecording
        ? "w-[160px] gap-1.5 bg-zinc-900 dark:bg-zinc-800 border-transparent px-3 text-white"
        : "w-9 h-9"
    )}
  >
    {camera.isRecording ? (
      <>
        <span className="size-2 rounded-full bg-red-500 motion-safe:animate-pulse motion-reduce:animate-none" />
        <span className="text-[10px] font-bold uppercase tracking-wide">REC</span>
      </>
    ) : (
      <Circle className="size-4" />
    )}
  </button>
</div>
```

## State of the Art

| Old Approach (current code) | New Approach (Phase 20) | When Changed | Impact |
|------------------------------|--------------------------|--------------|--------|
| Three separate status primitives per row (dot + recording-dot + wrench icon) | Single `<StatusPills>` component emitting 1–3 text pills | This phase | Clearer at-a-glance reading; consistent with map popup |
| Icon-only Start Stream / Start Record buttons with tooltip-only active state | Expanding pill-buttons with label swap on active | This phase | User complaint "buttons feel flat" — expressive feedback |
| Bare `AlertDialog` for maintenance confirmation (no reason field) | New `MaintenanceReasonDialog` with textarea + 200 char cap + audit-logged reason | This phase | Audit trail gains "why maintenance?" signal |
| No bulk operations — user clicks per-row | Sticky bulk toolbar + client-side fan-out with concurrency 5 | This phase | Unblocks tenant admins with >10 cameras |
| No Camera ID surface in UI | Copy in row menu + ID chip in sheet header | This phase | Developer integration pain point resolved |

**Deprecated in this phase:**
- The per-row wrench icon (`cameras-columns.tsx:107-121`) — replaced by MAINT pill
- The per-row recording dot (`cameras-columns.tsx:87-103`) — replaced by REC pill
- `CameraStatusDot` is no longer used in the cameras table Status column (still used in map popup + sheet header body — keep exported)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `p-limit` is optional — the hand-rolled `chunkedAllSettled` util is sufficient for one call site | Don't Hand-Roll table, Code Examples §3 | Low — planner can trivially swap to `npm i p-limit` if preferred; same call-site surface |
| A2 | `POST /api/cameras/:id/maintenance` accepting `{ reason?: string }` body is an acceptable "thin backend extension" per CONTEXT D-02 "no new bulk endpoints" (extending an existing endpoint's body shape is not the same as adding a new endpoint) | Pitfall 7, Code Examples §3 | Medium — user may consider this a backend change. Ask discuss-phase to confirm before implementation OR drop the `reason` field entirely (dialog remains a confirmation with no free text) |
| A3 | `lucide-react@1.8.0` ships `Terminal`, `Copy`, `AlertTriangle`, `Loader2` icons | Standard Stack, Code Examples | Low — all four are canonical icons in every lucide version; even 0.x had them |
| A4 | `prefers-reduced-motion` via `motion-safe:` / `motion-reduce:` Tailwind variants works in Tailwind 4 | Pitfall 5, StatusPills code | Low — Tailwind 4 keeps these variants; verified in map popup |
| A5 | The bulk operation's default concurrency limit of 5 does not overwhelm the backend when a tenant has up to ~50 cameras selected | Standard Stack, Code Examples §3 | Low — existing `/api/cameras/:id/stream/start` is an async dispatcher (enqueue BullMQ); concurrency 5 ≈ 5 enqueue calls, negligible |
| A6 | The existing `POST /api/recordings/start` handles idempotent start-on-already-recording gracefully (returns error or no-op) | Code Examples §3 bulkAction | Medium — if it throws, the bulk action will show failure for already-recording cameras. Planner should verify `recordingsService.startRecording` semantics in backend service file before committing |
| A7 | The existing `POST /api/cameras/:id/stream/start` handles idempotent start-on-already-online gracefully | Code Examples §3 bulkAction | Medium — same as A6. Quick test: start a stream twice in a row, observe response code |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed. *This research has 7 assumptions — primarily around concurrency sizing and idempotency of start endpoints. A2 is the most impactful — planner should clarify whether the "no new endpoints" rule excludes body-shape extension.*

## Open Questions

1. **Backend `reason` parameter for `POST /api/cameras/:id/maintenance` — extend or drop?**
   - What we know: UI-SPEC specifies a textarea with 200-char cap "Logged to the audit trail." AuditInterceptor auto-captures `request.body` — minimal-change wiring. Backend service signature is `enterMaintenance(cameraId, userId)` — no `reason` persistence happens today beyond the generic audit `details` JSON blob.
   - What's unclear: Whether "audit trail" means the generic audit log (which logs the whole body) or a dedicated column (which does not exist). CONTEXT says reason is "Logged to the audit trail" — the generic audit log read matches this literally.
   - Recommendation: Accept optional `{ reason?: string }` in body; rely on AuditInterceptor's `details: sanitizeBody(body)` for persistence. Do not add a dedicated `Camera.maintenanceReason` column unless the user explicitly asks.

2. **Start Stream / Start Recording idempotency — what's the current server behavior?**
   - What we know: `POST /api/cameras/:id/stream/start` is an async BullMQ enqueue. Bulk fan-out will call it for all selected cameras regardless of current state.
   - What's unclear: Does the API return 409 / 200 / 200-with-noop for cameras already online / already recording? If it returns 500 or a non-2xx, bulk toolbar will mark those rows as failed (D-06a) — which reads as confusing ("already started" is not a failure).
   - Recommendation: Planner should (a) read `streamsService.startStream` + `recordingsService.startRecording` source code during Wave 0, and (b) in the bulk flow, pre-filter selection before fan-out: `.filter(c => c.status !== 'online')` for Start Stream, `.filter(c => !c.isRecording)` for Start Recording. This avoids the confusing error state entirely and reduces API calls.

3. **Bulk maintenance `reason` — one shared reason across all selected cameras, or per-camera reasons?**
   - What we know: UI-SPEC textarea is a single field. Description says "{N} cameras will stop streaming…"
   - What's unclear: If tenant admin enters "Lens cleaning", does that apply to all 25 selected cameras identically in the audit log?
   - Recommendation: Yes — one reason for all cameras in the batch. Per-camera reasons would require per-row textareas, not in scope. The audit entries created by the fan-out loop each log the same `reason` string. Document this in the dialog helper text: "This reason will be logged for all selected cameras."

4. **Shared-component reuse for Super Admin page?**
   - What we know: ROADMAP says "Super Admin `/admin/cameras` page parity … not a goal" (from CONTEXT.md §Phase Boundary), but the shared components under `apps/web/src/app/admin/cameras/components/` are consumed by BOTH portals if both pages import them.
   - What's unclear: Does the Super Admin `/admin/cameras` page even exist today? [NEEDS VERIFICATION — I did not check `apps/web/src/app/admin/cameras/page.tsx`]
   - Recommendation: Quick verification step for the planner: `ls apps/web/src/app/admin/cameras/page.tsx`. If it renders `CamerasDataTable` with the same prop shape, the phase automatically lights up both surfaces — fine. If it's a separate implementation, no change. Either way, Phase 20 is not a parity goal.

## Environment Availability

> SKIPPED — this phase has no new external tools, runtimes, CLIs, databases, or services. All deps are already in `apps/web/package.json` and `apps/api/package.json`. Reuses existing sonner, tanstack-table, base-ui, lucide, socket.io. No new infra.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3 + @testing-library/react 16.3.2 + jsdom 25 [VERIFIED: apps/web/package.json] |
| Config file | `apps/web/vitest.config.ts` [VERIFIED] |
| Quick run command | `cd apps/web && pnpm vitest run src/app/admin/cameras` |
| Full suite command | `cd apps/web && pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-05 | Select column renders header checkbox with tri-state + per-row checkbox with `stopPropagation` | unit | `pnpm vitest run src/app/admin/cameras/components/cameras-columns.test.tsx -t "select column"` | ❌ (extend existing file) |
| D-12, D-13, D-14 | StatusPills renders correct pill for each of (online, offline, reconnecting, maintenance, online+recording, offline+recording) | unit | `pnpm vitest run src/app/admin/cameras/components/camera-status-badge.test.tsx` | ❌ Wave 0 |
| D-15 | StatusPills respects `motion-reduce` (no `animate-pulse` class when prefers-reduced-motion; `[animation-duration:1s]` on reconnecting variant) | unit | `pnpm vitest run … -t "prefers-reduced-motion"` | ❌ Wave 0 — may need jsdom workaround; matchMedia mock |
| D-07 | Row action menu flips label between "Maintenance" and "Exit Maintenance" based on `camera.maintenanceMode` | unit | `pnpm vitest run src/app/admin/cameras/components/cameras-columns.test.tsx -t "maintenance asymmetric"` | ❌ (extend existing file) |
| D-08 | Row action menu order matches spec; Copy Camera ID + Copy cURL items appear before Embed Code | unit | `pnpm vitest run … -t "row action menu order"` | ❌ (extend) |
| D-09 | "Copy Camera ID" writes `camera.id` verbatim to clipboard + success toast | unit | `pnpm vitest run … -t "copy camera id"` with `navigator.clipboard` mock | ❌ Wave 0 |
| D-10 | "Copy cURL example" writes the templated snippet with `window.location.origin` + literal `<YOUR_API_KEY>` | unit | `pnpm vitest run … -t "copy curl"` | ❌ Wave 0 |
| D-11 | Failure path of clipboard (rejected Promise) shows error toast | unit | `pnpm vitest run … -t "copy fallback"` | ❌ Wave 0 |
| D-04, D-06a | BulkToolbar renders when selection non-empty; counter accurate; Clear × resets selection | unit/integration | `pnpm vitest run src/app/admin/cameras/components/bulk-toolbar.test.tsx` | ❌ Wave 0 |
| D-02, D-06a | `chunkedAllSettled` with concurrency 5 runs over 25 items; 3 failures → `{ succeeded: 22, failed: 3 }`; summary toast message correct | unit | `pnpm vitest run src/lib/bulk-actions.test.ts` | ❌ Wave 0 |
| D-06a | Failed rows get `AlertTriangle` badge; row selection reduces to failed-only | integration | `pnpm vitest run src/components/pages/tenant-cameras-page.test.tsx -t "bulk failure"` | ❌ Wave 0 |
| D-06b | Delete confirm dialog requires one click; shows first 5 names + "+N more" | integration | `pnpm vitest run … -t "delete confirm"` | ❌ Wave 0 |
| D-03 | Mixed-state maintenance selection shows both buttons; each targets correct subset | integration | `pnpm vitest run … -t "mixed maintenance"` | ❌ Wave 0 |
| D-17, D-18 | ViewStreamSheet header has 3 lines; ID chip shows truncated form; click copies full UUID | unit | `pnpm vitest run src/app/admin/cameras/components/view-stream-sheet.test.tsx -t "id chip"` | ❌ Wave 0 |
| D-19, D-20, D-21 | Stream / Record pill-buttons expand when active; active class set; `aria-pressed` reflects state | unit | `pnpm vitest run … -t "stream record pills"` | ❌ Wave 0 |
| A6, A7 | Start Stream / Start Recording bulk flows pre-filter already-online / already-recording cameras before fan-out | unit | `pnpm vitest run src/lib/bulk-actions.test.ts -t "pre-filter"` | ❌ Wave 0 |

### Sampling Rate (Nyquist alignment)

Every status transition must have at least one test. Every destructive confirm path must have at least one test. Every clipboard path (success + failure) must have at least one test. Every bulk variant (5 verbs) must have at least one unit + integration test pair.

- **Per task commit:** `cd apps/web && pnpm vitest run src/app/admin/cameras src/components/pages/tenant-cameras-page.test.tsx src/lib/bulk-actions.test.ts` (< 30s)
- **Per wave merge:** `cd apps/web && pnpm test` (full web suite)
- **Phase gate:** Full suite green + manual E2E on `/app/cameras` covering: multi-select → Maintenance toolbar → reason dialog → summary toast → error retry; Copy Camera ID → toast → paste verification; expand pill-button → red fill → label; LIVE pill → reduced-motion-respect

### Wave 0 Gaps

- [ ] `src/lib/bulk-actions.test.ts` — new file covering `chunkedAllSettled`, `bulkAction` fan-out, `VERB_COPY` map
- [ ] `src/app/admin/cameras/components/camera-status-badge.test.tsx` — new file; StatusPills variant matrix + motion-reduced + pill ordering
- [ ] `src/app/admin/cameras/components/bulk-toolbar.test.tsx` — new file; toolbar visibility/visibility rules + clear button + processing state
- [ ] `src/app/admin/cameras/components/view-stream-sheet.test.tsx` — new file; header 3-line layout + ID chip clipboard + pill-button expand
- [ ] `src/app/admin/cameras/components/maintenance-reason-dialog.test.tsx` — new file; single/bulk mode copy + 200-char limit + submit payload
- [ ] Extend `src/app/admin/cameras/components/cameras-columns.test.tsx` (exists) — row action menu order + dynamic label + copy actions
- [ ] `src/components/pages/tenant-cameras-page.test.tsx` — new file covering end-to-end bulk flow (MSW for API mocking? Or mock apiFetch directly — match existing test style)

**Framework install:** Not needed — vitest + testing-library already installed.

## Security Domain

Applicable because Phase 20 handles clipboard data (including a raw UUID), an API key placeholder, and destructive bulk operations.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Bulk fan-out hits existing authenticated endpoints; AuthGuard already in place on all `/api/cameras/*` routes [VERIFIED: cameras.controller.ts:38, streams.controller.ts:16] |
| V3 Session Management | no | Reuses existing `better-auth` session cookie [VERIFIED: apps/web/package.json] |
| V4 Access Control | yes | All bulk operations must scope to caller's org — server enforces via tenancy client RLS; no client-side trust required. Verify nothing in new code bypasses the existing `apiFetch` wrapper (which injects credentials). [VERIFIED: apps/web/src/lib/api.ts assumed, existing pattern] |
| V5 Input Validation | yes | MaintenanceReasonDialog textarea: `maxLength={200}` client-side; server-side DTO validation if `reason` is accepted (recommend zod schema `.string().max(200).optional()`) |
| V6 Cryptography | no | No new crypto operations |
| V10 Malicious Code | yes | Reason textarea value is user-controlled string rendered into description of confirmation dialog — MUST be escaped (React escapes by default, but verify no `dangerouslySetInnerHTML` usage) |

### Known Threat Patterns for React + Next.js UX phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Clipboard secret leak (user pastes API key into cURL template) | Information Disclosure | Keep `<YOUR_API_KEY>` as literal placeholder per D-10; add code comment marking as security invariant [CITED: CONTEXT D-10] |
| Bulk action abuse (malicious user selects 10k cameras, fan-out floods API) | Denial of Service | Concurrency limit 5; server-side existing rate-limiter on `/api/cameras/*` (verify ThrottlerGuard); UI caps page size to 10 per D-04 paginated table [ASSUMED: ThrottlerGuard in place — verify] |
| Cross-org bulk action (UI mis-renders cameras from org B during impersonation) | Elevation of Privilege | RLS client in NestJS enforces org scoping; frontend cannot exceed what API returns. Mitigated at API layer, no new UI-level check needed |
| XSS via camera name in delete confirm dialog list | Tampering | React escapes text content by default; ensure `{camera.name}` is rendered as text node, not `dangerouslySetInnerHTML` |
| XSS via error message in row-level AlertTriangle tooltip | Tampering | Same — render API error as text content only |
| Clickjacking on delete confirm | Tampering | Base-UI AlertDialog renders in a portal with backdrop + focus trap — no iframe vulnerability [CITED: @base-ui/react dialog docs] |

## Sources

### Primary (HIGH confidence — verified in repo / official docs)

- `apps/web/src/app/admin/cameras/components/cameras-data-table.tsx` — hand-rolled `useReactTable`, NOT shared `<DataTable>` primitive
- `apps/web/src/app/admin/cameras/components/cameras-columns.tsx` — current row action menu structure (7 items), Status column composite cell (lines 71-126), row actions config (lines 226-251)
- `apps/web/src/app/admin/cameras/components/camera-status-badge.tsx` — `CameraStatusDot` + `CameraStatusBadge` contract to preserve
- `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx:93-113` — current Start Stream / Start Record buttons (icon-sm outline variant)
- `apps/web/src/app/admin/cameras/components/push-url-section.tsx:49-56` — canonical `navigator.clipboard.writeText` + Sonner pattern
- `apps/web/src/app/app/recordings/components/recordings-data-table.tsx` — bulk toolbar + `Promise.allSettled`-equivalent + AlertDialog confirm — reference implementation per CONTEXT §Canonical References
- `apps/web/src/app/app/recordings/components/recordings-columns.tsx:42-64` — select column exact pattern
- `apps/web/src/components/ui/data-table/data-table.tsx` — primitive (not used by cameras today but referenced in UI-SPEC)
- `apps/web/src/components/ui/data-table/data-table-row-actions.tsx` — RowAction contract (label + icon + onClick + optional `variant: "destructive"`) with built-in separator handling
- `apps/web/src/components/ui/checkbox.tsx` — `indeterminate` + `checked` prop support (base-ui wrapper)
- `apps/web/src/components/map/camera-popup.tsx:201-214` — LIVE + REC pill tokens to match
- `apps/web/src/hooks/use-camera-status.ts` — socket.io `camera:status` event pipeline (drives pill state transitions live)
- `apps/web/src/components/pages/tenant-cameras-page.tsx` — page host that composes table + all dialogs; where bulk toolbar + MaintenanceReasonDialog state must live
- `apps/api/src/cameras/cameras.controller.ts:238,258` — `POST`/`DELETE` `/api/cameras/:id/maintenance` signatures
- `apps/api/src/cameras/cameras.service.ts:534,605` — `enterMaintenance(cameraId, userId)` / `exitMaintenance(cameraId)` — no `reason` param today
- `apps/api/src/streams/streams.controller.ts:22,38` — `/api/cameras/:id/stream/start` + `/stream/stop`
- `apps/api/src/recordings/recordings.controller.ts:127,137` — `/api/recordings/start` + `/stop` with body `{ cameraId }`
- `apps/api/src/audit/audit.interceptor.ts` — logs `request.body` (sanitized) to audit as `details` — auto-captures `reason` if added
- `apps/api/src/prisma/schema.prisma` — Camera model has `maintenanceMode`, `maintenanceEnteredAt`, `maintenanceEnteredBy`, `isRecording`, `status`, `id` — all fields Phase 20 needs already exist
- `apps/api/src/status/status.service.ts:21-27` — status enum transitions (`online | offline | degraded | connecting | reconnecting`)
- `apps/web/components.json` — shadcn preset `base-nova`, style `base-nova`, base color `neutral`, lucide icons
- `apps/web/package.json` — all library versions verified
- `apps/web/vitest.config.ts` — test setup

### Secondary (MEDIUM confidence — derived from cited primary)

- CONTEXT.md D-01..D-22 — user-locked decisions, authoritative for scope
- UI-SPEC.md §Interaction Contracts 1-12 — visual + a11y contract, derived from D-01..D-22
- `.planning/phases/18-dashboard-map-polish/18-CONTEXT.md` §D-13/D-14/D-15 — original semantics of the three status signals

### Tertiary (LOW confidence — training knowledge, unverified this session)

- `prefers-reduced-motion` CSS query behavior in Tailwind 4 — verified via `motion-safe:` / `motion-reduce:` classes present in existing code, so VERIFIED in practice
- p-limit library semantics — not installed, hand-rolled reference in Code Examples §3 follows p-limit's public API

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library version is in an installed `package.json`; no Context7/npm lookup required
- Architecture: HIGH — every pattern is a reference to a specific file + line range in this repo
- Pitfalls: HIGH — four pitfalls are directly observed in current code (A2: backend `reason` gap; A6/A7: idempotency unknowns) or codified by CONTEXT (D-10 clipboard security)
- Tests: HIGH for Wave 0 file list, MEDIUM for specific test coverage percentages

**Research date:** 2026-04-24
**Valid until:** 2026-05-08 (2 weeks — stable phase with pinned lockfile; revalidate only if CONTEXT changes or a new Cameras feature lands first)
