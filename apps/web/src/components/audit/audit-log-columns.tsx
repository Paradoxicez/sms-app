"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"

import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"
import { deriveActionLabel } from "@/lib/audit/derive-action-label"

export interface AuditLogRow {
  id: string
  orgId: string
  createdAt: string
  userId: string | null
  action: "create" | "update" | "delete"
  resource: string
  resourceId: string | null
  ip: string
  details: Record<string, unknown> | null
  method: string
  path: string
  user?: { name: string | null; email: string } | null
  orgName?: string
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  update: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

interface AuditLogColumnsOptions {
  showOrganization?: boolean
  /**
   * When true, the Resource column is omitted from the rendered columns.
   * Used by the camera View Stream sheet's Activity tab, which is already
   * scoped to one camera and so the Resource column adds noise.
   * Other callers (global /admin/audit-log, tenant audit-log) leave this
   * unset so the column stays visible.
   */
  hideResourceColumn?: boolean
}

export function createAuditLogColumns(
  actions: RowAction<AuditLogRow>[],
  options?: AuditLogColumnsOptions,
): ColumnDef<AuditLogRow, unknown>[] {
  return [
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Timestamp" />
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue("createdAt") as string)
        return (
          <span className="font-mono text-xs whitespace-nowrap">
            {format(date, "MMM d, yyyy HH:mm:ss")}
          </span>
        )
      },
    },
    ...(options?.showOrganization
      ? [
          {
            accessorKey: "orgName",
            header: ({ column }: any) => (
              <DataTableColumnHeader column={column} title="Organization" />
            ),
            cell: ({ row }: any) => {
              const orgName = row.getValue("orgName") as string | undefined
              return <span className="text-sm">{orgName || "Unknown"}</span>
            },
            filterFn: (row: any, id: string, value: string[]) =>
              value.includes(row.getValue(id) as string),
          } satisfies ColumnDef<AuditLogRow, unknown>,
        ]
      : []),
    {
      id: "actor",
      accessorFn: (row) => row.user?.name || row.user?.email || "System",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Actor" />
      ),
      cell: ({ row }) => {
        const user = row.original.user
        return (
          <div>
            <span className="text-sm">
              {user?.name || "System"}
            </span>
            {user?.email && (
              <span className="block text-xs text-muted-foreground">
                {user.email}
              </span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "action",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Action" />
      ),
      cell: ({ row }) => {
        const derived = deriveActionLabel(row.original)
        if (derived.fallback) {
          // Unmapped entry — keep the original color-coded pill so the global
          // /admin/audit-log + tenant audit-log pages look unchanged.
          const action = row.getValue("action") as string
          const colorClass = ACTION_COLORS[action] || "bg-gray-100 text-gray-700"
          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colorClass}`}
            >
              {action}
            </span>
          )
        }
        // Mapped entry — render the specific verb as plain text (no pill).
        return <span className="text-sm">{derived.label}</span>
      },
      filterFn: (row, id, value: string[]) => {
        // Filter on the underlying generic action verb so the existing
        // Create/Update/Delete faceted filter still works after the cell
        // started rendering specific verbs.
        return value.includes(row.getValue(id) as string)
      },
    },
    ...(options?.hideResourceColumn
      ? []
      : [
          {
            accessorKey: "resource",
            header: ({ column }: any) => (
              <DataTableColumnHeader column={column} title="Resource" />
            ),
            cell: ({ row }: any) => {
              const resource = row.getValue("resource") as string
              const resourceId = row.original.resourceId
              return (
                <div>
                  <span className="text-sm">{resource}</span>
                  {resourceId && (
                    <span className="block text-xs text-muted-foreground font-mono">
                      {resourceId}
                    </span>
                  )}
                </div>
              )
            },
          } satisfies ColumnDef<AuditLogRow, unknown>,
        ]),
    {
      accessorKey: "ip",
      header: "IP Address",
      cell: ({ row }) => {
        const ip = row.getValue("ip") as string | null
        return <span className="font-mono text-xs">{ip || "-"}</span>
      },
      enableSorting: false,
    },
    {
      id: "actions",
      cell: ({ row }) => <DataTableRowActions row={row} actions={actions} />,
    },
  ]
}
