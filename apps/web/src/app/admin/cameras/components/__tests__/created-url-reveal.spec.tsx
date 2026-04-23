import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { CreatedUrlReveal } from "../created-url-reveal"

// Mock sonner toast (side-effect module)
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe("CreatedUrlReveal (D-09 / D-20)", () => {
  beforeEach(() => {
    // Stub navigator.clipboard for the happy-path copy flow.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  it("renders title + body heading + URL input + CTAs", () => {
    render(
      <CreatedUrlReveal
        url="rtmp://h:1935/push/abc"
        title="Camera created"
        onClose={() => {}}
      />,
    )
    expect(screen.getByText("Camera created")).toBeTruthy()
    expect(
      screen.getByText("Push this URL to your camera or encoder:"),
    ).toBeTruthy()
    expect(
      (screen.getByLabelText("Generated push URL") as HTMLInputElement).value,
    ).toBe("rtmp://h:1935/push/abc")
    expect(screen.getByText("Copy URL")).toBeTruthy()
    expect(screen.getByText("Done")).toBeTruthy()
    expect(screen.getByText("Setup guide →")).toBeTruthy()
  })

  it("renders default helper text when helperText prop absent", () => {
    render(<CreatedUrlReveal url="x" title="t" onClose={() => {}} />)
    expect(
      screen.getByText(/view this URL anytime from the camera detail panel/i),
    ).toBeTruthy()
  })

  it("overrides helper text when helperText prop supplied (rotate flow)", () => {
    render(
      <CreatedUrlReveal
        url="x"
        title="Key rotated"
        helperText="Old key invalidated. Update your camera to resume publishing."
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/Old key invalidated/)).toBeTruthy()
  })

  it("Copy button writes URL to clipboard and shows Copied state for 2s", async () => {
    // Install fake timers BEFORE the click so the component's setTimeout(…,
    // 2000) is scheduled on the fake clock. Microtasks (clipboard promise) are
    // unaffected, so awaits still resolve.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(<CreatedUrlReveal url="rtmp://x" title="t" onClose={() => {}} />)
      fireEvent.click(screen.getByText("Copy URL"))

      await waitFor(() =>
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith("rtmp://x"),
      )
      await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy())

      act(() => {
        vi.advanceTimersByTime(2100)
      })
      expect(screen.queryByText("Copied")).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("Done button invokes onClose", () => {
    const onClose = vi.fn()
    render(<CreatedUrlReveal url="x" title="t" onClose={onClose} />)
    fireEvent.click(screen.getByText("Done"))
    expect(onClose).toHaveBeenCalled()
  })
})
