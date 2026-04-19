// Phase 16-02 Task 4 — PasswordStrengthBar.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Mock zxcvbn-ts to avoid real scoring + to assert lazy-load.
const zxcvbnMock = vi.fn((pw: string) => ({ score: scoreForPassword(pw) }));
let zxcvbnScoreOverride: 0 | 1 | 2 | 3 | 4 | null = null;
function scoreForPassword(_pw: string): 0 | 1 | 2 | 3 | 4 {
  if (zxcvbnScoreOverride !== null) return zxcvbnScoreOverride;
  return 0;
}

vi.mock("@zxcvbn-ts/core", () => ({
  zxcvbn: (pw: string) => zxcvbnMock(pw),
  zxcvbnOptions: { setOptions: vi.fn() },
}));
vi.mock("@zxcvbn-ts/language-common", () => ({
  dictionary: {},
  adjacencyGraphs: {},
}));
vi.mock("@zxcvbn-ts/language-en", () => ({
  dictionary: {},
  translations: {},
}));

import { PasswordStrengthBar } from "@/components/account/password-strength-bar";

describe("PasswordStrengthBar", () => {
  beforeEach(() => {
    zxcvbnMock.mockClear();
    zxcvbnScoreOverride = null;
  });

  it('renders 3 muted segments and "Enter a password" label when password is empty', () => {
    render(<PasswordStrengthBar password="" />);
    expect(screen.getByText("Enter a password")).toBeInTheDocument();
    const bar = screen.getByTestId("password-strength-bar");
    expect(bar.getAttribute("data-level")).toBe("empty");
    const segs = bar.querySelectorAll(".h-1");
    expect(segs.length).toBe(3);
  });

  it('renders 1 destructive segment + "Weak" label when zxcvbn score is 0 or 1', async () => {
    zxcvbnScoreOverride = 1;
    render(<PasswordStrengthBar password="weakpw" />);
    await waitFor(() => {
      expect(screen.getByText("Weak")).toBeInTheDocument();
    });
    const bar = screen.getByTestId("password-strength-bar");
    expect(bar.getAttribute("data-level")).toBe("weak");
  });

  it('renders 2 amber segments + "Medium" label when zxcvbn score is 2 or 3', async () => {
    zxcvbnScoreOverride = 3;
    render(<PasswordStrengthBar password="mediumpass" />);
    await waitFor(() => {
      expect(screen.getByText("Medium")).toBeInTheDocument();
    });
    const bar = screen.getByTestId("password-strength-bar");
    expect(bar.getAttribute("data-level")).toBe("medium");
  });

  it('renders 3 primary segments + "Strong" label when zxcvbn score is 4', async () => {
    zxcvbnScoreOverride = 4;
    render(<PasswordStrengthBar password="strongP@ss1!" />);
    await waitFor(() => {
      expect(screen.getByText("Strong")).toBeInTheDocument();
    });
    const bar = screen.getByTestId("password-strength-bar");
    expect(bar.getAttribute("data-level")).toBe("strong");
  });

  it("debounces zxcvbn invocations by 150ms during typing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    zxcvbnScoreOverride = 2;
    const { rerender } = render(<PasswordStrengthBar password="" />);
    // Wait for lazy load to resolve
    await vi.advanceTimersByTimeAsync(50);
    rerender(<PasswordStrengthBar password="a" />);
    rerender(<PasswordStrengthBar password="ab" />);
    rerender(<PasswordStrengthBar password="abc" />);
    // Before 150ms, zxcvbn should NOT have been called
    await vi.advanceTimersByTimeAsync(100);
    expect(zxcvbnMock).not.toHaveBeenCalled();
    // After debounce window, it should be called exactly once
    await vi.advanceTimersByTimeAsync(200);
    expect(zxcvbnMock).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("lazy-loads @zxcvbn-ts/core only after first mount (no top-level import)", () => {
    const src = readFileSync(
      resolve(__dirname, "../components/account/password-strength-bar.tsx"),
      "utf8",
    );
    // No top-level static import
    expect(src).not.toMatch(/^import[^;]*@zxcvbn-ts\/core/m);
    // Dynamic import present
    expect(src).toMatch(/import\(['"]@zxcvbn-ts\/core['"]\)/);
  });

  it('wrapper has aria-live="polite" and aria-atomic="true"', () => {
    render(<PasswordStrengthBar password="" />);
    const bar = screen.getByTestId("password-strength-bar");
    expect(bar.getAttribute("aria-live")).toBe("polite");
    expect(bar.getAttribute("aria-atomic")).toBe("true");
  });
});
