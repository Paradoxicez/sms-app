"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Pencil, ToggleLeft, Zap, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"

export interface WebhookRow {
  id: string
  name: string
  url: string
  events: string[]
  isActive: boolean
  createdAt: string
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-700" },
  inactive: { label: "Inactive", className: "bg-neutral-100 text-neutral-700" },
}

const EVENT_BADGE_CLASS = "bg-blue-100 text-blue-700"

interface WebhooksColumnCallbacks {
  onEdit: (webhook: WebhookRow) => void
  onToggle: (webhook: WebhookRow) => void
  onTest: (webhook: WebhookRow) => void
  onDelete: (webhook: WebhookRow) => void
}

export function createWebhooksColumns(
  callbacks: WebhooksColumnCallbacks
): ColumnDef<WebhookRow>[] {
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
      accessorKey: "url",
      header: "URL",
      enableSorting: false,
      cell: ({ row }) => (
        <div
          className="max-w-[200px] truncate font-mono text-xs text-muted-foreground"
          title={row.getValue("url")}
        >
          {row.getValue("url")}
        </div>
      ),
    },
    {
      id: "events",
      header: "Events",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.events.map((e) => (
            <Badge
              key={e}
              variant="outline"
              className={EVENT_BADGE_CLASS}
            >
              {e}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => (row.isActive ? "active" : "inactive"),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const status = row.getValue<string>("status")
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
      id: "actions",
      cell: ({ row }) => {
        const rowActions: RowAction<WebhookRow>[] = [
          { label: "Edit", icon: Pencil, onClick: callbacks.onEdit },
          {
            label: row.original.isActive ? "Disable" : "Enable",
            icon: ToggleLeft,
            onClick: callbacks.onToggle,
          },
          { label: "Test webhook", icon: Zap, onClick: callbacks.onTest },
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
