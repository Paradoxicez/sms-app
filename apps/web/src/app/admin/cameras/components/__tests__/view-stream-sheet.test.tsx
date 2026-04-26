import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@testing-library/jest-dom"

// Sonner mocked globally so Phase 20 copy + toggle handlers can assert toasts.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// HlsPlayer + ResolvedPolicyCard + AuditLogDataTable do expensive things at mount
// (fetch, hls.js ctor, etc.) that we don't need for header / button assertions.
vi.mock("@/components/recordings/hls-player", () => ({
  HlsPlayer: () => <div data-testid="mock-hls-player" />,
}))
vi.mock("@/app/admin/policies/components/resolved-policy-card", () => ({
  ResolvedPolicyCard: () => <div data-testid="mock-resolved-policy" />,
}))
vi.mock("@/components/audit/audit-log-data-table", () => ({
  AuditLogDataTable: () => <div data-testid="mock-audit-log" />,
}))

import { toast } from "sonner"
import { ViewStreamSheet } from "../view-stream-sheet"
import type { CameraRow } from "../cameras-columns"

// Wrapper helper: render ViewStreamSheet open with the given camera + callbacks.
// We render via the exported Sheet wrapper (not ViewStreamContent directly)
// because SheetTitle/SheetDescription require a DialogRootContext that only
// exists inside <Sheet open>.
function renderSheet(
  camera: CameraRow,
  callbacks: {
    onStreamToggle?: (c: CameraRow) => void
    onRecordToggle?: (c: CameraRow) => void
    onRefresh?: () => void
  } = {}
) {
  return render(
    <ViewStreamSheet
      camera={camera}
      open={true}
      onOpenChange={() => {}}
      onStreamToggle={callbacks.onStreamToggle}
      onRecordToggle={callbacks.onRecordToggle}
      onRefresh={callbacks.onRefresh}
    />
  )
}

const SAMPLE_ID = "1dfaadd7-c5f9-49b8-b26e-7a6c402a8103"

const baseCamera: CameraRow = {
  id: SAMPLE_ID,
  name: "Cam-01",
  status: "offline",
  isRecording: false,
  maintenanceMode: false,
  streamUrl: "rtsp://example/live",
  codecInfo: null,
  streamProfileId: null,
  location: null,
  description: null,
  tags: [],
  site: { id: "s1", name: "Site A", project: { id: "p1", name: "Proj" } },
  createdAt: new Date("2026-04-24T00:00:00Z").toISOString(),
  ingestMode: "pull",
}

// userEvent.setup() installs its own navigator.clipboard stub, so our
// writeText mock MUST be installed AFTER user.setup() (helper from 20-02).
function installClipboardMock(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
})

