// Quick task 260426-29p — Stream Profiles Name cell default-profile indicator.
// Verifies that an amber Star icon renders next to the profile name when
// row.original.isDefault === true, and is absent otherwise. The Star carries
// aria-label="Default profile" so the cell stays accessible without a hover
// gesture, and a tooltip surfaces the long-form copy on hover/focus.
import type * as React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom"

import {
  createStreamProfilesColumns,
  type StreamProfileRow,
} from "../stream-profiles-columns"

const baseRow: StreamProfileRow = {
  id: "p1",
  name: "HD 15",
  codec: "libx264",
  preset: "veryfast",
  resolution: "1920x1080",
  fps: 15,
  videoBitrate: "2000",
  audioCodec: "aac",
  audioBitrate: "128",
  isDefault: false,
}

const noopCallbacks = {
  onEdit: vi.fn(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
}

type AnyCol = { accessorKey?: string; id?: string; cell?: unknown }

function renderNameCell(row: StreamProfileRow) {
  const columns = createStreamProfilesColumns(noopCallbacks) as unknown as AnyCol[]
  const nameCol = columns.find((c) => c.accessorKey === "name")
  if (!nameCol || typeof nameCol.cell !== "function") {
    throw new Error("name cell missing")
  }
  const fakeRow = {
    original: row,
    getValue: (key: string) => (row as unknown as Record<string, unknown>)[key],
  }
  const cellFn = nameCol.cell as (ctx: { row: typeof fakeRow }) => React.ReactElement
  return render(cellFn({ row: fakeRow }))
}

describe("StreamProfiles Name cell — default indicator (260426-29p)", () => {
  it("(a) renders Star icon with aria-label='Default profile' when isDefault=true", () => {
    renderNameCell({ ...baseRow, isDefault: true })
    expect(screen.getByLabelText("Default profile")).toBeInTheDocument()
  })

  it("(b) does NOT render Star icon when isDefault=false", () => {
    renderNameCell({ ...baseRow, isDefault: false })
    expect(screen.queryByLabelText("Default profile")).toBeNull()
  })

  it("(c) always renders the profile name regardless of isDefault", () => {
    const { rerender } = renderNameCell({ ...baseRow, isDefault: true })
    expect(screen.getByText("HD 15")).toBeInTheDocument()
    rerender(<div>{/* unmount */}</div>)
    renderNameCell({ ...baseRow, isDefault: false, name: "SD 10" })
    expect(screen.getByText("SD 10")).toBeInTheDocument()
  })
})
