// Phase 16-02 Task 4 — UsageProgressRow.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { UsageProgressRow } from "@/components/account/usage-progress-row";

describe("UsageProgressRow", () => {
  it("renders label + used/max + percentage in tabular-nums", () => {
    render(<UsageProgressRow label="Cameras" used={5} max={10} />);
    expect(screen.getByText("Cameras")).toBeInTheDocument();
    expect(screen.getByText(/5\s*\/\s*10/)).toBeInTheDocument();
    // Percentage cell
    const pct = screen.getByText("50%");
    expect(pct.className).toContain("tabular-nums");
  });

  it("fill is bg-primary when percentage < 80", () => {
    const { container } = render(
      <UsageProgressRow label="Cameras" used={5} max={10} />,
    );
    const fill = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.className).toContain("bg-primary");
  });

  it("fill is bg-amber-500 and percentage text is text-amber-600 when percentage in [80, 95)", () => {
    const { container } = render(
      <UsageProgressRow label="Cameras" used={85} max={100} />,
    );
    const fill = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(fill.className).toContain("bg-amber-500");
    const pct = screen.getByText("85%");
    expect(pct.className).toContain("text-amber-600");
  });

  it("fill is bg-destructive and percentage text is text-destructive when percentage >= 95", () => {
    const { container } = render(
      <UsageProgressRow label="Cameras" used={98} max={100} />,
    );
    const fill = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(fill.className).toContain("bg-destructive");
    const pct = screen.getByText("98%");
    expect(pct.className).toContain("text-destructive");
  });

  it("renders 0% with all-muted track when used=0", () => {
    render(<UsageProgressRow label="Cameras" used={0} max={10} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("clamps display to 100% when used > max (guard divide overflow)", () => {
    render(<UsageProgressRow label="Cameras" used={150} max={100} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it('progress bar has aria-label "{label} usage, {used} of {max}"', () => {
    const { container } = render(
      <UsageProgressRow label="Cameras" used={5} max={10} />,
    );
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-label")).toBe("Cameras usage, 5 of 10");
  });
});
