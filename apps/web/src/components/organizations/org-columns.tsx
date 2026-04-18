"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { formatDistanceToNow } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"

export interface OrgRow {
  id: string
  name: string
  slug: string
  createdAt: string
  isActive: boolean
  memberCount: number
  packageName: string | null
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-700" },
  inactive: { label: "Inactive", className: "bg-red-100 text-red-700" },
}

export function createOrgColumns(
  actions: RowAction<OrgRow>[],
): ColumnDef<OrgRow, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>,
    },
    {
      accessorKey: "slug",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Slug" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("slug")}</span>,
    },
    {
      accessorKey: "packageName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Package" />,
      cell: ({ row }) => {
        const pkg = row.getValue("packageName") as string | null
        if (!pkg) return <span className="text-muted-foreground text-xs">None</span>
        return <Badge variant="secondary">{pkg}</Badge>
      },
    },
    {
      accessorKey: "memberCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Members" />,
    },
    {
      id: "status",
      accessorFn: (row) => (row.isActive ? "active" : "inactive"),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const status = row.getValue("status") as string
        const badge = STATUS_BADGE[status] ?? STATUS_BADGE.inactive
        return (
          <Badge variant="outline" className={badge.className}>
            {badge.label}
          </Badge>
        )
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => {
        const value = row.getValue("createdAt") as string
        try {
          return (
            <span className="text-muted-foreground text-xs" title={new Date(value).toLocaleString()}>
              {formatDistanceToNow(new Date(value), { addSuffix: true })}
            </span>
          )
        } catch {
          return <span className="text-muted-foreground">&mdash;</span>
        }
      },
    },
    {
      id: "actions",
      cell: ({ row }) => <DataTableRowActions row={row} actions={actions} />,
    },
  ]
}
