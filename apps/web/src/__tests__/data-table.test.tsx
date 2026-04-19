/**
 * DataTable component system tests (FOUND-01a through FOUND-01e)
 *
 * Tests cover: rendering, sorting, pagination, row selection, faceted filtering.
 */
import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, screen, within, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table"
import { Checkbox } from "@/components/ui/checkbox"

// Polyfill PointerEvent for jsdom (required by @base-ui/react checkbox)
beforeAll(() => {
  if (typeof globalThis.PointerEvent === "undefined") {
    // @ts-expect-error -- minimal polyfill for jsdom
    globalThis.PointerEvent = class PointerEvent extends MouseEvent {
      readonly pointerId: number
      readonly pointerType: string
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params)
        this.pointerId = params.pointerId ?? 0
        this.pointerType = params.pointerType ?? ""
      }
    }
  }
})

// ---------- Test fixtures ----------

type TestItem = {
  id: string
  name: string
  status: string
  createdAt: string
}

const testData: TestItem[] = Array.from({ length: 25 }, (_, i) => ({
  id: `${i + 1}`,
  name: `Item ${i + 1}`,
  status: i % 3 === 0 ? "active" : i % 3 === 1 ? "pending" : "inactive",
  createdAt: new Date(2026, 0, i + 1).toISOString(),
}))

const testColumns: ColumnDef<TestItem>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={
          table.getIsSomePageRowsSelected() &&
          !table.getIsAllPageRowsSelected()
        }
        onCheckedChange={(checked) =>
          table.toggleAllPageRowsSelected(!!checked)
        }
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(!!checked)}
        aria-label={`Select row ${row.index + 1}`}
      />
    ),
    enableSorting: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    filterFn: (row, id, value: string[]) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    enableSorting: false,
  },
]

// ---------- Tests ----------

