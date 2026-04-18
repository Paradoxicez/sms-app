"use client"

import { useMemo } from "react"

import { DataTable, type FacetedFilterConfig } from "@/components/ui/data-table"
import {
  createPackagesColumns,
  type PackageRow,
} from "./packages-columns"

interface PackagesDataTableProps {
  packages: PackageRow[]
  loading: boolean
  onEdit: (pkg: PackageRow) => void
  onToggleActive: (pkg: PackageRow) => void
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

export function PackagesDataTable({
  packages,
  loading,
  onEdit,
  onToggleActive,
}: PackagesDataTableProps) {
  const columns = useMemo(
    () => createPackagesColumns({ onEdit, onToggleActive }),
    [onEdit, onToggleActive]
  )

  return (
    <DataTable
      columns={columns}
      data={packages}
      searchKey="name"
      searchPlaceholder="Search packages..."
      facetedFilters={facetedFilters}
      loading={loading}
      emptyState={{
        title: "No packages defined",
        description: "Create a package to set limits for organizations.",
      }}
    />
  )
}
