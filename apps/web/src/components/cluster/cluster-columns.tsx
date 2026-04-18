"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"
import type { SrsNode } from "@/hooks/use-cluster-nodes"

// --- Preserved domain helpers from node-table.tsx ---

function getMetricColor(value: number | null): string {
  if (value == null) return "bg-muted"
  if (value < 70) return "bg-chart-1"
  if (value < 90) return "bg-chart-4"
  return "bg-chart-5"
}

function MetricBar({ value }: { value: number | null }) {
  const pct = value ?? 0
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-16 rounded-full bg-muted overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${getMetricColor(value)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {value != null ? `${Math.round(pct)}%` : "--"}
      </span>
    </div>
  )
}

const STATUS_CONFIG: Record<
  SrsNode["status"],
  { className: string; label: string }
> = {
  ONLINE: { className: "bg-chart-1 text-white", label: "Online" },
  OFFLINE: { className: "bg-chart-5 text-white", label: "Offline" },
  DEGRADED: { className: "bg-chart-4 text-white", label: "Degraded" },
  CONNECTING: { className: "bg-blue-500 text-white", label: "Connecting" },
}

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  ORIGIN: { label: "Origin", className: "bg-blue-100 text-blue-700" },
  EDGE: { label: "Edge", className: "bg-purple-100 text-purple-700" },
}

// --- Column factory ---

export function createClusterColumns(
  actions: RowAction<SrsNode>[],
): ColumnDef<SrsNode, unknown>[] {
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
      accessorKey: "role",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Role" />
      ),
      cell: ({ row }) => {
        const role = row.getValue("role") as string
        const badge = ROLE_BADGE[role] ?? ROLE_BADGE.EDGE
        return (
          <Badge variant="outline" className={badge.className}>
            {badge.label}
          </Badge>
        )
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const status = row.getValue("status") as SrsNode["status"]
        const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.OFFLINE
        return <Badge className={config.className}>{config.label}</Badge>
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: "cpu",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="CPU" />
      ),
      cell: ({ row }) => <MetricBar value={row.original.cpu} />,
    },
    {
      accessorKey: "memory",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Memory" />
      ),
      cell: ({ row }) => <MetricBar value={row.original.memory} />,
    },
    {
      accessorKey: "activeStreams",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Streams" />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">{row.getValue("activeStreams")}</span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => <DataTableRowActions row={row} actions={actions} />,
    },
  ]
}
