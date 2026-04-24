"use client"

import { Radio, Circle, Wrench, Trash2, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CameraRow } from "./cameras-columns"

/**
 * Phase 20 D-03/D-04 — Sticky bulk-action toolbar for the cameras table.
 *
 * Mounts only when `selected.length > 0`. Behaviour contracts (UI-SPEC §Bulk
 * toolbar positioning + §Button visibility rules):
 *
 *   - counter chip: "{N} selected" (processing swaps to "Processing… ({N})")
 *   - Start Stream / Start Recording buttons are always visible
 *   - Maintenance button visible when any selected camera is not in maintenance
 *   - Exit Maintenance button visible when any selected camera is in maintenance
 *   - Delete ({N}) is destructive; Clear × stays enabled during processing
 *   - role="toolbar" + aria-label="Bulk actions"; counter has aria-live="polite"
 *
 * The component is presentational — parent owns rowSelection state, dispatches
 * bulkAction, and renders MaintenanceReasonDialog + Delete AlertDialog. The
 * pre-filter step (Research A6/A7) happens in the handler, not here.
 */
export interface BulkToolbarProps {
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

  const count = selected.length
  const hasNotInMaintenance = selected.some((c) => !c.maintenanceMode)
  const hasInMaintenance = selected.some((c) => c.maintenanceMode)

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
