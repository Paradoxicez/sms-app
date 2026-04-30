"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { formatDistanceToNow } from "date-fns"
import {
  AlertTriangle,
  Pencil,
  Play,
  Circle,
  Code,
  Trash2,
  Radio,
  Wrench,
  Copy,
  Terminal,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"
import { StatusPills } from "@/app/admin/cameras/components/camera-status-badge"
import { CodecStatusCell } from "@/app/admin/cameras/components/codec-status-cell"
import { TagsCell } from "@/app/admin/cameras/components/tags-cell"
import { normalizeCodecInfo } from "@/lib/codec-info"
import {
  getStreamProfileModeName,
  STREAM_PROFILE_MODE_BADGE,
} from "@/lib/stream-profile-mode"

export interface CameraRow {
  id: string
  name: string
  status: "online" | "offline" | "degraded" | "connecting" | "reconnecting"
  isRecording: boolean
  maintenanceMode: boolean
  streamUrl: string
  codecInfo?: unknown
  streamProfileId?: string | null
  /** Quick task 260425-uw0 — populated by findAllCameras include; null when no profile assigned. */
  streamProfile?: { id: string; name: string; codec: string } | null
  location?: { lat: number; lng: number } | null
  description?: string | null
  tags?: string[]
  site?: { id: string; name: string; project?: { id: string; name: string } }
  createdAt: string
  /** Phase 19.1 D-01 — 'pull' (default, RTSP/RTMP external) or 'push' (platform-generated key). */
  ingestMode?: "pull" | "push"
  /** Phase 19.1 D-07 — nanoid for push cameras; null for pull. Owner-only surface. */
  streamKey?: string | null
  /** Phase 19.1 D-26 — ISO timestamp of the first successful publish, or null if never. */
  firstPublishAt?: string | null
  /** Phase 19.1 D-16 — needsTranscode toggle consumed by accept-auto-transcode flow. */
  needsTranscode?: boolean
  /**
   * Quick task 260425-w7v — public MinIO URL for the camera card thumbnail.
   * Populated by SnapshotService on every offline→online transition. Null
   * for cameras that have never been online.
   */
  thumbnail?: string | null
  /**
   * Quick task 260501-1n1 — Tier 1 smart-probe outputs. Persisted as
   * top-level Camera columns (NOT inside codecInfo JSON) by the ffprobe
   * success branch of StreamProbeProcessor. Defaults: `[]` / null / null
   * until the first probe lands.
   */
  streamWarnings?: string[]
  brandHint?: string | null
  brandConfidence?: string | null
}

interface CamerasColumnCallbacks {
  onEdit: (camera: CameraRow) => void
  onViewStream: (camera: CameraRow) => void
  onDelete: (camera: CameraRow) => void
  onRecordToggle: (camera: CameraRow) => void
  onEmbedCode: (camera: CameraRow) => void
  onStreamToggle: (camera: CameraRow) => void
  onMaintenanceToggle: (camera: CameraRow) => void
}

/**
 * Phase 20 Plan 03 — options bag for cross-cutting column state.
 *
 * `errorByCameraId` surfaces bulk-action failures as an AlertTriangle badge in
 * the Status cell (D-06a). The map is owned by `tenant-cameras-page.tsx` and
 * updated by the bulk handler; it persists until the camera is targeted again.
 */
interface CamerasColumnOptions {
  errorByCameraId?: Record<string, string>
}

export function createCamerasColumns(
  callbacks: CamerasColumnCallbacks,
  options: CamerasColumnOptions = {},
): ColumnDef<CameraRow>[] {
  return [
    // ─── Phase 20 D-05 — Select column (FIRST) ────────────────────────
    // Mirrors recordings-columns.tsx:42-64. getRowId: (row) => row.id is
    // applied at the useReactTable level in cameras-data-table.tsx so
    // rowSelection is keyed by camera UUID instead of visual row index.
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={
            table.getIsSomePageRowsSelected() &&
            !table.getIsAllPageRowsSelected()
          }
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all cameras on this page"
        />
      ),
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={`Select camera ${row.original.name}`}
          />
        </div>
      ),
      enableSorting: false,
      size: 40,
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      // Phase 20 D-12..D-16: expressive pills replace the 3-dot cell. StatusPills
      // tokens mirror camera-popup.tsx:201-214 byte-for-byte (LIVE + REC), so the
      // map popup and table row read as one design language.
      //
      // Plan 03 D-06a: when `options.errorByCameraId[id]` is set, append an
      // AlertTriangle badge with the verbatim error message as its aria-label.
      // Badge persists until the camera is re-targeted by another bulk action.
      cell: ({ row }) => {
        const camera = row.original
        const error = options.errorByCameraId?.[camera.id]
        return (
          <div className="flex items-center gap-1">
            <StatusPills camera={camera} />
            {error && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        role="img"
                        aria-label={`Bulk action failed: ${error}`}
                        className="ml-1"
                      >
                        <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-500" />
                      </span>
                    }
                  />
                  <TooltipContent>{error}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )
      },
      size: 120,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      // Phase 22 D-17 + D-18: when description is non-empty, wrap the name in
      // a Tooltip whose content uses `max-w-[320px]` + `line-clamp-6` per the
      // UI-SPEC tooltip contract. When description is empty/null, render the
      // bare span so no tooltip primitives mount (a11y + perf).
      // Radix default delay is intentional — DO NOT pass `delayDuration` (D-18).
      cell: ({ row }) => {
        const camera = row.original
        const description = camera.description?.trim()
        const nameSpan = (
          <span
            className="font-medium"
            tabIndex={description ? 0 : -1}
          >
            {row.getValue<string>("name")}
          </span>
        )
        if (!description) return nameSpan
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger render={nameSpan} />
              <TooltipContent className="max-w-[320px] whitespace-pre-line">
                <span className="line-clamp-6 inline-block">{description}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      id: "project",
      accessorFn: (row) => row.site?.project?.name ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Project" />
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      id: "site",
      accessorFn: (row) => row.site?.name ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Site" />
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      id: "codec",
      accessorFn: (row) => {
        const info = normalizeCodecInfo(row.codecInfo)
        return info?.status === "success" ? info.video?.codec ?? "" : ""
      },
      header: "Codec",
      cell: ({ row }) => (
        <CodecStatusCell
          codecInfo={row.original.codecInfo}
          cameraId={row.original.id}
          cameraName={row.original.name}
          transcoding={
            row.original.ingestMode === "push" &&
            row.original.needsTranscode === true
          }
        />
      ),
      enableSorting: false,
    },
    {
      id: "resolution",
      accessorFn: (row) => {
        const info = normalizeCodecInfo(row.codecInfo)
        if (info?.status === "success" && info.video) {
          return `${info.video.width}×${info.video.height}`
        }
        return ""
      },
      header: "Resolution",
      cell: ({ row }) => {
        const info = normalizeCodecInfo(row.original.codecInfo)
        if (info?.status === "success" && info.video) {
          return (
            <span className="text-xs font-mono text-muted-foreground">
              {`${info.video.width}×${info.video.height}`}
            </span>
          )
        }
        return (
          <span className="text-xs font-mono text-muted-foreground">
            {"—"}
          </span>
        )
      },
      enableSorting: false,
    },
    // Quick task 260425-uw0: Stream Profile column. Renders the assigned profile's
    // name + a Transcode/Passthrough/Auto mode badge (shared tokens with the
    // Stream Profiles page via @/lib/stream-profile-mode). Null/undefined profile
    // collapses to a muted em-dash, matching the resolution-column null pattern.
    {
      id: "streamProfile",
      accessorFn: (row) => row.streamProfile?.name ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Stream Profile" />
      ),
      cell: ({ row }) => {
        const profile = row.original.streamProfile
        if (!profile) {
          return (
            <span className="text-xs text-muted-foreground">{"—"}</span>
          )
        }
        const mode = getStreamProfileModeName(profile.codec)
        const badgeClass =
          STREAM_PROFILE_MODE_BADGE[mode] ?? STREAM_PROFILE_MODE_BADGE.Auto
        return (
          <div className="flex items-center gap-2">
            <span className="font-medium">{profile.name}</span>
            <Badge variant="outline" className={badgeClass}>
              {mode}
            </Badge>
          </div>
        )
      },
    },
    // Phase 22 Plan 22-08 — Tags column (D-14, D-15). Inserted AFTER Stream
    // Profile and BEFORE Created per UI-SPEC ordering. Uses the shared
    // TagsCell composite which is reused by Plan 22-10 (map popup).
    //
    // filterFn: case-insensitive OR semantics — `value` is the array of tag
    // strings selected in the Tags MultiSelect filter (wired in
    // cameras-data-table.tsx). Empty selection → no filter applied (return
    // true). Otherwise: at least one row tag must case-insensitively match
    // any selected filter value.
    {
      id: "tags",
      accessorKey: "tags",
      header: "Tags",
      enableSorting: false,
      cell: ({ row }) => <TagsCell tags={row.original.tags ?? []} />,
      filterFn: (row, id, value: string[]) => {
        if (!value || value.length === 0) return true
        const rowTags = (row.getValue(id) as string[] | undefined) ?? []
        if (rowTags.length === 0) return false
        const lowered = new Set(rowTags.map((t) => t.toLowerCase()))
        return value.some((v) => lowered.has(v.toLowerCase()))
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => {
        const dateStr = row.getValue<string>("createdAt")
        return (
          <span
            className="text-sm text-muted-foreground"
            title={dateStr}
          >
            {formatDistanceToNow(new Date(dateStr), { addSuffix: true })}
          </span>
        )
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const camera = row.original

        async function handleCopyCameraId() {
          try {
            await navigator.clipboard.writeText(camera.id)
            toast.success("Camera ID copied")
          } catch {
            toast.error("Couldn't copy to clipboard")
          }
        }

        async function handleCopyCurl() {
          const origin =
            typeof window !== "undefined"
              ? window.location.origin
              : "http://localhost:3000"
          // D-10 / T-20-08 security invariant: <YOUR_API_KEY> stays as a
          // LITERAL placeholder. The UI must NEVER fetch the user's real API
          // key — clipboard history is a documented secret-leak vector.
          const snippet = [
            `curl -X POST \\`,
            `  -H "X-API-Key: <YOUR_API_KEY>" \\`,
            `  ${origin}/api/cameras/${camera.id}/sessions`,
          ].join("\n")
          try {
            await navigator.clipboard.writeText(snippet)
            toast.success("cURL example copied")
          } catch {
            toast.error("Couldn't copy to clipboard")
          }
        }

        // D-08 order (9 items; separator auto-inserted above the destructive
        // Delete entry by DataTableRowActions):
        //   Edit, View Stream, Start/Stop Stream, Start/Stop Recording,
        //   Maintenance/Exit Maintenance, Copy Camera ID, Copy cURL example,
        //   Embed Code, Delete.
        const rowActions: RowAction<CameraRow>[] = [
          { label: "Edit", icon: Pencil, onClick: callbacks.onEdit },
          { label: "View Stream", icon: Play, onClick: callbacks.onViewStream },
          {
            label: camera.status === "online" ? "Stop Stream" : "Start Stream",
            icon: Radio,
            onClick: callbacks.onStreamToggle,
          },
          {
            label: camera.isRecording ? "Stop Recording" : "Start Recording",
            icon: Circle,
            onClick: callbacks.onRecordToggle,
          },
          {
            // D-07 asymmetric: parent's onMaintenanceToggle opens the reason
            // dialog when !maintenanceMode and calls exit directly when
            // maintenanceMode. Existing plumbing is preserved.
            label: camera.maintenanceMode ? "Exit Maintenance" : "Maintenance",
            icon: Wrench,
            onClick: callbacks.onMaintenanceToggle,
          },
          { label: "Copy Camera ID", icon: Copy, onClick: handleCopyCameraId },
          { label: "Copy cURL example", icon: Terminal, onClick: handleCopyCurl },
          { label: "Embed Code", icon: Code, onClick: callbacks.onEmbedCode },
          {
            label: "Delete",
            icon: Trash2,
            onClick: callbacks.onDelete,
            variant: "destructive",
          },
        ]
        return <DataTableRowActions row={row} actions={rowActions} />
      },
    },
  ]
}
