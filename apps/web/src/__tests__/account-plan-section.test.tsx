// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-02 Task T5.
import { describe, it } from "vitest";

describe("AccountPlanSection", () => {
  it.todo("fetches /api/organizations/{orgId}/plan-usage with credentials:include on mount");
  it.todo('renders plan name (H3) + description + "Usage" and "Features" subheadings');
  it.todo("renders 4 UsageProgressRow (Cameras, Concurrent viewers, Bandwidth (MTD), Storage)");
  it.todo('Bandwidth (MTD) label displays avg Mbps formatted to 0 decimals with unit "Mbps"');
  it.todo('API calls row renders count in tabular-nums WITHOUT a progress bar, helper "Month-to-date"');
  it.todo("Features list shows Recordings, Webhooks, Map view in stable order");
  it.todo('Contact admin info text "Need more? Contact your system administrator to upgrade your plan." is present with NO button or link');
  it.todo('when package is null, renders "No plan assigned" heading + body');
  it.todo("on fetch error, renders inline AlertTriangle + \"Couldn't load plan details.\" + Retry link that re-fetches");
  it.todo("while loading, renders 1 title skeleton + 4 progress skeletons + 3 feature skeletons");
});