describe("ViewStreamSheet header (Phase 20 D-17, D-18)", () => {
  it("renders 3-line header: camera name / breadcrumb / ID chip", () => {
    renderSheet(baseCamera)
    // Line 1: SheetTitle (heading, Cam-01 also appears in Camera Info card span)
    expect(
      screen.getByRole("heading", { level: 2, name: "Cam-01" })
    ).toBeInTheDocument()
    // Line 2: breadcrumb "Site A > Proj" as sheet description
    expect(
      screen.getByText((_, el) =>
        el?.getAttribute("data-slot") === "sheet-description"
      )
    ).toHaveTextContent(/Site A.*Proj/)
    // Line 3: ID chip (see dedicated assertions below)
    expect(
      screen.getByRole("button", { name: /camera id.*click to copy/i })
    ).toBeInTheDocument()
  })

  it('ID chip shows truncated form "1dfaadd7…402a8103" (8 prefix + U+2026 + 8 suffix)', () => {
    renderSheet(baseCamera)
    const chip = screen.getByRole("button", { name: /camera id.*click to copy/i })
    // U+2026 literal, NOT three ASCII dots.
    expect(chip.textContent).toBe("1dfaadd7…402a8103")
    // Sanity check — the unicode char is exactly 1 code point wide.
    expect(chip.textContent).not.toContain("...")
  })

  it("ID chip uses font-mono text-xs bg-muted classes", () => {
    renderSheet(baseCamera)
    const chip = screen.getByRole("button", { name: /camera id.*click to copy/i })
    expect(chip.className).toContain("font-mono")
    expect(chip.className).toContain("text-xs")
    expect(chip.className).toContain("bg-muted")
  })

  it('ID chip has aria-label containing full UUID and "click to copy"', () => {
    renderSheet(baseCamera)
    const chip = screen.getByRole("button", { name: /camera id.*click to copy/i })
    expect(chip.getAttribute("aria-label")).toBe(
      `Camera ID ${SAMPLE_ID}, click to copy`
    )
  })

  it("tooltip on hover shows full UUID", async () => {
    const user = userEvent.setup()
    renderSheet(baseCamera)
    const chip = screen.getByRole("button", { name: /camera id.*click to copy/i })
    await user.hover(chip)
    // Base-UI tooltip renders in a portal; wait for it to materialize.
    expect(
      await screen.findByText(SAMPLE_ID, {}, { timeout: 2000 })
    ).toBeInTheDocument()
  })

  it("clicking ID chip writes FULL UUID (not truncated) to navigator.clipboard", async () => {
    const user = userEvent.setup()
    renderSheet(baseCamera)
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboardMock(writeText)
    const chip = screen.getByRole("button", {
      name: /camera id.*click to copy/i,
    })
    await user.click(chip)
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText).toHaveBeenCalledWith(SAMPLE_ID)
    expect(writeText.mock.calls[0]?.[0]).toBe(SAMPLE_ID)
  })

  it("clicking copy icon button also writes FULL UUID to clipboard", async () => {
    const user = userEvent.setup()
    renderSheet(baseCamera)
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboardMock(writeText)
    const icon = screen.getByRole("button", { name: /copy camera id/i })
    await user.click(icon)
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText).toHaveBeenCalledWith(SAMPLE_ID)
  })

  it('successful copy fires toast.success("Camera ID copied")', async () => {
    const user = userEvent.setup()
    renderSheet(baseCamera)
    const writeText = vi.fn().mockResolvedValue(undefined)
    installClipboardMock(writeText)
    const chip = screen.getByRole("button", {
      name: /camera id.*click to copy/i,
    })
    await user.click(chip)
    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Camera ID copied")
    )
  })

  it('failed copy (clipboard rejection) fires toast.error("Couldn\'t copy to clipboard")', async () => {
    const user = userEvent.setup()
    renderSheet(baseCamera)
    const writeText = vi.fn().mockRejectedValue(new Error("denied"))
    installClipboardMock(writeText)
    const chip = screen.getByRole("button", {
      name: /camera id.*click to copy/i,
    })
    await user.click(chip)
    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Couldn't copy to clipboard"
      )
    )
  })
})

describe("ViewStreamSheet Start Stream pill-button (D-19, D-20)", () => {
  it("idle state: w-9 square, outline variant, Radio icon muted-foreground", () => {
    renderSheet({ ...baseCamera, status: "offline" }, { onStreamToggle: vi.fn() })
    const btn = screen.getByRole("button", { name: /start stream/i })
    expect(btn.className).toContain("w-9")
    expect(btn.className).toContain("h-9")
    expect(btn.className).toContain("border-border")
    expect(btn.className).toContain("bg-background")
    expect(btn.className).toContain("text-muted-foreground")
  })

  it('active state (status=online): w-[160px] pill, bg-red-500, white Radio icon with pulse, "Stop Stream" label', () => {
    renderSheet({ ...baseCamera, status: "online" }, { onStreamToggle: vi.fn() })
    const btn = screen.getByRole("button", { name: /stop stream/i })
    expect(btn.className).toContain("w-[160px]")
    expect(btn.className).toContain("bg-red-500")
    expect(btn.className).toContain("text-white")
    expect(btn.className).toContain("border-transparent")
    expect(btn.textContent).toContain("Stop Stream")
  })

  it('active state has aria-pressed="true" aria-label="Stop stream"', () => {
    renderSheet({ ...baseCamera, status: "online" }, { onStreamToggle: vi.fn() })
    const btn = screen.getByRole("button", { name: /stop stream/i })
    expect(btn.getAttribute("aria-pressed")).toBe("true")
    expect(btn.getAttribute("aria-label")).toBe("Stop stream")
  })

  it('idle state has aria-pressed="false" aria-label="Start stream"', () => {
    renderSheet({ ...baseCamera, status: "offline" }, { onStreamToggle: vi.fn() })
    const btn = screen.getByRole("button", { name: /start stream/i })
    expect(btn.getAttribute("aria-pressed")).toBe("false")
    expect(btn.getAttribute("aria-label")).toBe("Start stream")
  })

  it("transition classes include transition-[width,background-color] duration-150", () => {
    renderSheet({ ...baseCamera, status: "offline" }, { onStreamToggle: vi.fn() })
    const btn = screen.getByRole("button", { name: /start stream/i })
    expect(btn.className).toContain("transition-[width,background-color]")
    expect(btn.className).toContain("duration-150")
  })

  it("pulse respects motion-reduce (motion-reduce:animate-none present)", () => {
    renderSheet({ ...baseCamera, status: "online" }, { onStreamToggle: vi.fn() })
    // The Radio icon inside the active Stop Stream button carries the pulse classes.
    const btn = screen.getByRole("button", { name: /stop stream/i })
    const icon = btn.querySelector("svg")
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute("class") ?? "").toContain(
      "motion-safe:animate-pulse"
    )
    expect(icon?.getAttribute("class") ?? "").toContain(
      "motion-reduce:animate-none"
    )
  })
})

