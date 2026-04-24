import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@testing-library/jest-dom/vitest"

import { MaintenanceReasonDialog } from "../maintenance-reason-dialog"

describe("MaintenanceReasonDialog — title & description", () => {
  it("renders single-mode title 'Enter Maintenance Mode'", () => {
    render(
      <MaintenanceReasonDialog
        open
        onOpenChange={() => {}}
        target={{ type: "single", cameraName: "Cam-01" }}
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByText("Enter Maintenance Mode")).toBeInTheDocument()
  })

  it("renders bulk title 'Enter Maintenance Mode for 3 Cameras'", () => {
    render(
      <MaintenanceReasonDialog
        open
        onOpenChange={() => {}}
        target={{ type: "bulk", count: 3 }}
        onConfirm={() => {}}
      />,
    )
    expect(
      screen.getByText("Enter Maintenance Mode for 3 Cameras"),
    ).toBeInTheDocument()
  })

  it("single description contains camera name", () => {
    render(
      <MaintenanceReasonDialog
        open
        onOpenChange={() => {}}
        target={{ type: "single", cameraName: "Cam-01" }}
        onConfirm={() => {}}
      />,
    )
    expect(
      screen.getByText(
        /Camera "Cam-01" will stop streaming and stop recording\./,
      ),
    ).toBeInTheDocument()
  })

  it("bulk description contains count", () => {
    render(
      <MaintenanceReasonDialog
        open
        onOpenChange={() => {}}
        target={{ type: "bulk", count: 3 }}
        onConfirm={() => {}}
      />,
    )
    expect(
      screen.getByText(/3 cameras will stop streaming and stop recording\./),
    ).toBeInTheDocument()
  })
})

describe("MaintenanceReasonDialog — textarea + counter", () => {
  it("caps input at 200 chars (user types 250, value length === 200)", async () => {
    const user = userEvent.setup()
    render(
      <MaintenanceReasonDialog
        open
        onOpenChange={() => {}}
        target={{ type: "single", cameraName: "Cam-01" }}
        onConfirm={() => {}}
      />,
    )
    const textarea = screen.getByLabelText(/Reason \(optional\)/i) as HTMLTextAreaElement
    await user.type(textarea, "x".repeat(250))
    expect(textarea.value.length).toBe(200)
  })

  it("counter reads '0/200' initially", () => {
    render(
      <MaintenanceReasonDialog
        open
        onOpenChange={() => {}}
        target={{ type: "single", cameraName: "Cam-01" }}
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByText("0/200")).toBeInTheDocument()
  })

  it("counter reads '5/200' after typing 'hello'", async () => {
    const user = userEvent.setup()
    render(
      <MaintenanceReasonDialog
        open
        onOpenChange={() => {}}
        target={{ type: "single", cameraName: "Cam-01" }}
        onConfirm={() => {}}
      />,
    )
    const textarea = screen.getByLabelText(/Reason \(optional\)/i) as HTMLTextAreaElement
    await user.type(textarea, "hello")
    expect(screen.getByText("5/200")).toBeInTheDocument()
  })
})

describe("MaintenanceReasonDialog — onConfirm behavior", () => {
  it("onConfirm called with { reason: undefined } when textarea is empty", async () => {
    const spy = vi.fn()
    render(
      <MaintenanceReasonDialog
        open
        onOpenChange={() => {}}
        target={{ type: "single", cameraName: "Cam-01" }}
        onConfirm={spy}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /^Enter Maintenance$/ }))
    expect(spy).toHaveBeenCalledWith({ reason: undefined })
  })

  it("onConfirm called with { reason: 'Lens cleaning' } when textarea has text", async () => {
    const spy = vi.fn()
    const user = userEvent.setup()
    render(
      <MaintenanceReasonDialog
        open
        onOpenChange={() => {}}
        target={{ type: "single", cameraName: "Cam-01" }}
        onConfirm={spy}
      />,
    )
    const textarea = screen.getByLabelText(/Reason \(optional\)/i)
    await user.type(textarea, "Lens cleaning")
    fireEvent.click(screen.getByRole("button", { name: /^Enter Maintenance$/ }))
    expect(spy).toHaveBeenCalledWith({ reason: "Lens cleaning" })
  })

  it("onConfirm called with { reason: undefined } when textarea is whitespace-only", async () => {
    const spy = vi.fn()
    const user = userEvent.setup()
    render(
      <MaintenanceReasonDialog
        open
        onOpenChange={() => {}}
        target={{ type: "single", cameraName: "Cam-01" }}
        onConfirm={spy}
      />,
    )
    const textarea = screen.getByLabelText(/Reason \(optional\)/i)
    await user.type(textarea, "   ")
    fireEvent.click(screen.getByRole("button", { name: /^Enter Maintenance$/ }))
    expect(spy).toHaveBeenCalledWith({ reason: undefined })
  })
})

describe("MaintenanceReasonDialog — submitting state", () => {
  it("submitting=true disables Cancel, Confirm, textarea", () => {
    render(
      <MaintenanceReasonDialog
        open
        onOpenChange={() => {}}
        target={{ type: "single", cameraName: "Cam-01" }}
        submitting
        onConfirm={() => {}}
      />,
    )
    const cancel = screen.getByRole("button", { name: /Cancel/ }) as HTMLButtonElement
    const confirm = screen.getByRole("button", { name: /Entering maintenance/ }) as HTMLButtonElement
    const textarea = screen.getByLabelText(/Reason \(optional\)/i) as HTMLTextAreaElement
    expect(cancel).toBeDisabled()
    expect(confirm).toBeDisabled()
    expect(textarea).toBeDisabled()
  })

  it("submitting=true shows 'Entering maintenance…' text", () => {
    render(
      <MaintenanceReasonDialog
        open
        onOpenChange={() => {}}
        target={{ type: "single", cameraName: "Cam-01" }}
        submitting
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByText(/Entering maintenance…/)).toBeInTheDocument()
  })
})

describe("MaintenanceReasonDialog — a11y focus return (M5)", () => {
  beforeEach(() => {
    // jsdom-friendly focus baseline
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("focus returns to originating trigger after dialog close via Cancel", async () => {
    function Harness() {
      const [open, setOpen] = require("react").useState(false)
      return (
        <>
          <button id="trigger" onClick={() => setOpen(true)}>
            Open
          </button>
          <MaintenanceReasonDialog
            open={open}
            onOpenChange={setOpen}
            target={{ type: "single", cameraName: "Cam-01" }}
            onConfirm={() => {}}
          />
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByRole("button", { name: "Open" })
    trigger.focus()
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger)
    // Dialog renders; close via Cancel.
    const cancel = await screen.findByRole("button", { name: /^Cancel$/ })
    fireEvent.click(cancel)
    await waitFor(() => {
      expect(document.activeElement?.id).toBe("trigger")
    })
  })
})
