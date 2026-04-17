"use client"

import { useMemo, useState } from "react"
import {
  type ColumnFiltersState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Camera as CameraIcon,
  LayoutGrid,
  Plus,
  TableProperties,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DataTableToolbar,
  DataTablePagination,
  type FacetedFilterConfig,
} from "@/components/ui/data-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

import { type CameraRow, createCamerasColumns } from "./cameras-columns"

interface CamerasDataTableProps {
  cameras: CameraRow[]
  loading: boolean
  onEdit: (camera: CameraRow) => void
  onViewStream: (camera: CameraRow) => void
  onDelete: (camera: CameraRow) => void
  onRecordToggle: (camera: CameraRow) => void
  onEmbedCode: (camera: CameraRow) => void
  onCreateCamera: () => void
  view: "table" | "card"
  onViewChange: (view: "table" | "card") => void
}

export function CamerasDataTable({
  cameras,
  loading,
  onEdit,
  onViewStream,
  onDelete,
  onRecordToggle,
  onEmbedCode,
  onCreateCamera,
  view,
  onViewChange,
}: CamerasDataTableProps) {
  const columns = useMemo(
    () =>
      createCamerasColumns({
        onEdit,
        onViewStream,
        onDelete,
        onRecordToggle,
        onEmbedCode,
      }),
    [onEdit, onViewStream, onDelete, onRecordToggle, onEmbedCode]
  )

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const table = useReactTable({
    data: cameras,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { sorting, columnFilters, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
  })

  const projectOptions = useMemo(
    () =>
      [...new Set(cameras.map((c) => c.site?.project?.name).filter(Boolean))].map(
        (name) => ({ label: name!, value: name! })
      ),
    [cameras]
  )

  const siteOptions = useMemo(
    () =>
      [...new Set(cameras.map((c) => c.site?.name).filter(Boolean))].map(
        (name) => ({ label: name!, value: name! })
      ),
    [cameras]
  )

  const facetedFilters: FacetedFilterConfig[] = [
    {
      columnId: "status",
      title: "Status",
      options: [
        { label: "Online", value: "online" },
        { label: "Offline", value: "offline" },
        { label: "Degraded", value: "degraded" },
        { label: "Connecting", value: "connecting" },
        { label: "Reconnecting", value: "reconnecting" },
      ],
    },
    {
      columnId: "project",
      title: "Project",
      options: projectOptions,
    },
    {
      columnId: "site",
      title: "Site",
      options: siteOptions,
    },
  ]

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        searchKey="name"
        searchPlaceholder="Search cameras..."
        facetedFilters={facetedFilters}
      >
        <Button
          variant={view === "table" ? "default" : "outline"}
          size="icon"
          onClick={() => onViewChange("table")}
        >
          <TableProperties className="size-4" />
          <span className="sr-only">Table view</span>
        </Button>
        <Button
          variant={view === "card" ? "default" : "outline"}
          size="icon"
          onClick={() => onViewChange("card")}
        >
          <LayoutGrid className="size-4" />
          <span className="sr-only">Card view</span>
        </Button>
        <Button onClick={onCreateCamera}>
          <Plus className="mr-2 size-4" />
          Add Camera
        </Button>
      </DataTableToolbar>

      {view === "table" ? (
        <>
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
                    <TableRow key={row.id}>
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
                      <div className="flex flex-col items-center gap-2 py-8">
                        <CameraIcon className="size-12 text-muted-foreground" />
                        <p className="text-sm font-medium">No cameras yet</p>
                        <p className="text-sm text-muted-foreground">
                          Add your first camera to start streaming.
                        </p>
                        <Button size="sm" onClick={onCreateCamera}>
                          <Plus className="mr-2 size-4" />
                          Add Camera
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <DataTablePagination table={table} />
        </>
      ) : (
        <div>
          {/* CameraCardGrid added in Plan 02 */}
        </div>
      )}
    </div>
  )
}