describe("ViewStreamSheet Start Record pill-button (D-21)", () => {
  it("idle state: w-9 square, outline variant, Circle icon muted-foreground (hollow)", () => {
    renderSheet({ ...baseCamera, isRecording: false }, { onRecordToggle: vi.fn() })
    const btn = screen.getByRole("button", { name: /start recording/i })
    expect(btn.className).toContain("w-9")
    expect(btn.className).toContain("h-9")
    expect(btn.className).toContain("border-border")
    expect(btn.className).toContain("bg-background")
    expect(btn.className).toContain("text-muted-foreground")
    // Circle icon present (hollow)
    expect(btn.querySelector("svg")).not.toBeNull()
  })

  it("active state (isRecording=true): w-[160px] pill, bg-zinc-900 dark:bg-zinc-800, white REC label with pulsing red dot", () => {
    renderSheet({ ...baseCamera, isRecording: true }, { onRecordToggle: vi.fn() })
    const btn = screen.getByRole("button", { name: /stop recording/i })
    expect(btn.className).toContain("w-[160px]")
    expect(btn.className).toContain("bg-zinc-900")
    expect(btn.className).toContain("dark:bg-zinc-800")
    expect(btn.textContent).toContain("REC")
  })

  it('active state has aria-pressed="true" aria-label="Stop recording"', () => {
    renderSheet({ ...baseCamera, isRecording: true }, { onRecordToggle: vi.fn() })
    const btn = screen.getByRole("button", { name: /stop recording/i })
    expect(btn.getAttribute("aria-pressed")).toBe("true")
    expect(btn.getAttribute("aria-label")).toBe("Stop recording")
  })

  it('idle state has aria-pressed="false" aria-label="Start recording"', () => {
    renderSheet({ ...baseCamera, isRecording: false }, { onRecordToggle: vi.fn() })
    const btn = screen.getByRole("button", { name: /start recording/i })
    expect(btn.getAttribute("aria-pressed")).toBe("false")
    expect(btn.getAttribute("aria-label")).toBe("Start recording")
  })

  it("REC label uses text-[10px] font-bold uppercase tracking-wide", () => {
    renderSheet({ ...baseCamera, isRecording: true }, { onRecordToggle: vi.fn() })
    const btn = screen.getByRole("button", { name: /stop recording/i })
    // Find the REC span
    const rec = Array.from(btn.querySelectorAll("span")).find(
      (s) => s.textContent?.trim() === "REC"
    )
    expect(rec).toBeDefined()
    expect(rec?.className).toContain("text-[10px]")
    expect(rec?.className).toContain("font-bold")
    expect(rec?.className).toContain("uppercase")
    expect(rec?.className).toContain("tracking-wide")
  })

  it("pulse respects motion-reduce", () => {
    renderSheet({ ...baseCamera, isRecording: true }, { onRecordToggle: vi.fn() })
    const btn = screen.getByRole("button", { name: /stop recording/i })
    // The red-dot span carries the pulse classes.
    const dot = Array.from(btn.querySelectorAll("span")).find(
      (s) => s.className.includes("rounded-full") && s.className.includes("bg-red-500")
    )
    expect(dot).toBeDefined()
    expect(dot?.className).toContain("motion-safe:animate-pulse")
    expect(dot?.className).toContain("motion-reduce:animate-none")
  })
})

