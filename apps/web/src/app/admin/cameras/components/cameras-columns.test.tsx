import type * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@testing-library/jest-dom"

import { createCamerasColumns, type CameraRow } from "./cameras-columns"

// Sonner is mocked globally so Phase 20 copy actions can assert toast calls.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { toast } from "sonner"

const baseCamera: CameraRow = {
  id: "1dfaadd7-c5f9-49b8-b26e-7a6c402a8103",
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

type AnyCol = { accessorKey?: string; id?: string; cell?: unknown; size?: number }

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

describe("Cameras row-actions maintenance entry (CAM-03)", () => {
  // Phase 20 D-07: label flips based on maintenanceMode (was static "Maintenance" before).
  it("shows 'Maintenance' when maintenanceMode=false", async () => {
    const user = userEvent.setup()
    renderActionsCell({ ...baseCamera, maintenanceMode: false })
    const trigger = screen.getByRole("button", { name: /open menu/i })
    await user.click(trigger)
    expect(await screen.findByText("Maintenance")).toBeInTheDocument()
  })

  it("shows 'Exit Maintenance' when maintenanceMode=true (D-07 dynamic label)", async () => {
    const user = userEvent.setup()
    renderActionsCell({ ...baseCamera, maintenanceMode: true })
    const trigger = screen.getByRole("button", { name: /open menu/i })
    await user.click(trigger)
    expect(await screen.findByText("Exit Maintenance")).toBeInTheDocument()
    expect(screen.queryByText(/^Maintenance$/)).toBeNull()
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
    const firstArg = spy.mock.calls[0]?.[0] as CameraRow | undefined
    expect(firstArg?.id).toBe(baseCamera.id)
  })
})

describe("Phase 20 row action menu", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  async function openMenu(camera: CameraRow = baseCamera, cb = noopCallbacks) {
    const user = userEvent.setup()
    renderActionsCell(camera, cb)
    const trigger = screen.getByRole("button", { name: /open menu/i })
    await user.click(trigger)
    // Base-UI Menu opens asynchronously; wait for at least one menu item to exist.
    await screen.findByRole("menuitem", { name: /edit/i })
    return user
  }

  it("renders exactly 9 row action items in D-08 order (1 separator + 9 menuitems = 10 rendered positions)", async () => {
    await openMenu({ ...baseCamera, status: "offline", isRecording: false, maintenanceMode: false })
    const items = screen.getAllByRole("menuitem")
    // D-08 order is 9 actions + 1 separator (not counted as menuitem).
    expect(items).toHaveLength(9)
    const labels = items.map((el) => el.textContent?.trim())
    expect(labels).toEqual([
      "Edit",
      "View Stream",
      "Start Stream",
      "Start Recording",
      "Maintenance",
      "Copy Camera ID",
      "Copy cURL example",
      "Embed Code",
      "Delete",
    ])
  })

  it("Maintenance item shows 'Maintenance' label when maintenanceMode=false", async () => {
    await openMenu({ ...baseCamera, maintenanceMode: false })
    expect(screen.getByText("Maintenance")).toBeInTheDocument()
    expect(screen.queryByText("Exit Maintenance")).toBeNull()
  })

  it("Maintenance item shows 'Exit Maintenance' when maintenanceMode=true", async () => {
    await openMenu({ ...baseCamera, maintenanceMode: true })
    expect(screen.getByText("Exit Maintenance")).toBeInTheDocument()
    expect(screen.queryByText(/^Maintenance$/)).toBeNull()
  })

  it("Start Stream item shows 'Stop Stream' when status=online", async () => {
    await openMenu({ ...baseCamera, status: "online" })
    expect(screen.getByText("Stop Stream")).toBeInTheDocument()
    expect(screen.queryByText("Start Stream")).toBeNull()
  })

  it("Start Stream item shows 'Start Stream' when status=offline", async () => {
    await openMenu({ ...baseCamera, status: "offline" })
    expect(screen.getByText("Start Stream")).toBeInTheDocument()
    expect(screen.queryByText("Stop Stream")).toBeNull()
  })

  it("Start Recording item shows 'Stop Recording' when isRecording=true", async () => {
    await openMenu({ ...baseCamera, isRecording: true })
    expect(screen.getByText("Stop Recording")).toBeInTheDocument()
    expect(screen.queryByText("Start Recording")).toBeNull()
  })

  // userEvent.setup() installs its own navigator.clipboard stub, so our
  // writeText mock MUST be installed AFTER the user session is created
  // (i.e. after openMenu returns). Otherwise userEvent clobbers our mock.
  function installClipboardMock(writeText: ReturnType<typeof vi.fn>) {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    })
  }

  it("Copy Camera ID writes camera.id verbatim to clipboard", async () => {
    const user = await openMenu()
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboardMock(writeText)
    const item = await screen.findByRole("menuitem", { name: /copy camera id/i })
    await user.click(item)
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText).toHaveBeenCalledWith(baseCamera.id)
    expect(writeText.mock.calls[0]?.[0]).toBe("1dfaadd7-c5f9-49b8-b26e-7a6c402a8103")
  })

  it("Copy Camera ID success fires toast 'Camera ID copied'", async () => {
    const user = await openMenu()
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboardMock(writeText)
    const item = await screen.findByRole("menuitem", { name: /copy camera id/i })
    await user.click(item)
    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Camera ID copied")
    )
  })

  it("Copy Camera ID failure fires 'Couldn't copy to clipboard' error toast", async () => {
    const user = await openMenu()
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"))
    installClipboardMock(writeText)
    const item = await screen.findByRole("menuitem", { name: /copy camera id/i })
    await user.click(item)
    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Couldn't copy to clipboard")
    )
  })

  it("Copy cURL writes templated snippet with window.location.origin, camera.id, and literal <YOUR_API_KEY>", async () => {
    const user = await openMenu()
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboardMock(writeText)
    const item = await screen.findByRole("menuitem", { name: /copy curl example/i })
    await user.click(item)
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const payload = writeText.mock.calls[0]?.[0] as string | undefined
    expect(payload).toBeDefined()
    expect(payload).toContain(window.location.origin)
    expect(payload).toContain(baseCamera.id)
    expect(payload).toContain("<YOUR_API_KEY>")
    expect(payload).toContain("/api/cameras/")
    expect(payload).toContain("/sessions")
  })

  it("Copy cURL does NOT fetch the user's real API key (security invariant T-20-08)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    try {
      const user = await openMenu()
      const writeText = vi.fn().mockResolvedValue(undefined)
      installClipboardMock(writeText)
      const item = await screen.findByRole("menuitem", { name: /copy curl example/i })
      await user.click(item)
      await waitFor(() => expect(writeText).toHaveBeenCalled())
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("Copy cURL template has exactly 3 lines joined by \\n", async () => {
    const user = await openMenu()
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboardMock(writeText)
    const item = await screen.findByRole("menuitem", { name: /copy curl example/i })
    await user.click(item)
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const payload = writeText.mock.calls[0]?.[0] as string
    expect(payload.split("\n")).toHaveLength(3)
  })

  it("Delete item is marked destructive (data-variant='destructive')", async () => {
    await openMenu()
    const del = screen.getByText("Delete").closest("[role='menuitem']")
    expect(del).not.toBeNull()
    // DataTableRowActions sets `variant="destructive"` on DropdownMenuItem; shadcn renders it as data-variant.
    expect(del?.getAttribute("data-variant")).toBe("destructive")
  })
})

