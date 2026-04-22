"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { formatDistanceToNow } from "date-fns"
import { Pencil, Play, Circle, Code, Trash2, Radio, Wrench } from "lucide-react"

import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"
import { CameraStatusDot } from "@/app/admin/cameras/components/camera-status-badge"
import { CodecStatusCell } from "@/app/admin/cameras/components/codec-status-cell"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { normalizeCodecInfo } from "@/lib/codec-info"
import { cn } from "@/lib/utils"

export interface CameraRow {
  id: string
  name: string
  status: "online" | "offline" | "degraded" | "connecting" | "reconnecting"
  isRecording: boolean
  maintenanceMode: boolean
  streamUrl: string
  codecInfo?: unknown
  streamProfileId?: string | null
  location?: { lat: number; lng: number } | null
  description?: string | null
  tags?: string[]
  site?: { id: string; name: string; project?: { id: string; name: string } }
  createdAt: string
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

const statusTooltip: Record<CameraRow["status"], string> = {
  online: "Online",
  offline: "Offline",
  degraded: "Degraded",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
}

export function createCamerasColumns(
  callbacks: CamerasColumnCallbacks
): ColumnDef<CameraRow>[] {
  return [
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const camera = row.original
        return (
          <TooltipProvider>
            <div className="flex items-center gap-1" aria-label="Camera status">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span>
                      <CameraStatusDot status={camera.status} />
                    </span>
                  }
                />
                <TooltipContent>{statusTooltip[camera.status]}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Circle
                      className={cn(
                        "size-3",
                        camera.isRecording
                          ? "fill-red-500 text-red-500"
                          : "text-muted-foreground"
                      )}
                      aria-hidden="true"
                    />
                  }
                />
                <TooltipContent>
                  {camera.isRecording ? "Recording" : "Not recording"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Wrench
                      className={cn(
                        "size-3.5",
                        camera.maintenanceMode
                          ? "text-amber-600 dark:text-amber-500"
                          : "invisible"
                      )}
                      aria-hidden={!camera.maintenanceMode}
                      aria-label={camera.maintenanceMode ? "maintenance" : undefined}
                      role={camera.maintenanceMode ? "img" : undefined}
                    />
                  }
                />
                {camera.maintenanceMode && (
                  <TooltipContent>In maintenance — notifications suppressed</TooltipContent>
                )}
              </Tooltip>
            </div>
          </TooltipProvider>
        )
      },
      size: 72,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("name")}</span>
      ),
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
            label: "Maintenance",
            icon: Wrench,
            onClick: callbacks.onMaintenanceToggle,
          },
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
