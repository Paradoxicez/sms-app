import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";

describe("DatePicker (FOUND-02a)", () => {
  it("renders button with default placeholder 'Pick a date'", () => {
    render(<DatePicker onDateChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Pick a date/i })
    ).toBeInTheDocument();
  });

  it("renders custom placeholder when provided", () => {
    render(<DatePicker onDateChange={vi.fn()} placeholder="Select date" />);
    expect(
      screen.getByRole("button", { name: /Select date/i })
    ).toBeInTheDocument();
  });

  it("displays formatted date when date prop is provided", () => {
    render(
      <DatePicker onDateChange={vi.fn()} date={new Date(2026, 3, 17)} />
    );
    // date-fns PPP format for April 17, 2026
    expect(
      screen.getByRole("button", { name: /April 17/i })
    ).toBeInTheDocument();
  });
});

describe("DateRangePicker (FOUND-02b)", () => {
  it("renders button with default placeholder 'Pick a date range'", () => {
    render(<DateRangePicker onDateRangeChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Pick a date range/i })
    ).toBeInTheDocument();
  });

  it("displays formatted range when dateRange prop is provided", () => {
    render(
      <DateRangePicker
        onDateRangeChange={vi.fn()}
        dateRange={{
          from: new Date(2026, 3, 10),
          to: new Date(2026, 3, 17),
        }}
      />
    );
    expect(
      screen.getByRole("button", { name: /Apr 10, 2026.*Apr 17, 2026/i })
    ).toBeInTheDocument();
  });

  it("displays partial range when only from is set", () => {
    render(
      <DateRangePicker
        onDateRangeChange={vi.fn()}
        dateRange={{ from: new Date(2026, 3, 10) }}
      />
    );
    expect(
      screen.getByRole("button", { name: /Apr 10, 2026.*\.\.\./i })
    ).toBeInTheDocument();
  });
});

describe("No native date inputs (FOUND-02c)", () => {
  const pagesDir = path.resolve(__dirname, "../components/pages");

  it("tenant-audit-log-page.tsx does not contain type=\"date\"", () => {
    const content = fs.readFileSync(
      path.join(pagesDir, "tenant-audit-log-page.tsx"),
      "utf-8"
    );
    expect(content).not.toMatch(/type=["']date["']/);
  });

  it("tenant-recordings-page.tsx does not contain type=\"date\"", () => {
    const content = fs.readFileSync(
      path.join(pagesDir, "tenant-recordings-page.tsx"),
      "utf-8"
    );
    expect(content).not.toMatch(/type=["']date["']/);
  });
});
