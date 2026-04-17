"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { formatDistanceToNow } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"

export interface PlatformUserRow {
  userId: string
  email: string
  name: string
  role: "admin" | "operator" | "developer" | "viewer"
  orgs: Array<{ id: string; name: string }>
  lastSignInAt?: string | null
}

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  operator: "bg-blue-100 text-blue-700",
  developer: "bg-amber-100 text-amber-700",
  viewer: "bg-neutral-100 text-neutral-700",
}

export function createUsersColumns(
  actions: RowAction<PlatformUserRow>[],
): ColumnDef<PlatformUserRow, unknown>[] {
  return [
    {
      accessorKey: "email",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Email" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("email")}</span>
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
    },
    {
      accessorKey: "role",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Role" />
      ),
      cell: ({ row }) => {
        const role = row.getValue("role") as string
        return (
          <Badge variant="outline" className={ROLE_BADGE_CLASSES[role]}>
            {role}
          </Badge>
        )
      },
      filterFn: (row, id, value: string[]) => {
        return value.includes(row.getValue(id))
      },
    },
    {
      accessorKey: "orgs",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Orgs" />
      ),
      accessorFn: (row) => row.orgs.length,
      cell: ({ row }) => (
        <span title={row.original.orgs.map((o) => o.name).join(", ")}>
          {row.original.orgs.length}
        </span>
      ),
    },
    {
      accessorKey: "lastSignInAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Last Sign-in" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("lastSignInAt") as string | null | undefined
        if (!value) return <span className="text-muted-foreground">&mdash;</span>
        try {
          const date = new Date(value)
          return (
            <span title={date.toLocaleString()}>
              {formatDistanceToNow(date, { addSuffix: true })}
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
