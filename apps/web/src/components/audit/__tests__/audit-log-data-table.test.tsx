/**
 * Regression coverage for the View Stream Activity-tab bug.
 * (.planning/debug/resolved/view-stream-activity-tab-no-events.md, Bug #2)
 *
 * Pre-fix the component composed the request as `${apiUrl}?${params}`. When
 * the caller passed an apiUrl that already contained a query string
 * (e.g. `/api/audit-log?resource=camera&resourceId=<id>`), the result had two
 * `?` separators and the caller-supplied params were corrupted.
 *
 * These tests assert that the merged URL handed to `apiFetch`:
 *   - contains a SINGLE `?` separator
 *   - preserves the caller-supplied preset params untouched
 *   - merges the runtime params (page, pageSize, …) alongside them
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

// Mock the api fetch so we can spy on the URL the component generates.
const apiFetchMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (path: string, opts?: unknown) => apiFetchMock(path, opts),
}));

import { AuditLogDataTable } from "../audit-log-data-table";

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ items: [], totalCount: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AuditLogDataTable URL composition (regression)", () => {
  it("merges preset query params from apiUrl with runtime params (single `?` separator)", async () => {
    render(
      <AuditLogDataTable apiUrl="/api/audit-log?resource=camera&resourceId=cam-123" />,
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());

    const calledWith = apiFetchMock.mock.calls[0][0] as string;

    // Single `?` separator (the pre-fix bug produced two)
    const questionMarks = (calledWith.match(/\?/g) ?? []).length;
    expect(questionMarks).toBe(1);

    // Parse and assert the preset params survived intact
    const search = new URLSearchParams(calledWith.split("?")[1]);
    expect(search.get("resource")).toBe("camera");
    expect(search.get("resourceId")).toBe("cam-123");

    // Runtime defaults are also present
    expect(search.get("page")).toBe("1");
    expect(search.get("pageSize")).toBe("25");
  });

  it("works with an apiUrl that has no preset query string", async () => {
    render(<AuditLogDataTable apiUrl="/api/audit-log" />);

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());

    const calledWith = apiFetchMock.mock.calls[0][0] as string;

    expect((calledWith.match(/\?/g) ?? []).length).toBe(1);
    const search = new URLSearchParams(calledWith.split("?")[1]);
    expect(search.get("page")).toBe("1");
    expect(search.get("pageSize")).toBe("25");
    expect(search.get("resourceId")).toBeNull();
  });

  it("preserves preset params when default apiUrl prop is used", async () => {
    // No apiUrl prop → defaults to `/api/audit-log`
    render(<AuditLogDataTable />);

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());

    const calledWith = apiFetchMock.mock.calls[0][0] as string;
    expect(calledWith.startsWith("/api/audit-log?")).toBe(true);
  });
});
