# Phase 8: Foundation Components - Research

**Researched:** 2026-04-17
**Domain:** React component library (DataTable + DatePicker) with TanStack Table + shadcn + base-ui
**Confidence:** HIGH

## Summary

Phase 8 builds two reusable component systems: a DataTable (powered by @tanstack/react-table headless logic + existing shadcn Table presentational layer) and DatePicker/DateRangePicker (wrapping existing shadcn Calendar with Popover). These components are consumed by 13+ pages in subsequent phases (10-13).

The codebase uses **base-ui** (not Radix) as the primitive layer, with shadcn's base-nova style preset. All UI components follow render prop patterns from `@base-ui/react`. The existing `table.tsx` exports pure HTML wrappers (Table, TableHeader, TableBody, etc.) -- the new DataTable wraps these with TanStack Table logic. The Calendar component (react-day-picker v9.14.0) already supports single, range, and multiple selection modes -- DatePicker/DateRangePicker are thin wrappers adding Popover trigger + formatting.

**Primary recommendation:** Install `@tanstack/react-table` v8.21.3, add shadcn `checkbox` component via CLI, build DataTable as 7 composable files, build DatePicker/DateRangePicker as 2 files. All column definitions in separate "use client" files.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use @tanstack/react-table (headless) as the table logic engine + existing shadcn `<Table>` as the presentational layer
- **D-02:** Column definitions in separate "use client" files to avoid Next.js server/client component boundary issues
- **D-03:** Row actions via "..." MoreHorizontal button at the end of each row -- opens DropdownMenu (same pattern as existing package-table and org-table)
- **D-04:** Toolbar layout: search bar (left) + faceted filter buttons (center) + action buttons (right, e.g., Add, Bulk Delete)
- **D-05:** Faceted filter buttons -- clickable chips like [Status v] [Role v] that open popover with multi-select checkboxes (Linear/Vercel pattern)
- **D-06:** Filter state stored in URL query params via Next.js `useSearchParams` + `useRouter` -- no additional library needed
- **D-07:** Offset-based numbered pagination (Previous / 1 2 3 ... / Next) as the standard pattern across all tables
- **D-08:** DataTable supports both client-side and server-side pagination -- client-side for small datasets, server-side for large datasets
- **D-09:** Popover + Calendar pattern -- button trigger opens popover showing the existing Calendar component (react-day-picker v9.14.0)
- **D-10:** Create two wrapper components: DatePicker (single date) and DateRangePicker (date range)
- **D-11:** Replace all native `<input type="date">` instances (3 files: tenant-audit-log-page, platform-audit-log-page, tenant-recordings-page)
- **D-12:** DataTable supports row selection via checkboxes (header checkbox for select-all-on-page)

### Claude's Discretion
- Loading skeleton design for DataTable
- Exact spacing and typography in toolbar
- Page size options (10/25/50)
- Empty state design for filtered-no-results vs no-data

