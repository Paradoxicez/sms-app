"use client"

import { useMemo } from "react"
import { Radio, Circle, Wrench, Trash2, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CameraRow } from "./cameras-columns"
import { BulkAddTagPopover } from "./bulk-add-tag-popover"
import { BulkRemoveTagPopover } from "./bulk-remove-tag-popover"

/**
 * Phase 20 D-03/D-04 — Sticky bulk-action toolbar for the cameras table.
 *
 * Mounts only when `selected.length > 0`. Behaviour contracts (UI-SPEC §Bulk
 * toolbar positioning + §Button visibility rules):
 *
 *   - counter chip: "{N} selected" (processing swaps to "Processing… ({N})")
 *   - Start Stream / Start Recording buttons are always visible
 *   - Stop Stream / Stop Recording buttons are always visible (mirror Start variants;
 *     pre-filter helpers handle no-op selections — no destructive styling)
 *   - Maintenance button visible when any selected camera is not in maintenance
 *   - Exit Maintenance button visible when any selected camera is in maintenance
 *   - Delete ({N}) is destructive; Clear × stays enabled during processing
 *   - role="toolbar" + aria-label="Bulk actions"; counter has aria-live="polite"
 *
 * Phase 22 Plan 22-11 D-11/D-12/D-13 — bulk Add tag / Remove tag:
 *   - 'Add tag' (variant=outline) inserted after Maintenance, before Delete.
 *   - 'Remove tag' rendered next to Add only when ≥1 selected camera has ≥1 tag.
 *   - selectionTagUnion is computed here (case-insensitive dedup, first-seen
 *     casing wins) and passed to BulkRemoveTagPopover so T-22-14 holds: the
 *     Remove popover does not perform any extra fetch — its suggestions come
 *     from rows already in the user's UI.
 *
 * The component is presentational — parent owns rowSelection state, dispatches
 * bulkAction, and renders MaintenanceReasonDialog + Delete AlertDialog. The
 * pre-filter step (Research A6/A7) happens in the handler, not here. The tag
 * popovers self-contain their fetch + toast lifecycle; the parent only wires
 * `onTagBulkSuccess` to refetch the table + clear selection.
 */
export interface BulkToolbarProps {
  selected: CameraRow[]
  processing: boolean
  onStartStream: () => void
  onStartRecording: () => void
  onStopStream: () => void
  onStopRecording: () => void
  onEnterMaintenance: () => void
  onExitMaintenance: () => void
  onDelete: () => void
  onClear: () => void
  /**
   * Phase 22 Plan 22-11 — called after a successful bulk tag add/remove. The
   * parent should refetch the cameras list and clear `rowSelection`. Optional
   * so existing call-sites + tests don't break; missing wiring just means the
   * tag popovers won't refetch on success (still safe — the API mutation
   * already succeeded).
   */
  onTagBulkSuccess?: () => void
}

export function BulkToolbar({
  selected,
  processing,
  onStartStream,
  onStartRecording,
  onStopStream,
  onStopRecording,
  onEnterMaintenance,
  onExitMaintenance,
  onDelete,
  onClear,
  onTagBulkSuccess,
}: BulkToolbarProps) {
  // Phase 22 Plan 22-11 — selectionTagUnion is computed BEFORE the early-return
  // because hooks cannot be called conditionally. The dependency array uses the
  // selected array reference; parent memoizes this via useMemo so we do not
  // recompute on every parent render.
  const selectionTagUnion = useMemo(() => {
    const seen = new Map<string, string>() // lowercase key → first-seen casing
    for (const cam of selected) {
      for (const tag of cam.tags ?? []) {
        const k = tag.toLowerCase()
        if (!seen.has(k)) seen.set(k, tag)
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    )
  }, [selected])

  if (selected.length === 0) return null

  const count = selected.length
  const hasNotInMaintenance = selected.some((c) => !c.maintenanceMode)
  const hasInMaintenance = selected.some((c) => c.maintenanceMode)
  const hasAnyTagsInSelection = selectionTagUnion.length > 0
  const cameraIds = selected.map((c) => c.id)
  const handleTagBulkSuccess = onTagBulkSuccess ?? (() => {})

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={cn(
        "sticky top-0 z-20 mb-3 flex h-10 items-center gap-2 rounded-md border bg-background/95 px-3 backdrop-blur",
        "supports-[backdrop-filter]:bg-background/60",
      )}
    >
      <span className="text-sm font-medium" aria-live="polite">
        {processing ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            Processing… ({count})
          </span>
        ) : (
          `${count} selected`
        )}
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={onStartStream}
        disabled={processing}
      >
        <Radio className="mr-1.5 size-4" aria-hidden="true" />
        Start Stream
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onStartRecording}
        disabled={processing}
      >
        <Circle className="mr-1.5 size-4" aria-hidden="true" />
        Start Recording
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onStopStream}
        disabled={processing}
      >
        <Radio className="mr-1.5 size-4" aria-hidden="true" />
        Stop Stream
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onStopRecording}
        disabled={processing}
      >
        <Circle className="mr-1.5 size-4" aria-hidden="true" />
        Stop Recording
      </Button>
      {hasNotInMaintenance && (
        <Button
          variant="outline"
          size="sm"
          onClick={onEnterMaintenance}
          disabled={processing}
        >
          <Wrench className="mr-1.5 size-4" aria-hidden="true" />
          Maintenance
        </Button>
      )}
      {hasInMaintenance && (
        <Button
          variant="outline"
          size="sm"
          onClick={onExitMaintenance}
          disabled={processing}
        >
          <Wrench className="mr-1.5 size-4" aria-hidden="true" />
          Exit Maintenance
        </Button>
      )}

      {/*
        Phase 22 Plan 22-11 — Add / Remove tag popovers (D-11, D-12, D-13).
        Inserted between Maintenance and Delete per UI-SPEC §"Surface-by-Surface
        Contract Summary" line 362. 'Remove tag' is conditional on the selection
        actually containing tags (D-12 — hide when there's nothing to remove).
      */}
      <BulkAddTagPopover
        cameraIds={cameraIds}
        onSuccess={handleTagBulkSuccess}
      />
      {hasAnyTagsInSelection && (
        <BulkRemoveTagPopover
          cameraIds={cameraIds}
          selectionTagUnion={selectionTagUnion}
          onSuccess={handleTagBulkSuccess}
        />
      )}

      <Button
        variant="destructive"
        size="sm"
        onClick={onDelete}
        disabled={processing}
      >
        <Trash2 className="mr-1.5 size-4" aria-hidden="true" />
        Delete ({count})
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClear}
        className="ml-auto"
        aria-label="Clear selection"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}
