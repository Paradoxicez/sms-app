// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-02 Task T4.
import { describe, it } from "vitest";

describe("PasswordStrengthBar", () => {
  it.todo('renders 3 muted segments and "Enter a password" label when password is empty');
  it.todo('renders 1 destructive segment + "Weak" label when zxcvbn score is 0 or 1');
  it.todo('renders 2 amber segments + "Medium" label when zxcvbn score is 2 or 3');
  it.todo('renders 3 primary segments + "Strong" label when zxcvbn score is 4');
  it.todo("debounces zxcvbn invocations by 150ms during typing");
  it.todo("lazy-loads @zxcvbn-ts/core only after first mount (no top-level import)");
  it.todo('wrapper has aria-live="polite" and aria-atomic="true"');
});
