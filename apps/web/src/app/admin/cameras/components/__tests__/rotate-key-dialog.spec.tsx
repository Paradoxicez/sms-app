import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { RotateKeyDialog } from "../rotate-key-dialog"

// Mock sonner toast side-effect.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe("RotateKeyDialog (D-19 / D-20)", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch
    // Stub clipboard for the post-reveal path.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("renders confirm body + destructive Rotate key button", () => {
    render(<RotateKeyDialog cameraId="c1" open onOpenChange={() => {}} />)
    expect(screen.getByText("Rotate push key?")).toBeTruthy()
    expect(screen.getByText(/disconnected immediately/)).toBeTruthy()
    const confirm = screen.getByText("Rotate key") as HTMLButtonElement
    expect(confirm.className).toMatch(/bg-destructive/)
  })

  it("on confirm, POSTs rotate-key and swaps to CreatedUrlReveal with 'Key rotated'", async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ streamUrl: "rtmp://h/push/NEWKEY" }),
    })
    render(<RotateKeyDialog cameraId="c1" open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByText("Rotate key"))
    await waitFor(() => expect(screen.getByText("Key rotated")).toBeTruthy())
    expect(
      (screen.getByLabelText("Generated push URL") as HTMLInputElement).value,
    ).toBe("rtmp://h/push/NEWKEY")
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/cameras/c1/rotate-key",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    )
  })

  it("on rotate failure, shows toast and stays in confirm phase", async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    })
    const { toast } = await import("sonner")
    render(<RotateKeyDialog cameraId="c1" open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByText("Rotate key"))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to rotate key. The old key is still valid — try again.",
      ),
    )
    expect(screen.getByText("Rotate push key?")).toBeTruthy()
  })

  it("on reveal Done click, calls onOpenChange(false) + onSuccess", async () => {
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ streamUrl: "rtmp://x" }),
    })
    render(
      <RotateKeyDialog
        cameraId="c1"
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    )
    fireEvent.click(screen.getByText("Rotate key"))
    await waitFor(() => screen.getByText("Key rotated"))
    fireEvent.click(screen.getByText("Done"))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSuccess).toHaveBeenCalled()
  })
})
