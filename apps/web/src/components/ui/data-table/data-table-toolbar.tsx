"use client"

import * as React from "react"
import type { Table as ReactTable } from "@tanstack/react-table"
import { Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTableFacetedFilter } from "./data-table-faceted-filter"

interface FacetedFilterConfig {
  columnId: string
  title: string
  options: {
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
  }[]
}

interface DataTableToolbarProps<TData> {
  table: ReactTable<TData>
  searchKey?: string
  searchPlaceholder?: string
  facetedFilters?: FacetedFilterConfig[]
  children?: React.ReactNode
}

function DataTableToolbar<TData>({
  table,
  searchKey,
  searchPlaceholder = "Search...",
  facetedFilters,
  children,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0

  return (
    <div className="flex items-center gap-2">
      {searchKey && (
        <div className="relative max-w-[240px]">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={
              (table.getColumn(searchKey)?.getFilterValue() as string) ?? ""
            }
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              table.getColumn(searchKey)?.setFilterValue(e.target.value)
            }
            className="h-8 pl-8"
          />
        </div>
      )}
      {facetedFilters?.map((filter) => (
        <DataTableFacetedFilter
          key={filter.columnId}
          column={table.getColumn(filter.columnId)}
          title={filter.title}
          options={filter.options}
        />
      ))}
      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => table.resetColumnFilters()}
          className="h-8 px-2 lg:px-3"
        >
          Reset
          <X className="ml-2 size-4" />
        </Button>
      )}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}

export { DataTableToolbar }
export type { DataTableToolbarProps, FacetedFilterConfig }