describe("Phase 20 Status column", () => {
  it("renders StatusPills component in status cell (role='group' aria-label='Camera status')", () => {
    renderStatusCell(baseCamera)
    expect(screen.getByRole("group", { name: /camera status/i })).toBeInTheDocument()
  })

  it("status column size is 120", () => {
    const columns = createCamerasColumns(noopCallbacks) as unknown as AnyCol[]
    const statusCol = columns.find((c) => c.accessorKey === "status")
    expect(statusCol?.size).toBe(120)
  })
})

function renderStreamProfileCell(camera: CameraRow) {
  const columns = createCamerasColumns(noopCallbacks) as unknown as AnyCol[]
  const col = columns.find((c) => c.id === "streamProfile")
  if (!col || typeof col.cell !== "function") {
    throw new Error("streamProfile cell missing")
  }
  const fakeRow = {
    original: camera,
    getValue: (key: string) =>
      (camera as unknown as Record<string, unknown>)[key],
  }
  const cellFn = col.cell as (ctx: {
    row: typeof fakeRow
  }) => React.ReactElement
  return render(cellFn({ row: fakeRow }))
}

describe("Stream Profile column (quick 260425-uw0)", () => {
  it("renders profile name + Transcode badge for codec=libx264", () => {
    renderStreamProfileCell({
      ...baseCamera,
      streamProfile: { id: "p1", name: "SD640", codec: "libx264" },
    })
    expect(screen.getByText("SD640")).toBeInTheDocument()
    const badge = screen.getByText("Transcode")
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain("bg-amber-100")
    expect(badge.className).toContain("text-amber-700")
  })

  it("renders profile name + Passthrough badge for codec=copy", () => {
    renderStreamProfileCell({
      ...baseCamera,
      streamProfile: { id: "p2", name: "HD 15", codec: "copy" },
    })
    expect(screen.getByText("HD 15")).toBeInTheDocument()
    const badge = screen.getByText("Passthrough")
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain("bg-green-100")
    expect(badge.className).toContain("text-green-700")
  })

  it("renders Auto badge for unknown codec (e.g. h264_nvenc)", () => {
    renderStreamProfileCell({
      ...baseCamera,
      streamProfile: { id: "p3", name: "Custom", codec: "h264_nvenc" },
    })
    expect(screen.getByText("Custom")).toBeInTheDocument()
    const badge = screen.getByText("Auto")
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain("bg-neutral-100")
  })

  it("renders em-dash with NO badge when streamProfile is null", () => {
    renderStreamProfileCell({ ...baseCamera, streamProfile: null })
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.queryByText("Transcode")).toBeNull()
    expect(screen.queryByText("Passthrough")).toBeNull()
    expect(screen.queryByText("Auto")).toBeNull()
  })

  it("renders em-dash when streamProfile is undefined (legacy rows)", () => {
    const cam: CameraRow = { ...baseCamera }
    // Ensure the property is genuinely absent, not just null.
    delete (cam as unknown as Record<string, unknown>).streamProfile
    renderStreamProfileCell(cam)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("is positioned between resolution and createdAt columns", () => {
    const columns = createCamerasColumns(noopCallbacks) as unknown as AnyCol[]
    const resIdx = columns.findIndex((c) => c.id === "resolution")
    const profIdx = columns.findIndex((c) => c.id === "streamProfile")
    const createdIdx = columns.findIndex(
      (c) => c.accessorKey === "createdAt",
    )
    expect(resIdx).toBeGreaterThan(-1)
    expect(profIdx).toBeGreaterThan(-1)
    expect(createdIdx).toBeGreaterThan(-1)
    expect(profIdx).toBe(resIdx + 1)
    expect(createdIdx).toBe(profIdx + 1)
  })

  it("accessorFn returns profile name for sorting (empty string when null)", () => {
    const columns = createCamerasColumns(noopCallbacks) as unknown as AnyCol[]
    const col = columns.find((c) => c.id === "streamProfile") as
      | { accessorFn?: (row: CameraRow) => string }
      | undefined
    expect(typeof col?.accessorFn).toBe("function")
    expect(
      col!.accessorFn!({
        ...baseCamera,
        streamProfile: { id: "x", name: "SD640", codec: "libx264" },
      }),
    ).toBe("SD640")
    expect(col!.accessorFn!({ ...baseCamera, streamProfile: null })).toBe("")
  })
})
