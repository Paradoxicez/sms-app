/**
 * VALIDATION: Phase 17 — useRecording hook contract (REC-01 supporting / T-17-V7)
 * Status: scaffolded with it.todo — plan 17-02 fills these in alongside the hook implementation.
 *
 * Mocks apiFetch via vi.mock("@/lib/api"). The hook lives at @/hooks/use-recordings (added by 17-02).
 */
import { describe, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

describe("useRecording hook (Phase 17 — contract)", () => {
  it.todo("returns { recording: null, loading: true, error: null } on initial mount with a defined id");
  it.todo("resolves recording and sets loading=false after apiFetch succeeds");
  it.todo("sets error='not-found' when apiFetch rejects with Error containing '404'");
  it.todo("sets error='forbidden' when apiFetch rejects with Error containing '403'");
  it.todo("sets error='network' when apiFetch rejects with any other Error");
  it.todo("does NOT call apiFetch and returns { recording: null, loading: false, error: null } when id is undefined");
  it.todo("re-fetches when id changes from one defined value to another");
});
