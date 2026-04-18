"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { formatDistanceToNow } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"

export interface TeamMemberRow {
  userId: string
  name: string
  email: string
  role: "admin" | "operator" | "developer" | "viewer"
  createdAt: string | null
}

const ROLE_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  admin: { label: "Admin", variant: "default" },
  operator: { label: "Operator", variant: "secondary" },
  developer: { label: "Developer", variant: "secondary" },
  viewer: { label: "Viewer", variant: "outline" },
}

export function createTeamColumns(
  actions: RowAction<TeamMemberRow>[],
  currentUserId: string | null,
): ColumnDef<TeamMemberRow, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>,
    },
    {
      accessorKey: "email",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
    },
    {
      accessorKey: "role",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => {
        const role = row.getValue("role") as string
        const badge = ROLE_BADGE[role] ?? ROLE_BADGE.viewer
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => {
        const value = row.getValue("createdAt") as string | null
        if (!value) return <span className="text-muted-foreground">&mdash;</span>
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
      cell: ({ row }) => {
        // Preserve self-removal prevention per Pitfall 5 / T-14-03
        const isSelf = row.original.userId === currentUserId
        if (isSelf) return null
        return <DataTableRowActions row={row} actions={actions} />
      },
    },
  ]
}
