"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { formatDistanceToNow } from "date-fns"
import { Pencil, Play, Circle, Code, Trash2 } from "lucide-react"

import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"
import { CameraStatusDot } from "@/app/admin/cameras/components/camera-status-badge"

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
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <CameraStatusDot status={row.getValue("status")} />
      ),
      size: 48,
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
            label: camera.isRecording ? "Stop Recording" : "Start Recording",
            icon: Circle,
            onClick: callbacks.onRecordToggle,
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
