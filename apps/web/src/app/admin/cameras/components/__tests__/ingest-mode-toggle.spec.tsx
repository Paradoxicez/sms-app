import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

import { IngestModeToggle } from "../ingest-mode-toggle"

describe("IngestModeToggle (D-08)", () => {
  it("renders both Pull and Push options", () => {
    render(<IngestModeToggle value="pull" onChange={() => {}} />)
    expect(screen.getByText("Pull")).toBeTruthy()
    expect(screen.getByText("Push")).toBeTruthy()
  })

  it("highlights the current value via data-pressed (ToggleGroupItem pressed state)", () => {
    const { container } = render(
      <IngestModeToggle value="push" onChange={() => {}} />,
    )
    const pressed = container.querySelector('[data-pressed]')
    // Base-UI marks the active toggle with data-pressed="" attribute
    expect(pressed).not.toBeNull()
    expect(pressed?.textContent).toMatch(/Push/)
  })

  it("calls onChange with the new value when clicked", () => {
    const onChange = vi.fn()
    render(<IngestModeToggle value="pull" onChange={onChange} />)
    fireEvent.click(screen.getByText("Push"))
    expect(onChange).toHaveBeenCalledWith("push")
  })

  it("renders 'Source' label for screen readers (sr-only)", () => {
    render(<IngestModeToggle value="pull" onChange={() => {}} />)
    const label = screen.getByText("Source")
    expect(label.className).toMatch(/sr-only/)
  })

  it("disables both items when disabled=true", () => {
    const { container } = render(
      <IngestModeToggle value="pull" onChange={() => {}} disabled />,
    )
    const items = container.querySelectorAll("button")
    expect(items.length).toBeGreaterThanOrEqual(2)
    items.forEach((item) => {
      expect(item.disabled).toBe(true)
    })
  })
})
