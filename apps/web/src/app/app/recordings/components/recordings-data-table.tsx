"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { type ColumnFiltersState } from "@tanstack/react-table"
import { type DateRange } from "react-day-picker"
import { Trash2, Download, Loader2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { apiFetch } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DataTable, type FacetedFilterConfig } from "@/components/ui/data-table"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  createRecordingsColumns,
  type RecordingRow,
} from "./recordings-columns"

interface RecordingsResponse {
  data: RecordingRow[]
  total: number
  page: number
  pageSize: number
}

interface FilterOption {
  id: string
  name: string
}

export function RecordingsDataTable() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // --- URL param state ---
  const page = Number(searchParams.get("page") ?? "1")
  const pageSize = Number(searchParams.get("pageSize") ?? "10")
  const search = searchParams.get("search") ?? ""
  const cameraFilter = searchParams.get("camera") ?? ""
  const projectFilter = searchParams.get("project") ?? ""
  const siteFilter = searchParams.get("site") ?? ""
  const statusFilter = searchParams.get("status") ?? ""
  const fromDate = searchParams.get("from") ?? ""
  const toDate = searchParams.get("to") ?? ""

  // --- Local state ---
  const [data, setData] = React.useState<RecordingRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [selectedRows, setSelectedRows] = React.useState<RecordingRow[]>([])

  // Filter options
  const [cameras, setCameras] = React.useState<FilterOption[]>([])
  const [projects, setProjects] = React.useState<FilterOption[]>([])
  const [sites, setSites] = React.useState<FilterOption[]>([])

  // Refetch counter
  const [refetchCounter, setRefetchCounter] = React.useState(0)

  // Delete dialog state
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)
  const [singleDeleteTarget, setSingleDeleteTarget] =
    React.useState<RecordingRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Bulk download progress state
  const [bulkDownloadOpen, setBulkDownloadOpen] = React.useState(false)
  const [downloadProgress, setDownloadProgress] = React.useState({
    current: 0,
    total: 0,
    name: "",
    status: "idle" as "idle" | "processing" | "ready" | "error",
  })

  // Debounced search
  const [searchInput, setSearchInput] = React.useState(search)
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )

  // Guard to skip URL update on initial column filter sync
  const columnFilterInitRef = React.useRef(true)

  React.useEffect(() => {
    setSearchInput(search)
  }, [search])

  // --- URL update helper ---
  const updateUrlParams = React.useCallback(
    (updates: Record<string, string | undefined>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      })
      if (resetPage && !("page" in updates)) {
        params.set("page", "1")
      }
      router.replace(`?${params.toString()}`)
    },
    [searchParams, router]
  )

  // --- Fetch filter options (each independently so one failure doesn't break all) ---
  React.useEffect(() => {
    apiFetch<FilterOption[]>("/api/cameras")
      .then((res) => {
        const arr = Array.isArray(res) ? res : []
        setCameras(arr.map((c) => ({ id: c.id, name: c.name })))
      })
      .catch(() => {})

    apiFetch<FilterOption[]>("/api/projects")
      .then((res) => {
        const arr = Array.isArray(res) ? res : []
        setProjects(arr.map((p) => ({ id: p.id, name: p.name })))
      })
      .catch(() => {})

    apiFetch<FilterOption[]>("/api/sites")
      .then((res) => {
        const arr = Array.isArray(res) ? res : []
        setSites(arr.map((s) => ({ id: s.id, name: s.name })))
      })
      .catch(() => {})
  }, [])

  // --- Fetch recordings data ---
  React.useEffect(() => {
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("page", String(page))
        params.set("pageSize", String(pageSize))
        if (search) params.set("search", search)
        if (cameraFilter) params.set("cameraId", cameraFilter)
        if (projectFilter) params.set("projectId", projectFilter)
        if (siteFilter) params.set("siteId", siteFilter)
        if (statusFilter) params.set("status", statusFilter)
        if (fromDate) params.set("startDate", fromDate)
        if (toDate) params.set("endDate", toDate)

        const res = await apiFetch<RecordingsResponse>(
          `/api/recordings?${params.toString()}`
        )
        if (!cancelled) {
          setData(res.data)
          setTotal(res.total)
        }
      } catch {
        if (!cancelled) {
          setData([])
          setTotal(0)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchData()
    return () => {
      cancelled = true
    }
  }, [
    page,
    pageSize,
    search,
    cameraFilter,
    projectFilter,
    siteFilter,
    statusFilter,
    fromDate,
    toDate,
    refetchCounter,
  ])

  const refetch = React.useCallback(() => {
    setRefetchCounter((c) => c + 1)
  }, [])

  // --- Sync DataTable column filter changes → URL params ---
  const handleColumnFiltersChange = React.useCallback(
    (filters: ColumnFiltersState) => {
      if (columnFilterInitRef.current) {
        columnFilterInitRef.current = false
        return
      }

      const updates: Record<string, string | undefined> = {}

      const cameraVal = filters.find((f) => f.id === "camera")?.value as
        | string[]
        | undefined
      updates.camera = cameraVal?.length ? cameraVal.join(",") : undefined

      const projectVal = filters.find((f) => f.id === "project")?.value as
        | string[]
        | undefined
      updates.project = projectVal?.length ? projectVal.join(",") : undefined

      const siteVal = filters.find((f) => f.id === "site")?.value as
        | string[]
        | undefined
      updates.site = siteVal?.length ? siteVal.join(",") : undefined

      const statusVal = filters.find((f) => f.id === "status")?.value as
        | string[]
        | undefined
      updates.status = statusVal?.length ? statusVal.join(",") : undefined

      updateUrlParams(updates)
    },
    [updateUrlParams]
  )

  // --- Callbacks ---
  const handleDownload = React.useCallback(async (recording: RecordingRow) => {
    try {
      window.open(`/api/recordings/${recording.id}/download`, "_blank")
      toast("Download started")
    } catch {
      toast.error("Failed to start download")
    }
  }, [])

  const handleBulkDownload = React.useCallback(async () => {
    const ids = selectedRows.map((r) => r.id)
    setBulkDownloadOpen(true)
    setDownloadProgress({ current: 0, total: ids.length, name: "", status: "processing" })

    try {
      const res = await fetch("/api/recordings/bulk-download", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })

      if (!res.ok || !res.body) throw new Error("Failed")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split("\n\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          const match = line.match(/^data: (.+)$/m)
          if (!match) continue
          const event = JSON.parse(match[1])

          if (event.type === "progress") {
            setDownloadProgress({
              current: event.current,
              total: event.total,
              name: event.name,
              status: "processing",
            })
          } else if (event.type === "ready") {
            setDownloadProgress((prev) => ({ ...prev, status: "ready" }))
            window.open(`/api/recordings/bulk-download/${event.jobId}`, "_blank")
            toast(`${ids.length} recordings ready for download`)
          } else if (event.type === "error") {
            setDownloadProgress((prev) => ({ ...prev, status: "error" }))
            toast.error("Failed to create download")
          }
        }
      }
    } catch {
      setDownloadProgress((prev) => ({ ...prev, status: "error" }))
      toast.error("Failed to create download")
    }
  }, [selectedRows])

  const handleSingleDelete = React.useCallback((recording: RecordingRow) => {
    setSingleDeleteTarget(recording)
  }, [])

  const confirmSingleDelete = React.useCallback(async () => {
    if (!singleDeleteTarget) return
    setDeleting(true)
    try {
      await apiFetch(`/api/recordings/${singleDeleteTarget.id}`, {
        method: "DELETE",
      })
      toast("Recording deleted")
      setSingleDeleteTarget(null)
      refetch()
    } catch {
      toast.error("Failed to delete recording")
    } finally {
      setDeleting(false)
    }
  }, [singleDeleteTarget, refetch])

  const confirmBulkDelete = React.useCallback(async () => {
    const ids = selectedRows.map((r) => r.id)
    const count = ids.length
    setDeleting(true)
    try {
      const res = await apiFetch<{ deleted: number; failed: number }>(
        "/api/recordings/bulk",
        {
          method: "DELETE",
          body: JSON.stringify({ ids }),
        }
      )
      if (res.failed > 0) {
        toast.error(
          `Deleted ${res.deleted} of ${count} recordings. ${res.failed} failed.`
        )
      } else {
        toast(`Deleted ${count} recording${count > 1 ? "s" : ""}`)
      }
      setBulkDeleteOpen(false)
      setSelectedRows([])
      refetch()
    } catch {
      toast.error("Failed to delete recordings")
    } finally {
      setDeleting(false)
    }
  }, [selectedRows, refetch])

  // --- Columns ---
  const columns = React.useMemo(
    () =>
      createRecordingsColumns({
        onDownload: handleDownload,
        onDelete: handleSingleDelete,
      }),
    [handleDownload, handleSingleDelete]
  )

  // --- Faceted filter config ---
  const facetedFilters: FacetedFilterConfig[] = React.useMemo(
    () => [
      {
        columnId: "camera",
        title: "Camera",
        options: cameras.map((c) => ({ label: c.name, value: c.id })),
      },
      {
        columnId: "project",
        title: "Project",
        options: projects.map((p) => ({ label: p.name, value: p.id })),
      },
      {
        columnId: "site",
        title: "Site",
        options: sites.map((s) => ({ label: s.name, value: s.id })),
      },
      {
        columnId: "status",
        title: "Status",
        options: [
          { label: "Complete", value: "complete" },
          { label: "Recording", value: "recording" },
          { label: "Processing", value: "processing" },
          { label: "Error", value: "error" },
        ],
      },
    ],
    [cameras, projects, sites]
  )

  const hasActiveFilters =
    !!search ||
    !!cameraFilter ||
    !!projectFilter ||
    !!siteFilter ||
    !!statusFilter ||
    !!fromDate ||
    !!toDate

  const clearAllFilters = React.useCallback(() => {
    router.replace("?")
  }, [router])

  const dateRange: DateRange | undefined = React.useMemo(() => {
    if (!fromDate && !toDate) return undefined
    return {
      from: fromDate ? new Date(fromDate) : undefined,
      to: toDate ? new Date(toDate) : undefined,
    }
  }, [fromDate, toDate])

  const handleDateRangeChange = React.useCallback(
    (range: DateRange | undefined) => {
      updateUrlParams({
        from: range?.from ? range.from.toISOString().split("T")[0] : undefined,
        to: range?.to ? range.to.toISOString().split("T")[0] : undefined,
      })
    },
    [updateUrlParams]
  )

  const handleSearchChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setSearchInput(value)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      searchTimerRef.current = setTimeout(() => {
        updateUrlParams({ search: value || undefined })
      }, 300)
    },
    [updateUrlParams]
  )

  React.useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  const handlePaginationChange = React.useCallback(
    (p: { pageIndex: number; pageSize: number }) => {
      updateUrlParams(
        {
          page: String(p.pageIndex + 1),
          pageSize: String(p.pageSize),
        },
        false
      )
    },
    [updateUrlParams]
  )

  const emptyState = React.useMemo(() => {
    if (hasActiveFilters) {
      return {
        title: "No recordings found",
        description: "Try adjusting your search or filter criteria.",
        action: (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            aria-label="Clear all active filters"
          >
            Clear filters
          </Button>
        ),
      }
    }
    return {
      title: "No recordings yet",
      description:
        "Recordings will appear here when cameras start recording. Go to Cameras to start a recording.",
      action: (
        <Link href="/app/cameras">
          <Button variant="ghost" size="sm">
            Go to Cameras
          </Button>
        </Link>
      ),
    }
  }, [hasActiveFilters, clearAllFilters])

  const selectedCount = selectedRows.length

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        facetedFilters={facetedFilters}
        enableRowSelection
        onRowSelectionChange={setSelectedRows}
        onColumnFiltersChange={handleColumnFiltersChange}
        pageCount={Math.ceil(total / pageSize) || 1}
        onPaginationChange={handlePaginationChange}
        loading={loading}
        emptyState={emptyState}
        toolbar={
          <div className="flex items-center gap-2 flex-1">
            <Input
              placeholder="Search recordings..."
              value={searchInput}
              onChange={handleSearchChange}
              className="h-8 w-[240px]"
            />
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              placeholder="Date range"
              className="h-8 w-[260px]"
            />
            {selectedCount > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDownload}
                  aria-label={`Download ${selectedCount} selected recordings`}
                >
                  <Download className="mr-2 size-4" />
                  Download ({selectedCount})
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(true)}
                  aria-label={`Delete ${selectedCount} selected recordings`}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete ({selectedCount})
                </Button>
              </div>
            )}
          </div>
        }
      />

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} Recording{selectedCount > 1 ? "s" : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedCount} selected recording
              {selectedCount > 1 ? "s" : ""} and their files. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmBulkDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedCount} Recording${selectedCount > 1 ? "s" : ""}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single delete confirmation */}
      <AlertDialog
        open={!!singleDeleteTarget}
        onOpenChange={(open) => {
          if (!open) setSingleDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recording</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this recording and its files. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmSingleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Recording"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk download progress */}
      <AlertDialog
        open={bulkDownloadOpen}
        onOpenChange={(open) => {
          if (!open && downloadProgress.status !== "processing") {
            setBulkDownloadOpen(false)
            setDownloadProgress({ current: 0, total: 0, name: "", status: "idle" })
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {downloadProgress.status === "processing"
                ? "Preparing Download..."
                : downloadProgress.status === "ready"
                  ? "Download Ready"
                  : downloadProgress.status === "error"
                    ? "Download Failed"
                    : "Download"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block space-y-3">
                {downloadProgress.status === "processing" && (
                  <>
                    <div className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      <span>
                        Processing recording {downloadProgress.current} of{" "}
                        {downloadProgress.total}
                      </span>
                    </div>
                    {downloadProgress.name && (
                      <p className="text-xs text-muted-foreground truncate">
                        {downloadProgress.name}
                      </p>
                    )}
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{
                          width: `${downloadProgress.total > 0 ? (downloadProgress.current / downloadProgress.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </>
                )}
                {downloadProgress.status === "ready" && (
                  <p>Your recordings have been packaged into a zip file.</p>
                )}
                {downloadProgress.status === "error" && (
                  <p>Something went wrong while preparing the download.</p>
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {downloadProgress.status !== "processing" && (
              <AlertDialogCancel>Close</AlertDialogCancel>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
