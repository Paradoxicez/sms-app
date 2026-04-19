/**
 * VALIDATION: Phase 17 — REC-03 heatmap rendering
 * Status: GREEN — fills the it.todo scaffold from plan 17-00; locks the
 * UI-SPEC contract that filled hours render `bg-chart-1` (UI-SPEC §Color).
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  TimelineBar,
  type TimelineHourData,
} from "@/components/recordings/timeline-bar";

function makeHours(pattern: boolean[]): TimelineHourData[] {
  return pattern.map((hasData, hour) => ({ hour, hasData }));
}

describe("TimelineBar heatmap (Phase 17 — REC-03)", () => {
  it("REC-03 heatmap: renders bg-chart-1 class for hours where hasData=true", () => {
    const hours = makeHours(
      Array.from({ length: 24 }, (_, i) => i % 2 === 0), // alternating
    );
    const { container } = render(
      <TimelineBar
        hours={hours}
        selectedRange={null}
        onRangeSelect={() => {}}
        onSeek={() => {}}
      />,
    );
    const filled = container.querySelectorAll(".bg-chart-1");
    expect(filled.length).toBe(12);
  });

  it("REC-03 heatmap: empty hours render without bg-chart-1", () => {
    const hours = makeHours(Array(24).fill(false));
    const { container } = render(
      <TimelineBar
        hours={hours}
        selectedRange={null}
        onRangeSelect={() => {}}
        onSeek={() => {}}
      />,
    );
    expect(container.querySelectorAll(".bg-chart-1").length).toBe(0);
  });

  it("REC-03 heatmap: all-full day renders 24 bg-chart-1 cells", () => {
    const hours = makeHours(Array(24).fill(true));
    const { container } = render(
      <TimelineBar
        hours={hours}
        selectedRange={null}
        onRangeSelect={() => {}}
        onSeek={() => {}}
      />,
    );
    expect(container.querySelectorAll(".bg-chart-1").length).toBe(24);
  });
});
