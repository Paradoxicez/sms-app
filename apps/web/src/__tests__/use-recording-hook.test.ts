/**
 * VALIDATION: Phase 17 — useRecording hook contract (REC-01 supporting / T-17-V7)
 * GREEN tests for the useRecording hook contract added in plan 17-02.
 *
 * Mocks apiFetch via vi.mock("@/lib/api"). The hook lives at @/hooks/use-recordings.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";
import { useRecording } from "@/hooks/use-recordings";

const baseRecording = {
  id: "rec-1",
  cameraId: "cam-1",
  status: "complete" as const,
  startedAt: "2026-04-18T08:00:00.000Z",
  stoppedAt: "2026-04-18T09:00:00.000Z",
  totalSize: 500,
  totalDuration: 3600,
  camera: {
    id: "cam-1",
    name: "Front Door",
    site: { id: "s", name: "HQ", project: { id: "p", name: "Office" } },
  },
  _count: { segments: 30 },
};

describe("useRecording hook (Phase 17 — contract)", () => {
  beforeEach(() => {
    (apiFetch as any).mockReset();
  });

  it("returns { recording: null, loading: true, error: null } on initial mount with a defined id", () => {
    (apiFetch as any).mockImplementation(() => new Promise(() => { /* never resolves */ }));
    const { result } = renderHook(() => useRecording("rec-1"));
    expect(result.current.recording).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(apiFetch).toHaveBeenCalledWith("/api/recordings/rec-1");
  });

  it("resolves recording and sets loading=false after apiFetch succeeds", async () => {
    (apiFetch as any).mockResolvedValue(baseRecording);
    const { result } = renderHook(() => useRecording("rec-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.recording).toEqual(baseRecording);
    expect(result.current.error).toBeNull();
  });

  it("sets error='not-found' when apiFetch rejects with Error containing '404'", async () => {
    (apiFetch as any).mockRejectedValue(new Error("API request failed: 404"));
    const { result } = renderHook(() => useRecording("rec-x"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("not-found");
    expect(result.current.recording).toBeNull();
  });

  it("sets error='forbidden' when apiFetch rejects with Error containing '403'", async () => {
    (apiFetch as any).mockRejectedValue(new Error("API request failed: 403"));
    const { result } = renderHook(() => useRecording("rec-y"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("forbidden");
  });

  it("sets error='network' when apiFetch rejects with any other Error", async () => {
    (apiFetch as any).mockRejectedValue(new Error("Network failure"));
    const { result } = renderHook(() => useRecording("rec-z"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("network");
  });

  it("does NOT call apiFetch and returns { recording: null, loading: false, error: null } when id is undefined", () => {
    const { result } = renderHook(() => useRecording(undefined));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(result.current.recording).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("re-fetches when id changes from one defined value to another", async () => {
    (apiFetch as any).mockResolvedValueOnce({ ...baseRecording, id: "rec-1" });
    const { result, rerender } = renderHook(({ id }) => useRecording(id), {
      initialProps: { id: "rec-1" as string | undefined },
    });
    await waitFor(() => expect(result.current.recording?.id).toBe("rec-1"));

    (apiFetch as any).mockResolvedValueOnce({ ...baseRecording, id: "rec-2" });
    rerender({ id: "rec-2" });
    await waitFor(() => expect(result.current.recording?.id).toBe("rec-2"));
    expect(apiFetch).toHaveBeenCalledWith("/api/recordings/rec-1");
    expect(apiFetch).toHaveBeenCalledWith("/api/recordings/rec-2");
  });
});
