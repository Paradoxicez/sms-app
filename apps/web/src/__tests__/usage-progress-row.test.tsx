// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-02 Task T4.
import { describe, it } from "vitest";

describe("UsageProgressRow", () => {
  it.todo("renders label + used/max + percentage in tabular-nums");
  it.todo("fill is bg-primary when percentage < 80");
  it.todo("fill is bg-amber-500 and percentage text is text-amber-600 when percentage in [80, 95)");
  it.todo("fill is bg-destructive and percentage text is text-destructive when percentage >= 95");
  it.todo("renders 0% with all-muted track when used=0");
  it.todo("clamps display to 100% when used > max (guard divide overflow)");
  it.todo('progress bar has aria-label "{metric} usage, {used} of {max}"');
});
