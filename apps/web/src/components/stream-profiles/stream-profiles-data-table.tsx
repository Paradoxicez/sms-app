"use client"

import { useMemo } from "react"

import { DataTable, type FacetedFilterConfig } from "@/components/ui/data-table"
import {
  createStreamProfilesColumns,
  type StreamProfileRow,
} from "./stream-profiles-columns"

interface StreamProfilesDataTableProps {
  profiles: StreamProfileRow[]
  loading: boolean
  onEdit: (profile: StreamProfileRow) => void
  onDuplicate: (profile: StreamProfileRow) => void
  onDelete: (profile: StreamProfileRow) => void
}

const facetedFilters: FacetedFilterConfig[] = [
  {
    columnId: "mode",
    title: "Mode",
    options: [
      { label: "Passthrough", value: "Passthrough" },
      { label: "Transcode", value: "Transcode" },
    ],
  },
]

export function StreamProfilesDataTable({
  profiles,
  loading,
  onEdit,
  onDuplicate,
  onDelete,
}: StreamProfilesDataTableProps) {
  const columns = useMemo(
    () => createStreamProfilesColumns({ onEdit, onDuplicate, onDelete }),
    [onEdit, onDuplicate, onDelete]
  )

  return (
    <DataTable
      columns={columns}
      data={profiles}
      searchKey="name"
      searchPlaceholder="Search profiles..."
      facetedFilters={facetedFilters}
      loading={loading}
      emptyState={{
        title: "No stream profiles yet",
        description:
          "Get started by creating your first stream profile.",
      }}
    />
  )
}