describe("Container reserves width (D-19)", () => {
  it("container uses min-w-[340px] justify-end", () => {
    renderSheet(baseCamera, {
      onStreamToggle: vi.fn(),
      onRecordToggle: vi.fn(),
    })
    // The container wraps both toggle buttons; find it via the Start Stream btn.
    const btn = screen.getByRole("button", { name: /start stream/i })
    const container = btn.parentElement
    expect(container).not.toBeNull()
    expect(container?.className).toContain("min-w-[340px]")
    expect(container?.className).toContain("justify-end")
  })

  it("container uses flex items-center gap-2", () => {
    renderSheet(baseCamera, {
      onStreamToggle: vi.fn(),
      onRecordToggle: vi.fn(),
    })
    const btn = screen.getByRole("button", { name: /start stream/i })
    const container = btn.parentElement
    expect(container).not.toBeNull()
    expect(container?.className).toContain("flex")
    expect(container?.className).toContain("items-center")
    expect(container?.className).toContain("gap-2")
  })
})

describe("Phase 22: Notes section (D-16)", () => {
  it("renders Notes heading + body when description is non-empty (preserves newlines via whitespace-pre-line)", () => {
    renderSheet({
      ...baseCamera,
      description: "First line\nSecond line",
    })
    // Heading present
    expect(
      screen.getByRole("heading", { level: 3, name: "Notes" })
    ).toBeInTheDocument()
    // Both lines present in document (whitespace-pre-line preserves the newline visually
    // but in DOM the textContent stays as a single string with the \n char).
    const body = screen.getByText((text) =>
      text.includes("First line") && text.includes("Second line")
    )
    expect(body).toBeInTheDocument()
    // The body element uses whitespace-pre-line so newlines render visually.
    expect(body.className).toContain("whitespace-pre-line")
  })

  it("does NOT render Notes section when description is empty string", () => {
    renderSheet({ ...baseCamera, description: "" })
    expect(
      screen.queryByRole("heading", { level: 3, name: "Notes" })
    ).not.toBeInTheDocument()
  })

  it("does NOT render Notes section when description is null", () => {
    renderSheet({ ...baseCamera, description: null })
    expect(
      screen.queryByRole("heading", { level: 3, name: "Notes" })
    ).not.toBeInTheDocument()
  })

  it("does NOT render Notes section when description is whitespace-only", () => {
    renderSheet({ ...baseCamera, description: "   \n  " })
    expect(
      screen.queryByRole("heading", { level: 3, name: "Notes" })
    ).not.toBeInTheDocument()
  })

  it("Notes block appears BEFORE the Tabs (document order)", () => {
    renderSheet({
      ...baseCamera,
      description: "Some camera notes here",
    })
    const heading = screen.getByRole("heading", { level: 3, name: "Notes" })
    const tabsList = screen.getByRole("tablist")
    // Notes heading must precede the tablist in document order.
    expect(
      heading.compareDocumentPosition(tabsList) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("Notes section has no edit button (read-only — D-16)", () => {
    renderSheet({
      ...baseCamera,
      description: "Some camera notes here",
    })
    const heading = screen.getByRole("heading", { level: 3, name: "Notes" })
    // Walk up to the section that contains the heading.
    const section = heading.closest("section")
    expect(section).not.toBeNull()
    const editButtons = Array.from(
      section?.querySelectorAll("button") ?? []
    ).filter((b) => /edit/i.test(b.textContent ?? "") || /edit/i.test(b.getAttribute("aria-label") ?? ""))
    expect(editButtons.length).toBe(0)
  })

  it("Notes heading uses uppercase tracking-wide text-muted-foreground per UI-SPEC", () => {
    renderSheet({
      ...baseCamera,
      description: "Some camera notes here",
    })
    const heading = screen.getByRole("heading", { level: 3, name: "Notes" })
    expect(heading.className).toContain("text-xs")
    expect(heading.className).toContain("font-medium")
    expect(heading.className).toContain("uppercase")
    expect(heading.className).toContain("tracking-wide")
    expect(heading.className).toContain("text-muted-foreground")
  })

  it("Notes section has mb-6 spacing (24px lg-spacing per UI-SPEC §Spacing)", () => {
    renderSheet({
      ...baseCamera,
      description: "Some camera notes here",
    })
    const heading = screen.getByRole("heading", { level: 3, name: "Notes" })
    const section = heading.closest("section")
    expect(section).not.toBeNull()
    expect(section?.className).toContain("mb-6")
  })
})
