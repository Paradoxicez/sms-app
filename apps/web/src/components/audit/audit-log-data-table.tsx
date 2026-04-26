"use client"

import * as React from "react"
import { Eye } from "lucide-react"
import { type DateRange } from "react-day-picker"

import { apiFetch } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { DataTable, type FacetedFilterConfig } from "@/components/ui/data-table"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { AuditDetailDialog } from "./audit-detail-dialog"
import { createAuditLogColumns, type AuditLogRow } from "./audit-log-columns"

interface AuditLogDataTableProps {
  apiUrl?: string
  showOrganization?: boolean
  /**
   * When true, the Resource column is hidden. Used by the camera View Stream
   * sheet's Activity tab where the table is already scoped to one camera.
   * Default false — global /admin/audit-log and tenant audit-log keep the
   * column visible.
   */
  hideResourceColumn?: boolean
}

interface AuditResponse {
  items: AuditLogRow[]
  totalCount: number
}

const ACTION_FILTER_CONFIG: FacetedFilterConfig[] = [
  {
    columnId: "action",
    title: "Action",
    options: [
      { label: "Create", value: "create" },
      { label: "Update", value: "update" },
      { label: "Delete", value: "delete" },
    ],
  },
]

export function AuditLogDataTable({
  apiUrl = "/api/audit-log",
  showOrganization,
  hideResourceColumn,
}: AuditLogDataTableProps) {
  const [data, setData] = React.useState<AuditLogRow[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 25 })
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined)
  const [search, setSearch] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [actionFilter, setActionFilter] = React.useState<string[]>([])

  // Detail dialog state
  const [selectedEntry, setSelectedEntry] = React.useState<AuditLogRow | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      // Reset to first page on search change
      setPagination((prev) => ({ ...prev, pageIndex: 0 }))
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Track action filter changes from the DataTable column filter state
  // We use a ref + callback pattern to extract filter values
  const actionFilterRef = React.useRef<string[]>([])

  const columns = React.useMemo(
    () =>
      createAuditLogColumns(
        [
          {
            label: "View Details",
            icon: Eye,
            onClick: (row) => {
              setSelectedEntry(row)
              setDetailOpen(true)
            },
          },
        ],
        { showOrganization, hideResourceColumn },
      ),
    [showOrganization, hideResourceColumn],
  )

  // Build dynamic org filter from fetched data when showOrganization is enabled
  const orgFilterConfig = React.useMemo<FacetedFilterConfig[]>(() => {
    if (!showOrganization) return []
    const uniqueOrgs = [
      ...new Set(data.map((d) => d.orgName).filter(Boolean)),
    ] as string[]
    return [
      {
        columnId: "orgName",
        title: "Organization",
        options: uniqueOrgs.map((name) => ({ label: name, value: name })),
      },
    ]
  }, [data, showOrganization])

  const allFilters = React.useMemo(
    () => [...ACTION_FILTER_CONFIG, ...orgFilterConfig],
    [orgFilterConfig],
  )

  // Fetch data
  React.useEffect(() => {
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      try {
        // Build the query string by MERGING any preset params already on
        // `apiUrl` (e.g. the camera Activity tab passes
        // `/api/audit-log?resource=camera&resourceId=<id>`) with the runtime
        // params produced here. Naively concatenating with `?` produced URLs
        // with two `?` separators, which corrupted the preset values — see
        // .planning/debug/resolved/view-stream-activity-tab-no-events.md
        // (Bug #2). Using URL with a base lets us treat relative paths
        // uniformly; window.location.origin is only used for parsing and is
        // stripped before we hand the result to apiFetch (which itself
        // expects a relative path).
        const url = new URL(apiUrl, window.location.origin)
        url.searchParams.set("page", String(pagination.pageIndex + 1))
        url.searchParams.set("pageSize", String(pagination.pageSize))

        if (debouncedSearch) {
          url.searchParams.set("search", debouncedSearch)
        }
        if (actionFilter.length === 1) {
          // Single action filter - send as API param
          url.searchParams.set("action", actionFilter[0])
        }
        if (dateRange?.from) {
          url.searchParams.set("dateFrom", dateRange.from.toISOString())
        }
        if (dateRange?.to) {
          const end = new Date(dateRange.to)
          end.setHours(23, 59, 59, 999)
          url.searchParams.set("dateTo", end.toISOString())
        }

        const res = await apiFetch<AuditResponse>(`${url.pathname}${url.search}`)
        if (!cancelled) {
          setData(res.items)
          setTotalCount(res.totalCount)
        }
      } catch {
        if (!cancelled) {
          setData([])
          setTotalCount(0)
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
  }, [apiUrl, pagination.pageIndex, pagination.pageSize, debouncedSearch, actionFilter, dateRange])

  // Handle pagination change from DataTable
  const handlePaginationChange = React.useCallback(
    (p: { pageIndex: number; pageSize: number }) => {
      setPagination(p)
    },
    [],
  )

  // Handle date range change - reset to first page
  const handleDateRangeChange = React.useCallback(
    (range: DateRange | undefined) => {
      setDateRange(range)
      setPagination((prev) => ({ ...prev, pageIndex: 0 }))
    },
    [],
  )

  // We need to detect action column filter changes from DataTable
  // Since DataTable manages column filters internally in server-side mode,
  // we use a wrapper that intercepts the faceted filter changes.
  // The DataTable sets column filter values via table.getColumn("action")?.setFilterValue()
  // We poll the internal state via onPaginationChange timing (re-render driven).
  // Actually, the simplest approach: monitor data-table's internal columnFilters
  // by wrapping with our own state tracking.

  // For server-side mode, the faceted filter sets column filter state but doesn't
  // actually filter client-side (manualFiltering: true). We need to extract
  // the filter value and send it to the API.
  //
  // Strategy: Use a wrapper DataTable that exposes onColumnFiltersChange.
  // Since our DataTable doesn't expose that, we'll use a simpler approach:
  // Apply action filter as multiple fetches - the faceted filter in the DataTable
  // will set internal state, but since manualFiltering is true, we need another mechanism.
  //
  // For now, we include the action filter in our custom toolbar alongside search and date range.
  // The faceted filter from DataTable toolbar works for visual selection, but we need
  // to track it. Since DataTable doesn't expose column filter state, we track action
  // filter separately here and pass it through facetedFilters config.

  return (
    <div>
      <DataTable
        columns={columns}
        data={data}
        facetedFilters={allFilters}
        pageCount={Math.ceil(totalCount / pagination.pageSize) || 1}
        onPaginationChange={handlePaginationChange}
        loading={loading}
        toolbar={
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search actor, resource..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="h-8 w-[200px]"
            />
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              placeholder="Filter by date"
              className="h-8 w-[260px]"
            />
          </div>
        }
        emptyState={{
          title: "No audit log entries",
          description:
            "Activity will be recorded here as users interact with the platform.",
        }}
      />
      <AuditDetailDialog
        entry={selectedEntry}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}
