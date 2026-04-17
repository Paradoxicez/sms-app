"use client"

import type { ColumnDef, Row } from "@tanstack/react-table"
import { formatDistanceToNow } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"

export interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  lastFour: string
  scope: string
  scopeId: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-700" },
  revoked: { label: "Revoked", className: "bg-red-100 text-red-700" },
}

interface CreateApiKeysColumnsOptions {
  activeActions: RowAction<ApiKeyRow>[]
  revokedActions: RowAction<ApiKeyRow>[]
}

export function createApiKeysColumns({
  activeActions,
  revokedActions,
}: CreateApiKeysColumnsOptions): ColumnDef<ApiKeyRow, unknown>[] {
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
      id: "key",
      header: "Key",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.prefix}...{row.original.lastFour}
        </span>
      ),
    },
    {
      accessorKey: "scope",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Scope" />
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("createdAt") as string
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
      accessorKey: "lastUsedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Last Used" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("lastUsedAt") as string | null
        if (!value) {
          return <span className="text-muted-foreground">Never</span>
        }
        try {
          const date = new Date(value)
          return (
            <span title={date.toLocaleString()}>
              {formatDistanceToNow(date, { addSuffix: true })}
            </span>
          )
        } catch {
          return <span className="text-muted-foreground">Never</span>
        }
      },
    },
    {
      id: "status",
      accessorFn: (row) => (row.revokedAt ? "revoked" : "active"),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const status = row.getValue("status") as string
        const badge = STATUS_BADGE[status] ?? STATUS_BADGE.active
        return (
          <Badge variant="outline" className={badge.className}>
            {badge.label}
          </Badge>
        )
      },
      filterFn: (row, id, value: string[]) => {
        return value.includes(row.getValue(id))
      },
    },
    {
      id: "actions",
      cell: ({ row }: { row: Row<ApiKeyRow> }) => {
        const isRevoked = !!row.original.revokedAt
        return (
          <DataTableRowActions
            row={row}
            actions={isRevoked ? revokedActions : activeActions}
          />
        )
      },
    },
  ]
}
