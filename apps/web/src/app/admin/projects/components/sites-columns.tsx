"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { formatDistanceToNow } from "date-fns"
import { Pencil, Trash2 } from "lucide-react"

import { DataTableColumnHeader, DataTableRowActions, type RowAction } from "@/components/ui/data-table"

export interface SiteRow {
  id: string
  name: string
  description?: string | null
  latitude?: number | null
  longitude?: number | null
  createdAt: string
  _count?: { cameras: number }
}

interface SitesColumnCallbacks {
  onEdit: (site: SiteRow) => void
  onDelete: (site: SiteRow) => void
}

export function createSitesColumns(
  callbacks: SitesColumnCallbacks
): ColumnDef<SiteRow>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("name")}</span>
      ),
      minSize: 160,
    },
    {
      id: "cameras",
      accessorFn: (row) => row._count?.cameras ?? 0,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Cameras" />
      ),
      cell: ({ getValue }) => <span>{getValue() as number}</span>,
      size: 100,
    },
    {
      id: "location",
      header: "Location",
      cell: ({ row }) => {
        const site = row.original
        if (site.latitude != null && site.longitude != null) {
          return (
            <span className="text-sm">
              {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
            </span>
          )
        }
        return <span className="text-sm text-muted-foreground">Not set</span>
      },
      size: 160,
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
            title={new Date(dateStr).toLocaleString()}
          >
            {formatDistanceToNow(new Date(dateStr), { addSuffix: true })}
          </span>
        )
      },
      size: 140,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const rowActions: RowAction<SiteRow>[] = [
          { label: "Edit", icon: Pencil, onClick: callbacks.onEdit },
          {
            label: "Delete",
            icon: Trash2,
            onClick: callbacks.onDelete,
            variant: "destructive",
          },
        ]
        return <DataTableRowActions row={row} actions={rowActions} />
      },
      size: 48,
    },
  ]
}
