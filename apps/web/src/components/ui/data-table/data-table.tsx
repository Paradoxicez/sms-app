"use client"

import * as React from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { DataTableToolbar, type FacetedFilterConfig } from "./data-table-toolbar"
import { DataTablePagination } from "./data-table-pagination"

interface EmptyStateConfig {
  icon?: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  searchPlaceholder?: string
  facetedFilters?: FacetedFilterConfig[]
  toolbar?: React.ReactNode
  enableRowSelection?: boolean
  onRowSelectionChange?: (rows: TData[]) => void
  pageCount?: number
  onPaginationChange?: (pagination: {
    pageIndex: number
    pageSize: number
  }) => void
  onColumnFiltersChange?: (filters: ColumnFiltersState) => void
  loading?: boolean
  emptyState?: EmptyStateConfig
  onRowClick?: (row: TData) => void
  initialState?: {
    sorting?: SortingState
    columnVisibility?: VisibilityState
  }
}

function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder,
  facetedFilters,
  toolbar,
  enableRowSelection = false,
  onRowSelectionChange,
  pageCount: externalPageCount,
  onPaginationChange,
  onColumnFiltersChange: onColumnFiltersChangeProp,
  loading = false,
  emptyState,
  onRowClick,
  initialState,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(
    initialState?.sorting ?? []
  )
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(initialState?.columnVisibility ?? {})
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  const isServerSide = externalPageCount !== undefined

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
    enableRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    ...(isServerSide
      ? {
          manualPagination: true,
          manualSorting: true,
          manualFiltering: true,
          pageCount: externalPageCount,
        }
      : {
          getSortedRowModel: getSortedRowModel(),
          getFilteredRowModel: getFilteredRowModel(),
          getPaginationRowModel: getPaginationRowModel(),
        }),
  })

  // Notify parent of pagination changes (server-side mode)
  React.useEffect(() => {
    if (onPaginationChange) {
      onPaginationChange(pagination)
    }
  }, [pagination, onPaginationChange])

  // Notify parent of column filter changes (server-side mode)
  React.useEffect(() => {
    if (onColumnFiltersChangeProp) {
      onColumnFiltersChangeProp(columnFilters)
    }
  }, [columnFilters, onColumnFiltersChangeProp])

  // Notify parent of row selection changes
  React.useEffect(() => {
    if (onRowSelectionChange) {
      onRowSelectionChange(
        table.getSelectedRowModel().rows.map((r) => r.original)
      )
    }
  }, [rowSelection, onRowSelectionChange, table])

  const isFiltered = columnFilters.length > 0

  return (
    <div className="space-y-4">
      {(searchKey || facetedFilters?.length || toolbar) && (
        <DataTableToolbar
          table={table}
          searchKey={searchKey}
          searchPlaceholder={searchPlaceholder}
          facetedFilters={facetedFilters}
        >
          {toolbar}
        </DataTableToolbar>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              // Skeleton loading state
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((_, j) => (
                    <TableCell key={`skeleton-cell-${i}-${j}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={onRowClick ? "cursor-pointer" : undefined}
                  onClick={
                    onRowClick ? () => onRowClick(row.original) : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onRowClick(row.original)
                          }
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {isFiltered ? (
                    <div className="flex flex-col items-center gap-2 py-8">
                      <p className="text-sm text-muted-foreground">
                        No results found
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => table.resetColumnFilters()}
                      >
                        Clear filters
                      </Button>
                    </div>
                  ) : emptyState ? (
                    <div className="flex flex-col items-center gap-2 py-8">
                      {emptyState.icon}
                      <p className="text-sm font-medium">{emptyState.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {emptyState.description}
                      </p>
                      {emptyState.action}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No results.
                    </p>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} />
    </div>
  )
}

export { DataTable }
export type { DataTableProps, EmptyStateConfig }