describe("DataTable component system", () => {
  it("FOUND-01a: DataTable renders column headers and row data", () => {
    render(
      <DataTable
        columns={testColumns}
        data={testData}
        enableRowSelection
      />
    )

    // Column headers render
    expect(screen.getByText("Name")).toBeInTheDocument()
    expect(screen.getByText("Status")).toBeInTheDocument()
    expect(screen.getByText("Created")).toBeInTheDocument()

    // First page data renders (default page size = 10)
    expect(screen.getByText("Item 1")).toBeInTheDocument()
    expect(screen.getByText("Item 10")).toBeInTheDocument()

    // Item 11 should NOT be on the first page
    expect(screen.queryByText("Item 11")).not.toBeInTheDocument()
  })

  it("FOUND-01b: clicking sortable column header toggles sorting", async () => {
    const user = userEvent.setup()

    render(
      <DataTable
        columns={testColumns}
        data={testData}
        enableRowSelection
      />
    )

    // Before sort: first data row shows "Item 1"
    const tbody = screen.getAllByRole("rowgroup")[1] // TableBody
    const firstRowCells = within(tbody).getAllByRole("row")[0]
    expect(within(firstRowCells).getByText("Item 1")).toBeInTheDocument()

    // Click "Name" header to sort ascending
    const nameButton = screen.getByRole("button", { name: /Name/i })
    await user.click(nameButton)

    // After ascending sort, the table should still have data rows
    const sortedRows = within(tbody).getAllByRole("row")
    expect(sortedRows.length).toBeGreaterThan(0)

    // Verify sort changed -- after asc sort click, verify first row text
    // TanStack default alphanumeric sort: "Item 1" < "Item 10" < "Item 11" ...
    const ascFirstRow = within(tbody).getAllByRole("row")[0]
    expect(within(ascFirstRow).getByText("Item 1")).toBeInTheDocument()

    // Click again for desc sort
    await user.click(nameButton)

    // In desc alphanumeric sort, "Item 9" comes last alphabetically in asc,
    // so first in desc. Verify the first row changed from ascending order.
    const descFirstRow = within(tbody).getAllByRole("row")[0]
    // The first row should NOT be "Item 1" anymore (it was sorted desc)
    expect(within(descFirstRow).queryByText("Item 1")).not.toBeInTheDocument()
  })

  it("FOUND-01c: pagination shows correct range and navigates", async () => {
    const user = userEvent.setup()

    render(
      <DataTable
        columns={testColumns}
        data={testData}
        enableRowSelection
      />
    )

    // Should show "Showing 1-10 of 25"
    expect(screen.getByText(/Showing 1-10 of 25/)).toBeInTheDocument()

    // Click next page
    const nextButton = screen.getByRole("button", { name: /Next page/i })
    await user.click(nextButton)

    // Should now show "Showing 11-20 of 25"
    expect(screen.getByText(/Showing 11-20 of 25/)).toBeInTheDocument()

    // Item 11 should be visible now
    expect(screen.getByText("Item 11")).toBeInTheDocument()

    // Item 1 should no longer be visible
    expect(screen.queryByText("Item 1")).not.toBeInTheDocument()
  })

  it("FOUND-01d: row checkbox selection and header select-all", async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()

    render(
      <DataTable
        columns={testColumns}
        data={testData}
        enableRowSelection
        onRowSelectionChange={onSelectionChange}
      />
    )

    // Click first row checkbox (Select row 1)
    const rowCheckboxes = screen.getAllByRole("checkbox", {
      name: /Select row/i,
    })
    await user.click(rowCheckboxes[0])

    // The row should be selected -- look for data-state="selected" on the tr
    const tbody = screen.getAllByRole("rowgroup")[1]
    const selectedRows = within(tbody)
      .getAllByRole("row")
      .filter((row) => row.getAttribute("data-state") === "selected")
    expect(selectedRows.length).toBe(1)

    // Click header "Select all" checkbox
    const selectAllCheckbox = screen.getByRole("checkbox", {
      name: /Select all/i,
    })
    await user.click(selectAllCheckbox)

    // All 10 rows on the current page should be selected
    const allSelectedRows = within(tbody)
      .getAllByRole("row")
      .filter((row) => row.getAttribute("data-state") === "selected")
    expect(allSelectedRows.length).toBe(10)
  })

  it("FOUND-01e: faceted filter chip opens popover and filters rows", async () => {
    const user = userEvent.setup()

    render(
      <DataTable
        columns={testColumns}
        data={testData}
        enableRowSelection
        facetedFilters={[
          {
            columnId: "status",
            title: "Status",
            options: [
              { label: "Active", value: "active" },
              { label: "Pending", value: "pending" },
              { label: "Inactive", value: "inactive" },
            ],
          },
        ]}
      />
    )

    // Click the faceted filter button (has popover-trigger data-slot)
    const filterButton = screen
      .getAllByRole("button")
      .find(
        (btn) => btn.getAttribute("data-slot") === "popover-trigger"
      )

    expect(filterButton).toBeDefined()
    await user.click(filterButton!)

    // The popover should show filter options
    const activeOption = await screen.findByRole("checkbox", {
      name: /Filter by Active/i,
    })
    expect(activeOption).toBeInTheDocument()

    // Click the Active filter button (wrapping the checkbox)
    const activeButton = activeOption.closest("button")!
    await user.click(activeButton)

    // Only active items should be visible (items at index 0, 3, 6, 9, 12, 15, 18, 21, 24 = 9 items)
    const tbody = screen.getAllByRole("rowgroup")[1]
    const visibleRows = within(tbody).getAllByRole("row")

    // All visible rows should have "active" status
    visibleRows.forEach((row) => {
      expect(within(row).getByText("active")).toBeInTheDocument()
    })

    // Should show correct count
    expect(screen.getByText(/of 9/)).toBeInTheDocument()
  })
})

describe("DataTable onRowClick (FOUND-01f — Phase 17)", () => {
  it.todo("FOUND-01f onRowClick: invokes handler when a row body cell is clicked")
  it.todo("FOUND-01f onRowClick: does NOT invoke handler when checkbox cell is clicked")
  it.todo("FOUND-01f onRowClick: does NOT invoke handler when actions menu trigger is clicked")
  it.todo("FOUND-01f onRowClick: row has cursor-pointer class when handler provided")
  it.todo("FOUND-01f onRowClick: row has tabIndex=0 and Enter key fires handler")
})
