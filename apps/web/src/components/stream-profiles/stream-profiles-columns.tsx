"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Pencil, Copy, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"
import {
  getStreamProfileModeName,
  STREAM_PROFILE_MODE_BADGE,
} from "@/lib/stream-profile-mode"

export interface StreamProfileRow {
  id: string
  name: string
  codec: string
  preset: string | null
  resolution: string | null
  fps: number | null
  videoBitrate: string | null
  audioCodec: string | null
  audioBitrate: string | null
  isDefault: boolean
}

interface StreamProfilesColumnCallbacks {
  onEdit: (profile: StreamProfileRow) => void
  onDuplicate: (profile: StreamProfileRow) => void
  onDelete: (profile: StreamProfileRow) => void
}

export function createStreamProfilesColumns(
  callbacks: StreamProfilesColumnCallbacks
): ColumnDef<StreamProfileRow>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      id: "mode",
      accessorFn: (row) => getStreamProfileModeName(row.codec),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Mode" />
      ),
      cell: ({ row }) => {
        const mode = row.getValue<string>("mode")
        const badgeClass =
          STREAM_PROFILE_MODE_BADGE[
            mode as keyof typeof STREAM_PROFILE_MODE_BADGE
          ] ?? STREAM_PROFILE_MODE_BADGE.Auto
        return (
          <Badge variant="outline" className={badgeClass}>
            {mode}
          </Badge>
        )
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: "resolution",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Resolution" />
      ),
      cell: ({ row }) => {
        const value = row.getValue<string | null>("resolution")
        return <span>{value ?? "\u2014"}</span>
      },
    },
    {
      accessorKey: "fps",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="FPS" />
      ),
      cell: ({ row }) => {
        const value = row.getValue<number | null>("fps")
        return <span>{value != null ? value : "\u2014"}</span>
      },
    },
    {
      accessorKey: "videoBitrate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Video Bitrate" />
      ),
      cell: ({ row }) => {
        const value = row.getValue<string | null>("videoBitrate")
        return <span>{value ? `${value} kbps` : "\u2014"}</span>
      },
    },
    {
      accessorKey: "audioBitrate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Audio Bitrate" />
      ),
      cell: ({ row }) => {
        const value = row.getValue<string | null>("audioBitrate")
        return <span>{value ? `${value} kbps` : "\u2014"}</span>
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const rowActions: RowAction<StreamProfileRow>[] = [
          { label: "Edit", icon: Pencil, onClick: callbacks.onEdit },
          { label: "Duplicate", icon: Copy, onClick: callbacks.onDuplicate },
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
