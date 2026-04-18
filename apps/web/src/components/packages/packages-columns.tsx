"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Pencil, ToggleLeft, ToggleRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"

export interface PackageRow {
  id: string
  name: string
  description?: string | null
  maxCameras: number
  maxViewers: number
  maxBandwidthMbps: number
  maxStorageGb: number
  features: Record<string, boolean>
  isActive: boolean
  createdAt: string
}

interface PackagesColumnCallbacks {
  onEdit: (pkg: PackageRow) => void
  onToggleActive: (pkg: PackageRow) => void
}

export function createPackagesColumns(
  callbacks: PackagesColumnCallbacks
): ColumnDef<PackageRow>[] {
  return [
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
      accessorKey: "maxCameras",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Cameras" />
      ),
    },
    {
      accessorKey: "maxViewers",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Viewers" />
      ),
    },
    {
      accessorKey: "maxBandwidthMbps",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Bandwidth" />
      ),
      cell: ({ row }) => (
        <span>{row.getValue<number>("maxBandwidthMbps")} Mbps</span>
      ),
    },
    {
      accessorKey: "maxStorageGb",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Storage" />
      ),
      cell: ({ row }) => (
        <span>{row.getValue<number>("maxStorageGb")} GB</span>
      ),
    },
    {
      id: "featureCount",
      accessorFn: (row) =>
        Object.values(row.features || {}).filter(Boolean).length,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Features" />
      ),
      cell: ({ row }) => {
        const count = row.getValue<number>("featureCount")
        return (
          <Badge variant="secondary">
            {count} feature{count !== 1 ? "s" : ""}
          </Badge>
        )
      },
    },
    {
      id: "status",
      accessorFn: (row) => (row.isActive ? "active" : "inactive"),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const active = row.original.isActive
        return (
          <Badge variant={active ? "default" : "destructive"}>
            {active ? "Active" : "Inactive"}
          </Badge>
        )
      },
      filterFn: (row, id, value: string[]) =>
        value.includes(row.getValue(id)),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const pkg = row.original
        const actions: RowAction<PackageRow>[] = [
          { label: "Edit", icon: Pencil, onClick: callbacks.onEdit },
          {
            label: pkg.isActive ? "Deactivate" : "Activate",
            icon: pkg.isActive ? ToggleLeft : ToggleRight,
            onClick: callbacks.onToggleActive,
            variant: pkg.isActive ? "destructive" : "default",
          },
        ]
        return <DataTableRowActions row={row} actions={actions} />
      },
    },
  ]
}