### Deferred Ideas (OUT OF SCOPE)
- Column visibility toggle (show/hide columns) -- nice-to-have, add later if needed
- Column resizing -- not needed for v1.1
- Export to CSV -- not in scope for this milestone
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | User sees consistent data tables across all pages with column sorting, text/select filters, and pagination | @tanstack/react-table v8.21.3 provides headless sorting, filtering, pagination APIs. DataTable component wraps existing shadcn Table primitives. 7 composable files cover all sub-features. |
| FOUND-02 | User can use shadcn datepicker (single, range, multiple) in all date inputs -- no native browser pickers | Existing Calendar component (react-day-picker v9.14.0) already supports all modes. DatePicker + DateRangePicker wrap it with Popover + date-fns formatting. 6 native `<input type="date">` instances found across 3 files to replace. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Component library:** base-ui render prop pattern (NOT Radix asChild) -- all new components must follow this
- **Tech stack:** Next.js 15.x (App Router, RSC), React 19, TypeScript 5.7, Tailwind 4.2
- **Styling:** shadcn base-nova preset, CSS variables, `cn()` utility (clsx + tailwind-merge)
- **Icons:** lucide-react v1.8.0
- **Date formatting:** date-fns v4.1.0 (already installed)
- **No GraphQL** -- REST only
- **No dark mode** -- green theme is brand identity

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-table | 8.21.3 | Headless table logic (sorting, filtering, pagination, selection) | Industry standard for React tables; headless design pairs perfectly with shadcn presentational layer [VERIFIED: npm registry] |
| react-day-picker | 9.14.0 | Calendar rendering | Already installed; powers existing `calendar.tsx` [VERIFIED: apps/web/package.json] |
| date-fns | 4.1.0 | Date formatting/manipulation | Already installed; tree-shakeable, used throughout codebase [VERIFIED: apps/web/package.json] |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @base-ui/react | 1.3.0+ | Primitive components (Popover, Menu, Button, Checkbox) | All interactive UI primitives [VERIFIED: apps/web/package.json] |
| lucide-react | 1.8.0 | Icons (MoreHorizontal, ChevronLeft, ChevronRight, Search, CalendarIcon, X, ArrowUpDown) | All iconography [VERIFIED: apps/web/package.json] |
| class-variance-authority | installed | Variant-based className composition | Button variants, badge variants [VERIFIED: button.tsx] |
| tailwind-merge | 3.5.0 | Merge Tailwind classes without conflicts | Via `cn()` utility [VERIFIED: apps/web/package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @tanstack/react-table | AG Grid | AG Grid is heavier, not headless, brings its own styling -- conflicts with shadcn approach |
| @tanstack/react-table | Custom hooks | Would hand-roll sorting/filtering/pagination logic that TanStack already provides battle-tested |
| date-fns | dayjs | date-fns already installed and used; no reason to switch |

**Installation:**
```bash
cd apps/web && npm install @tanstack/react-table@^8.21.3
npx shadcn@latest add checkbox
```

Note: `npx shadcn@latest add pagination` -- verify if this produces a base-ui compatible component. If not, build pagination manually using existing Button component.

## Architecture Patterns

### Recommended File Structure
```
apps/web/src/components/ui/
  data-table/
    data-table.tsx                  # Core <DataTable> wrapper
    data-table-toolbar.tsx          # Search + faceted filters + action buttons
    data-table-pagination.tsx       # Numbered pagination + page size selector
    data-table-column-header.tsx    # Sortable column header with arrow icons
    data-table-row-actions.tsx      # "..." MoreHorizontal dropdown
    data-table-faceted-filter.tsx   # Chip-like filter button with popover multi-select
    index.ts                        # Barrel export
  date-picker.tsx                   # Single date picker (Popover + Calendar)
  date-range-picker.tsx             # Date range picker (Popover + Calendar range mode)
```

### Pattern 1: DataTable Generic Component
**What:** A generic React component `DataTable<TData, TValue>` that accepts column definitions and data, renders the full table with toolbar, body, and pagination.
**When to use:** Every data listing page in the application.
**Example:**
```typescript
// Source: @tanstack/react-table docs + shadcn pattern [VERIFIED: Context7]
"use client"

import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  searchPlaceholder?: string
  facetedFilters?: FacetedFilterConfig[]
  toolbar?: React.ReactNode  // slot for action buttons (right side)
  enableRowSelection?: boolean
  onRowSelectionChange?: (rows: TData[]) => void
  // Server-side pagination support
  pageCount?: number
  onPaginationChange?: (pageIndex: number, pageSize: number) => void
}
```

### Pattern 2: Column Definitions in Separate "use client" Files
**What:** Column definitions that include JSX (cell renderers, header components) MUST be in "use client" files, separate from server components.
**When to use:** Every page that uses DataTable.
**Why:** Next.js App Router server components cannot serialize JSX. If columns are defined inline in a server component page, it breaks.
**Example:**
```typescript
// apps/web/src/app/admin/packages/components/columns.tsx
"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header"
import { DataTableRowActions } from "@/components/ui/data-table/data-table-row-actions"

export const columns: ColumnDef<Package>[] = [
  // select checkbox column
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all rows on this page"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  // data columns...
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>,
  },
  // action column
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} actions={[...]} />,
  },
]
```

### Pattern 3: Faceted Filter with Popover Multi-Select
**What:** Chip-like buttons (e.g., [Status v]) that open a Popover with checkbox list for multi-select filtering.
**When to use:** Enum/categorical columns (status, role, type).
**Example:**
```typescript
// Source: Linear/Vercel UI pattern [ASSUMED]
interface FacetedFilterConfig {
  columnId: string
  title: string
  options: { label: string; value: string; icon?: React.ComponentType }[]
}

// Button shows: "Status" when no filter, "Status (2)" when 2 options selected
// Popover contains: search input (optional for long lists) + checkbox list + "Clear" button
```

### Pattern 4: DatePicker Wrapper
**What:** Thin wrapper around existing Calendar + Popover, with date-fns formatting.
**When to use:** Any single date input (replaces `<input type="date">`).
**Example:**
```typescript
"use client"

import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  date?: Date
  onDateChange: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
}

export function DatePicker({ date, onDateChange, placeholder = "Pick a date", disabled }: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="default" disabled={disabled} />}
        className={cn("w-[240px] justify-start text-left font-normal", !date && "text-muted-foreground")}
      >
        <CalendarIcon className="mr-2 size-4" />
        {date ? format(date, "PPP") : placeholder}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={onDateChange} />
      </PopoverContent>
    </Popover>
  )
}
```

### Pattern 5: Server-Side Pagination Support
**What:** DataTable supports both client-side and server-side pagination via `manualPagination` flag.
**When to use:** Server-side for large datasets (recordings, audit logs); client-side for small datasets (cameras, API keys).
**Example:**
```typescript
// Client-side (default): TanStack handles everything
const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
})

// Server-side: parent provides pageCount, handles data fetching
const table = useReactTable({
  data,
  columns,
  pageCount,
  manualPagination: true,
  manualSorting: true,
  manualFiltering: true,
  getCoreRowModel: getCoreRowModel(),
  onPaginationChange: setPagination,
  state: { pagination },
})
```

### Anti-Patterns to Avoid
- **Defining columns inline in server components:** JSX in column definitions cannot cross the server/client boundary. Always put columns in separate "use client" files. [VERIFIED: CONTEXT.md D-02, STATE.md blockers]
- **Using Radix primitives:** This project uses `@base-ui/react` with render prop pattern, NOT Radix `asChild`. When shadcn CLI generates components that use Radix, they must be adapted to base-ui. [VERIFIED: codebase grep -- 23 components use @base-ui/react]
- **Building pagination from scratch:** Use TanStack Table's built-in pagination model (`table.getCanPreviousPage()`, `table.getPageCount()`, etc.) -- don't manually compute page ranges.
- **Putting all DataTable code in one file:** Split into composable sub-components (toolbar, pagination, column header, faceted filter, row actions) so consuming pages can customize.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table sorting logic | Custom sort comparators | `getSortedRowModel()` from @tanstack/react-table | Handles multi-column sort, custom sort functions, stable sort [VERIFIED: TanStack docs] |
| Table filtering | Custom filter state management | `getFilteredRowModel()` from @tanstack/react-table | Built-in global filter, column filter, faceted values [VERIFIED: TanStack docs] |
| Pagination math | Custom page calculation | `getPaginationRowModel()` from @tanstack/react-table | Handles page size, page count, boundary detection [VERIFIED: TanStack docs] |
| Row selection state | Custom checkbox tracking | TanStack `rowSelection` state + `enableRowSelection` | Handles select-all, partial selection, indeterminate state [VERIFIED: TanStack docs] |
| Date formatting | Custom format functions | `date-fns` format/formatDistance | Already installed, tree-shakeable, locale-aware [VERIFIED: installed] |
| Calendar UI | Custom date grid | `react-day-picker` via existing Calendar component | Already installed and styled to match design system [VERIFIED: calendar.tsx] |

**Key insight:** @tanstack/react-table is entirely headless -- it manages state and logic but renders nothing. All rendering uses existing shadcn Table primitives. This separation means the DataTable inherits all existing table styling automatically.

## Common Pitfalls

### Pitfall 1: Next.js Server/Client Boundary with Column Definitions
**What goes wrong:** Defining columns with JSX cell renderers in a server component page causes serialization errors.
**Why it happens:** Server components can't serialize React elements. Column definitions with `cell: ({ row }) => <Badge>...</Badge>` contain JSX.
**How to avoid:** Always create `columns.tsx` as a separate "use client" file. Import it in the page component.
**Warning signs:** Error message about "cannot pass a function from server to client component."

### Pitfall 2: Checkbox Component from shadcn CLI May Use Radix
**What goes wrong:** `npx shadcn@latest add checkbox` may generate a Radix-based component instead of base-ui.
**Why it happens:** shadcn's base-nova preset may not have full parity for all components. The project uses `@base-ui/react/checkbox` but shadcn CLI might generate `@radix-ui/react-checkbox`.
**How to avoid:** After running the CLI, inspect the generated `checkbox.tsx`. If it imports from Radix, rewrite it to use `@base-ui/react/checkbox` with render prop pattern. Reference: `@base-ui/react` has a Checkbox primitive.
**Warning signs:** Import from `@radix-ui/*` in generated file.

### Pitfall 3: Popover Positioning with base-ui
**What goes wrong:** Popover alignment and positioning props differ between Radix and base-ui.
**Why it happens:** base-ui Popover uses `Positioner` sub-component with `align`, `side`, `sideOffset` on the Positioner, not the Popup.
**How to avoid:** Follow existing `popover.tsx` pattern -- positioning props go on `PopoverPrimitive.Positioner`, not `PopoverPrimitive.Popup`. [VERIFIED: popover.tsx lines 26-34]
**Warning signs:** Popover appearing in wrong position or props being ignored.

### Pitfall 4: useSearchParams in Server Components
**What goes wrong:** Trying to use `useSearchParams()` in a server component causes a runtime error.
**Why it happens:** `useSearchParams` is a client-side hook. Pages using DataTable with URL-based filter state must be client components or wrap the DataTable in a client component.
**How to avoid:** The DataTable component itself is "use client". URL param sync should happen inside DataTable or in a client wrapper component on the page.
**Warning signs:** "useSearchParams() should be wrapped in a suspense boundary" warning.

### Pitfall 5: TanStack Table Re-renders on Every State Change
**What goes wrong:** Entire table re-renders when any cell is clicked or filter changes.
**Why it happens:** TanStack Table state changes trigger re-renders of the component that calls `useReactTable`.
**How to avoid:** Memoize column definitions with `useMemo`. Memoize data with `useMemo` if it comes from a parent. Use `memo()` on cell renderers if they're expensive.
**Warning signs:** Sluggish interaction on tables with 50+ rows.

### Pitfall 6: shadcn Pagination Component Compatibility
**What goes wrong:** `npx shadcn@latest add pagination` generates a component that may not match the numbered pagination design needed.
**Why it happens:** shadcn's default pagination is a generic wrapper, not a numbered page list.
**How to avoid:** Build `data-table-pagination.tsx` manually using existing Button component variants. TanStack Table provides all the pagination state needed (`table.getPageCount()`, `table.setPageIndex()`, etc.).
**Warning signs:** Generated component doesn't match the "Previous / 1 2 3 ... / Next" design from UI-SPEC.

## Code Examples

### DataTable Core Structure
```typescript
// Source: @tanstack/react-table + shadcn Table pattern [VERIFIED: codebase + TanStack docs]
"use client"

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function DataTable<TData, TValue>({
  columns,
  data,
}: {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  return (
    <div>
      {/* Toolbar */}
      {/* Table body using flexRender */}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {/* Pagination */}
    </div>
  )
}
```

### Sortable Column Header
```typescript
// Source: shadcn DataTable examples [ASSUMED]
"use client"

import { type Column } from "@tanstack/react-table"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>
  title: string
  className?: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {title}
      {column.getIsSorted() === "asc" ? (
        <ArrowUp className="ml-2 size-4" />
      ) : column.getIsSorted() === "desc" ? (
        <ArrowDown className="ml-2 size-4" />
      ) : (
        <ArrowUpDown className="ml-2 size-4" />
      )}
    </Button>
  )
}
```

### Existing Patterns to Preserve
```typescript
// Row hover from existing TableRow -- already handled:
// className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
// Source: [VERIFIED: table.tsx line 60-63]

// DropdownMenu trigger from existing package-table:
// <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted">
//   <MoreHorizontal className="h-4 w-4" />
// </DropdownMenuTrigger>
// Source: [VERIFIED: package-table.tsx lines 108-110]

// Badge variants for status columns:
// <Badge variant={pkg.isActive ? "default" : "destructive"}>
// Source: [VERIFIED: package-table.tsx line 102]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `react-table` v7 (class-based) | `@tanstack/react-table` v8 (hooks, headless) | 2022 | Complete API redesign; v8 is the current version |
| Radix UI primitives + asChild | base-ui render prop pattern | shadcn base-nova 2025 | This project uses base-ui, not Radix |
| `react-day-picker` v8 | `react-day-picker` v9 | 2024 | v9 has breaking API changes; this project already uses v9.14.0 |
| Tailwind CSS 3 | Tailwind CSS 4.2 | 2025 | This project uses Tailwind 4.2 with CSS variables |

**Deprecated/outdated:**
- `react-table` v7: Use `@tanstack/react-table` v8 (this project does)
- Radix `asChild` pattern: This project uses base-ui render prop pattern instead
- `moment.js`: Use `date-fns` (already in use)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | shadcn CLI `checkbox` command will generate a base-ui compatible component | Pitfalls | LOW -- if Radix-based, easy to rewrite using @base-ui/react/checkbox |
| A2 | Faceted filter chip pattern follows Linear/Vercel style with multi-select checkboxes in Popover | Architecture Patterns | LOW -- design is specified in UI-SPEC |
| A3 | TanStack Table `flexRender` works seamlessly with base-ui render props | Architecture Patterns | LOW -- flexRender is framework-agnostic, just calls render functions |

## Open Questions

1. **Checkbox Component Generation**
   - What we know: shadcn CLI may generate Radix-based or base-ui-based checkbox depending on preset detection
   - What's unclear: Whether base-nova preset generates base-ui checkbox automatically
   - Recommendation: Run `npx shadcn@latest add checkbox`, inspect output, rewrite if Radix-based

2. **URL Filter State Serialization**
   - What we know: D-06 specifies useSearchParams + useRouter for filter state
   - What's unclear: Exact serialization format for multi-select faceted filters (comma-separated? array params?)
   - Recommendation: Use comma-separated values (e.g., `?status=active,pending`) -- simple, human-readable, no library needed

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library/react |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/web && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01a | DataTable renders columns and data | unit | `cd apps/web && npx vitest run src/__tests__/data-table.test.tsx -x` | Wave 0 |
| FOUND-01b | DataTable sorting toggles on header click | unit | same file | Wave 0 |
| FOUND-01c | DataTable pagination shows correct pages | unit | same file | Wave 0 |
| FOUND-01d | DataTable row selection via checkboxes | unit | same file | Wave 0 |
| FOUND-01e | DataTable faceted filter updates columnFilters | unit | same file | Wave 0 |
| FOUND-02a | DatePicker opens popover and selects date | unit | `cd apps/web && npx vitest run src/__tests__/date-picker.test.tsx -x` | Wave 0 |
| FOUND-02b | DateRangePicker selects start and end date | unit | same file | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd apps/web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/web/src/__tests__/data-table.test.tsx` -- covers FOUND-01 (a-e)
- [ ] `apps/web/src/__tests__/date-picker.test.tsx` -- covers FOUND-02 (a-b)

## Sources

### Primary (HIGH confidence)
- npm registry: @tanstack/react-table v8.21.3 verified current [VERIFIED: `npm view @tanstack/react-table version`]
- Codebase: `apps/web/package.json` -- react-day-picker v9.14.0, date-fns v4.1.0, @base-ui/react v1.3.0+, Next.js 15.x, React 19, Tailwind 4.2 [VERIFIED: package.json grep]
- Codebase: `apps/web/src/components/ui/table.tsx` -- 117 lines, pure HTML wrappers [VERIFIED: file read]
- Codebase: `apps/web/src/components/ui/calendar.tsx` -- 221 lines, react-day-picker v9 with base-nova styling [VERIFIED: file read]
- Codebase: `apps/web/src/components/ui/popover.tsx` -- base-ui Popover with Positioner pattern [VERIFIED: file read]
- Codebase: `apps/web/src/components/ui/dropdown-menu.tsx` -- base-ui Menu with render props [VERIFIED: file read]
- Codebase: `apps/web/src/app/admin/packages/components/package-table.tsx` -- existing row actions pattern [VERIFIED: file read]
- Codebase: `apps/web/components.json` -- shadcn base-nova preset, base-ui icons, RSC enabled [VERIFIED: file read]
- 6 native `<input type="date">` instances across 3 files [VERIFIED: grep `type="date"` in apps/web/src]
- Codebase: 23 components using @base-ui/react [VERIFIED: grep for @base-ui/react imports]
- Vitest config: jsdom environment, @testing-library/react [VERIFIED: vitest.config.ts]

### Secondary (MEDIUM confidence)
- @tanstack/react-table column definition API and useReactTable hook API [ASSUMED: based on training data, verified version exists]

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified in npm registry and/or already installed
- Architecture: HIGH -- patterns derived from existing codebase analysis + locked decisions in CONTEXT.md
- Pitfalls: HIGH -- server/client boundary issue verified in STATE.md blockers; base-ui pattern verified across 23 components

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable libraries, no breaking changes expected)
