"use client"

import type { Table as ReactTable } from "@tanstack/react-table"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DataTablePaginationProps<TData> {
  table: ReactTable<TData>
}

function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination
  const totalRows = table.getRowCount()
  const pageCount = table.getPageCount()
  const selectedCount = table.getSelectedRowModel().rows.length

  const start = totalRows > 0 ? pageIndex * pageSize + 1 : 0
  const end = Math.min((pageIndex + 1) * pageSize, totalRows)

  // Generate visible page numbers
  const getVisiblePages = (): (number | "ellipsis")[] => {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, i) => i)
    }

    const pages: (number | "ellipsis")[] = []
    const current = pageIndex

    // Always show first page
    pages.push(0)

    if (current > 2) {
      pages.push("ellipsis")
    }

    // Pages around current
    const rangeStart = Math.max(1, current - 1)
    const rangeEnd = Math.min(pageCount - 2, current + 1)

    for (let i = rangeStart; i <= rangeEnd; i++) {
      pages.push(i)
    }

    if (current < pageCount - 3) {
      pages.push("ellipsis")
    }

    // Always show last page
    if (pageCount > 1) {
      pages.push(pageCount - 1)
    }

    return pages
  }

  return (
    <div className="flex items-center justify-between mt-4">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          Showing {start}-{end} of {totalRows}
        </span>
        {selectedCount > 0 && (
          <span>{selectedCount} selected</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page</span>
          <Select
            value={pageSize}
            onValueChange={(value: number | null) => {
              if (value !== null) {
                table.setPageSize(value)
              }
            }}
          >
            <SelectTrigger className="w-[70px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50].map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="size-4" />
            <span className="sr-only">Previous page</span>
          </Button>

          {getVisiblePages().map((page, idx) =>
            page === "ellipsis" ? (
              <span
                key={`ellipsis-${idx}`}
                className="flex size-7 items-center justify-center text-sm text-muted-foreground"
              >
                ...
              </span>
            ) : (
              <Button
                key={page}
                variant={page === pageIndex ? "default" : "outline"}
                size="icon-sm"
                onClick={() => table.setPageIndex(page)}
                aria-current={page === pageIndex ? "page" : undefined}
              >
                {page + 1}
              </Button>
            )
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="size-4" />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

export { DataTablePagination }
export type { DataTablePaginationProps }
