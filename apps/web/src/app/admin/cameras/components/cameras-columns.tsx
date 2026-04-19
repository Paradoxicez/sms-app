"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { formatDistanceToNow } from "date-fns"
import { Pencil, Play, Circle, Code, Trash2, Radio, Wrench } from "lucide-react"

import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"
import { CameraStatusDot } from "@/app/admin/cameras/components/camera-status-badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface CameraRow {
  id: string
  name: string
  status: "online" | "offline" | "degraded" | "connecting" | "reconnecting"
  isRecording: boolean
  maintenanceMode: boolean
  streamUrl: string
  codecInfo?: { video?: string; width?: number; height?: number } | null
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
  online: "ออนไลน์",
  offline: "ออฟไลน์",
  degraded: "สัญญาณไม่เสถียร (Degraded)",
  connecting: "กำลังเชื่อมต่อ…",
  reconnecting: "กำลังเชื่อมต่อใหม่…",
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
                  {camera.isRecording ? "กำลังบันทึก" : "ไม่ได้บันทึก"}
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
                  <TooltipContent>อยู่ในโหมดซ่อมบำรุง — ไม่แจ้งเตือน</TooltipContent>
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
      accessorFn: (row) => row.codecInfo?.video ?? "",
      header: "Codec",
      cell: ({ getValue }) => (
        <span className="text-xs font-mono text-muted-foreground">
          {(getValue() as string) || "\u2014"}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "resolution",
      accessorFn: (row) => {
        const c = row.codecInfo
        return c?.width && c?.height ? `${c.width}x${c.height}` : ""
      },
      header: "Resolution",
      cell: ({ getValue }) => (
        <span className="text-xs font-mono text-muted-foreground">
          {(getValue() as string) || "\u2014"}
        </span>
      ),
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
            label: camera.maintenanceMode
              ? "ออกจากโหมดซ่อมบำรุง"
              : "เข้าโหมดซ่อมบำรุง",
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
