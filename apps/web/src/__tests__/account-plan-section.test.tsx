// Phase 16-02 Task 5 — AccountPlanSection.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AccountPlanSection } from "@/components/account/account-plan-section";

const fetchMock = vi.fn();

function okResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

function goodPayload(overrides: Record<string, unknown> = {}) {
  return {
    package: {
      id: "pkg-1",
      name: "Pro",
      description: "Everything you need",
      maxCameras: 50,
      maxViewers: 100,
      maxBandwidthMbps: 500,
      maxStorageGb: 200,
      features: { recordings: true, webhooks: true, map: false },
    },
    usage: {
      cameras: 10,
      viewers: 3,
      bandwidthAvgMbpsMtd: 123.4,
      storageUsedBytes: "10000000000",
      apiCallsMtd: 42,
    },
    features: { recordings: true, webhooks: true, map: false },
    ...overrides,
  };
}

describe("AccountPlanSection", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("fetches /api/organizations/{orgId}/plan-usage with credentials:include on mount", async () => {
    fetchMock.mockResolvedValue(okResponse(goodPayload()));
    render(<AccountPlanSection orgId="org-1" />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/organizations/org-1/plan-usage",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it('renders plan name (H3) + description + "Usage" and "Features" subheadings', async () => {
    fetchMock.mockResolvedValue(okResponse(goodPayload()));
    render(<AccountPlanSection orgId="org-1" />);
    await waitFor(() => {
      expect(screen.getByText("Pro")).toBeInTheDocument();
    });
    expect(screen.getByText("Everything you need")).toBeInTheDocument();
    expect(screen.getByText("Usage")).toBeInTheDocument();
    expect(screen.getByText("Features")).toBeInTheDocument();
  });

  it("renders 4 UsageProgressRow (Cameras, Concurrent viewers, Bandwidth (MTD), Storage)", async () => {
    fetchMock.mockResolvedValue(okResponse(goodPayload()));
    render(<AccountPlanSection orgId="org-1" />);
    await waitFor(() => {
      expect(screen.getByText("Cameras")).toBeInTheDocument();
    });
    expect(screen.getByText("Concurrent viewers")).toBeInTheDocument();
    expect(screen.getByText("Bandwidth (MTD)")).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
  });

  it('Bandwidth (MTD) label displays avg Mbps formatted to 0 decimals with unit "Mbps"', async () => {
    fetchMock.mockResolvedValue(
      okResponse(
        goodPayload({
          usage: {
            cameras: 10,
            viewers: 3,
            bandwidthAvgMbpsMtd: 123.4,
            storageUsedBytes: "10000000000",
            apiCallsMtd: 42,
          },
        }),
      ),
    );
    render(<AccountPlanSection orgId="org-1" />);
    await waitFor(() => {
      expect(screen.getByText(/123\s*\/\s*500\s*Mbps/)).toBeInTheDocument();
    });
  });

  it('API calls row renders count in tabular-nums WITHOUT a progress bar, helper "Month-to-date"', async () => {
    fetchMock.mockResolvedValue(
      okResponse(
        goodPayload({
          usage: {
            cameras: 10,
            viewers: 3,
            bandwidthAvgMbpsMtd: 0,
            storageUsedBytes: "0",
            apiCallsMtd: 12345,
          },
        }),
      ),
    );
    const { container } = render(<AccountPlanSection orgId="org-1" />);
    await waitFor(() => {
      expect(screen.getByText("API calls")).toBeInTheDocument();
    });
    expect(screen.getByText("Month-to-date")).toBeInTheDocument();
    // Ensure the API calls row itself has no progressbar inside it
    const apiCallsLabel = screen.getByText("API calls");
    const apiCallsRow = apiCallsLabel.closest("div")?.parentElement;
    expect(apiCallsRow).not.toBeNull();
    expect(apiCallsRow!.querySelector('[role="progressbar"]')).toBeNull();
    // Count is formatted with tabular-nums
    const countEl = within(apiCallsRow!).getByText(/12,345|12345/);
    expect(countEl.className).toContain("tabular-nums");
    // Silence unused var
    void container;
  });

  it("Features list shows Recordings, Webhooks, Map view in stable order", async () => {
    fetchMock.mockResolvedValue(okResponse(goodPayload()));
    render(<AccountPlanSection orgId="org-1" />);
    await waitFor(() => {
      expect(screen.getByText("Recordings")).toBeInTheDocument();
    });
    const rec = screen.getByText("Recordings");
    const web = screen.getByText("Webhooks");
    const map = screen.getByText("Map view");
    // Recordings before Webhooks before Map view
    expect(rec.compareDocumentPosition(web) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(web.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Contact admin info text "Need more? Contact your system administrator to upgrade your plan." is present with NO button or link', async () => {
    fetchMock.mockResolvedValue(okResponse(goodPayload()));
    render(<AccountPlanSection orgId="org-1" />);
    await waitFor(() => {
      expect(
        screen.getByText(/Need more\? Contact your system administrator/),
      ).toBeInTheDocument();
    });
    const contact = screen.getByText(/Need more\? Contact your system administrator/);
    const container = contact.closest("p");
    expect(container?.querySelector("button, a")).toBeNull();
  });

  it('when package is null, renders "No plan assigned" heading + body', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        package: null,
        usage: {
          cameras: 0,
          viewers: 0,
          bandwidthAvgMbpsMtd: 0,
          storageUsedBytes: "0",
          apiCallsMtd: 0,
        },
        features: {},
      }),
    );
    render(<AccountPlanSection orgId="org-1" />);
    await waitFor(() => {
      expect(screen.getByText("No plan assigned")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Contact your administrator to assign a plan."),
    ).toBeInTheDocument();
  });

  it("on fetch error, renders inline AlertTriangle + \"Couldn't load plan details.\" + Retry link that re-fetches", async () => {
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    render(<AccountPlanSection orgId="org-1" />);
    await waitFor(() => {
      expect(screen.getByText("Couldn't load plan details.")).toBeInTheDocument();
    });
    // Retry button
    fetchMock.mockResolvedValueOnce(okResponse(goodPayload()));
    await userEvent.click(screen.getByRole("button", { name: /Retry/i }));
    await waitFor(() => {
      expect(screen.getByText("Pro")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("while loading, renders 1 title skeleton + 4 progress skeletons + 3 feature skeletons", async () => {
    // Never resolve so we observe loading state.
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(<AccountPlanSection orgId="org-1" />);
    // Allow effect to run
    await waitFor(() => {
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(8);
    });
  });
});
