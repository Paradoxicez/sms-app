"use client"

import { useMemo } from "react"

import { DataTable, type FacetedFilterConfig } from "@/components/ui/data-table"
import {
  createWebhooksColumns,
  type WebhookRow,
} from "./webhooks-columns"

interface WebhooksDataTableProps {
  webhooks: WebhookRow[]
  loading: boolean
  onEdit: (webhook: WebhookRow) => void
  onToggle: (webhook: WebhookRow) => void
  onTest: (webhook: WebhookRow) => void
  onDelete: (webhook: WebhookRow) => void
}

const facetedFilters: FacetedFilterConfig[] = [
  {
    columnId: "status",
    title: "Status",
    options: [
      { label: "Active", value: "active" },
      { label: "Inactive", value: "inactive" },
    ],
  },
]

export function WebhooksDataTable({
  webhooks,
  loading,
  onEdit,
  onToggle,
  onTest,
  onDelete,
}: WebhooksDataTableProps) {
  const columns = useMemo(
    () => createWebhooksColumns({ onEdit, onToggle, onTest, onDelete }),
    [onEdit, onToggle, onTest, onDelete]
  )

  return (
    <DataTable
      columns={columns}
      data={webhooks}
      searchKey="name"
      searchPlaceholder="Search webhooks..."
      facetedFilters={facetedFilters}
      loading={loading}
      emptyState={{
        title: "No webhooks configured",
        description:
          "Get started by adding a webhook to receive event notifications.",
      }}
    />
  )
}
