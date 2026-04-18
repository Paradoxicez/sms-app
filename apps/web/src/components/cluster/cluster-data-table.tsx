"use client"

import { useMemo } from "react"
import { Eye, RefreshCw, Trash2 } from "lucide-react"

import { DataTable, type FacetedFilterConfig } from "@/components/ui/data-table"
import type { RowAction } from "@/components/ui/data-table"
import type { SrsNode } from "@/hooks/use-cluster-nodes"

import { createClusterColumns } from "./cluster-columns"

interface ClusterDataTableProps {
  nodes: SrsNode[]
  onViewDetails: (node: SrsNode) => void
  onReloadConfig: (node: SrsNode) => void
  onRemoveNode: (node: SrsNode) => void
}

const facetedFilters: FacetedFilterConfig[] = [
  {
    columnId: "role",
    title: "Role",
    options: [
      { label: "Origin", value: "ORIGIN" },
      { label: "Edge", value: "EDGE" },
    ],
  },
  {
    columnId: "status",
    title: "Status",
    options: [
      { label: "Online", value: "ONLINE" },
      { label: "Offline", value: "OFFLINE" },
      { label: "Degraded", value: "DEGRADED" },
      { label: "Connecting", value: "CONNECTING" },
    ],
  },
]

export function ClusterDataTable({
  nodes,
  onViewDetails,
  onReloadConfig,
  onRemoveNode,
}: ClusterDataTableProps) {
  const actions: RowAction<SrsNode>[] = useMemo(
    () => [
      {
        label: "View Details",
        icon: Eye,
        onClick: (node) => onViewDetails(node),
      },
      {
        label: "Reload Config",
        icon: RefreshCw,
        onClick: (node) => onReloadConfig(node),
      },
      {
        label: "Remove",
        icon: Trash2,
        onClick: (node) => onRemoveNode(node),
        variant: "destructive" as const,
      },
    ],
    [onViewDetails, onReloadConfig, onRemoveNode],
  )

  const columns = useMemo(() => createClusterColumns(actions), [actions])

  return (
    <DataTable
      columns={columns}
      data={nodes}
      searchKey="name"
      searchPlaceholder="Filter nodes..."
      facetedFilters={facetedFilters}
      emptyState={{
        title: "No cluster nodes",
        description:
          "Register your first SRS node to start streaming.",
      }}
    />
  )
}
