import type * as React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@testing-library/jest-dom"

import { createCamerasColumns, type CameraRow } from "./cameras-columns"

const baseCamera: CameraRow = {
  id: "c1",
  name: "Front Door",
  status: "online",
  isRecording: false,
  maintenanceMode: false,
  streamUrl: "rtsp://example",
  codecInfo: null,
  streamProfileId: null,
  location: null,
  description: null,
  tags: [],
  site: { id: "s1", name: "HQ", project: { id: "p1", name: "Demo" } },
  createdAt: new Date("2026-04-18T00:00:00Z").toISOString(),
}

const noopCallbacks = {
  onEdit: vi.fn(),
  onViewStream: vi.fn(),
  onDelete: vi.fn(),
  onRecordToggle: vi.fn(),
  onEmbedCode: vi.fn(),
  onStreamToggle: vi.fn(),
  onMaintenanceToggle: vi.fn(),
}

type AnyCol = { accessorKey?: string; id?: string; cell?: unknown }

function renderStatusCell(camera: CameraRow) {
  const columns = createCamerasColumns(noopCallbacks) as unknown as AnyCol[]
  const statusCol = columns.find((c) => c.accessorKey === "status")
  if (!statusCol || typeof statusCol.cell !== "function") {
    throw new Error("status cell missing")
  }
  const fakeRow = {
    original: camera,
    getValue: (key: string) =>
      (camera as unknown as Record<string, unknown>)[key],
  }
  const cellFn = statusCol.cell as (ctx: {
    row: typeof fakeRow
  }) => React.ReactElement
  return render(cellFn({ row: fakeRow }))
}

function renderActionsCell(camera: CameraRow, cb = noopCallbacks) {
  const columns = createCamerasColumns(cb) as unknown as AnyCol[]
  const actionsCol = columns.find((c) => c.id === "actions")
  if (!actionsCol || typeof actionsCol.cell !== "function") {
    throw new Error("actions cell missing")
  }
  const fakeRow = { original: camera }
  const cellFn = actionsCol.cell as (ctx: {
    row: typeof fakeRow
  }) => React.ReactElement
  return render(cellFn({ row: fakeRow }))
}

describe("Cameras Status column composite cell (CAM-02)", () => {
  it("renders CameraStatusDot with online class", () => {
    const { container } = renderStatusCell({ ...baseCamera, status: "online" })
    expect(container.querySelector(".bg-primary")).toBeInTheDocument()
  })

  it("renders recording dot red when isRecording=true", () => {
    const { container } = renderStatusCell({ ...baseCamera, isRecording: true })
    expect(container.querySelector(".fill-red-500")).toBeInTheDocument()
  })

  it("renders recording dot muted when isRecording=false", () => {
    const { container } = renderStatusCell({ ...baseCamera, isRecording: false })
    expect(container.querySelector(".text-muted-foreground")).toBeInTheDocument()
  })

  it("renders amber wrench when maintenanceMode=true", () => {
    renderStatusCell({ ...baseCamera, maintenanceMode: true })
    // Task 1 adds aria-label="maintenance" + role="img" on the Wrench when maintenanceMode is true.
    const wrench = screen.getByLabelText("maintenance")
    expect(wrench).toBeInTheDocument()
    // SVG className is SVGAnimatedString — read via getAttribute.
    expect(wrench.getAttribute("class") ?? "").toMatch(/text-amber-600/)
  })

  it("renders invisible wrench when maintenanceMode=false (layout preserved, no a11y announcement)", () => {
    const { container } = renderStatusCell({ ...baseCamera, maintenanceMode: false })
    const invisible = container.querySelector(".invisible")
    expect(invisible).toBeInTheDocument()
    // When not in maintenance, wrench is aria-hidden with no aria-label — screen readers skip it.
    expect(screen.queryByLabelText("maintenance")).toBeNull()
  })

  it("has aria-label='Camera status' on outer container", () => {
    renderStatusCell(baseCamera)
    expect(screen.getByLabelText("Camera status")).toBeInTheDocument()
  })
})

describe("Cameras row-actions maintenance entry (CAM-03)", () => {
  it("shows 'Maintenance' when maintenanceMode=false", async () => {
    const user = userEvent.setup()
    renderActionsCell({ ...baseCamera, maintenanceMode: false })
    const trigger = screen.getByRole("button", { name: /open menu/i })
    await user.click(trigger)
    expect(await screen.findByText("Maintenance")).toBeInTheDocument()
  })

  it("shows 'Maintenance' when maintenanceMode=true (same label toggles via dialog)", async () => {
    const user = userEvent.setup()
    renderActionsCell({ ...baseCamera, maintenanceMode: true })
    const trigger = screen.getByRole("button", { name: /open menu/i })
    await user.click(trigger)
    expect(await screen.findByText("Maintenance")).toBeInTheDocument()
  })

  it("invokes onMaintenanceToggle with the camera when clicked", async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    const cb = { ...noopCallbacks, onMaintenanceToggle: spy }
    renderActionsCell({ ...baseCamera, maintenanceMode: false }, cb)
    const trigger = screen.getByRole("button", { name: /open menu/i })
    await user.click(trigger)
    const menuItem = await screen.findByText("Maintenance")
    await user.click(menuItem)
    expect(spy).toHaveBeenCalledTimes(1)
    // DataTableRowActions passes `row.original` to action.onClick.
    const firstArg = spy.mock.calls[0]?.[0] as CameraRow | undefined
    expect(firstArg?.id).toBe("c1")
  })
})
