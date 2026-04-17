"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { Download, Trash2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"
import { RecordingStatusBadge } from "@/components/recording-status-badge"
import { formatDuration, formatSize } from "@/lib/format-utils"

export interface RecordingRow {
  id: string
  cameraId: string
  status: "recording" | "complete" | "processing" | "error"
  startedAt: string
  stoppedAt: string | null
  totalSize: number | null
  totalDuration: number | null
  initSegment: string | null
  camera: {
    id: string
    name: string
    site: {
      id: string
      name: string
      project: { id: string; name: string }
    }
  }
}

interface RecordingsColumnCallbacks {
  onDownload: (recording: RecordingRow) => void
  onDelete: (recording: RecordingRow) => void
}

export function createRecordingsColumns(
  callbacks: RecordingsColumnCallbacks
): ColumnDef<RecordingRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all recordings"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select recording from ${row.original.camera.name} at ${format(new Date(row.original.startedAt), "HH:mm")}`}
        />
      ),
      enableSorting: false,
      size: 40,
    },
    {
      accessorKey: "camera",
      accessorFn: (row) => row.camera.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Camera" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.camera.name}
        </span>
      ),
    },
    {
      id: "project",
      accessorFn: (row) => row.camera.site.project.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Project" />
      ),
    },
    {
      id: "site",
      accessorFn: (row) => row.camera.site.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Site" />
      ),
    },
    {
      id: "date",
      accessorKey: "startedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => {
        const dateStr = row.original.startedAt
        return format(new Date(dateStr), "MMM d, yyyy")
      },
    },
    {
      id: "timeRange",
      header: "Time Range",
      enableSorting: false,
      cell: ({ row }) => {
        const start = format(new Date(row.original.startedAt), "HH:mm")
        const end = row.original.stoppedAt
          ? format(new Date(row.original.stoppedAt), "HH:mm")
          : "..."
        return `${start} - ${end}`
      },
    },
    {
      accessorKey: "totalDuration",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Duration" />
      ),
      cell: ({ getValue }) => formatDuration(getValue<number | null>()),
    },
    {
      accessorKey: "totalSize",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Size" />
      ),
      cell: ({ getValue }) => formatSize(getValue<number | null>()),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ getValue }) => (
        <RecordingStatusBadge status={getValue<RecordingRow["status"]>()} />
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const recording = row.original
        const rowActions: RowAction<RecordingRow>[] = [
          {
            label: "Download",
            icon: Download,
            onClick: () => callbacks.onDownload(recording),
          },
          {
            label: "Delete",
            icon: Trash2,
            onClick: () => callbacks.onDelete(recording),
            variant: "destructive",
          },
        ]
        return <DataTableRowActions row={row} actions={rowActions} />
      },
    },
  ]
}
