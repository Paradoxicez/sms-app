"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { formatDistanceToNow } from "date-fns"
import { Pencil, Trash2 } from "lucide-react"

import { DataTableColumnHeader, DataTableRowActions, type RowAction } from "@/components/ui/data-table"

export interface ProjectRow {
  id: string
  name: string
  description?: string | null
  createdAt: string
  _count?: { sites: number }
}

interface ProjectsColumnCallbacks {
  onEdit: (project: ProjectRow) => void
  onDelete: (project: ProjectRow) => void
}

export function createProjectsColumns(
  callbacks: ProjectsColumnCallbacks
): ColumnDef<ProjectRow>[] {
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
      id: "sites",
      accessorFn: (row) => row._count?.sites ?? 0,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Sites" />
      ),
      cell: ({ getValue }) => <span>{getValue() as number}</span>,
      size: 100,
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
        const rowActions: RowAction<ProjectRow>[] = [
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
