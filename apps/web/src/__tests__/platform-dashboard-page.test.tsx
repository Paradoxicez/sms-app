/**
 * Phase 18 Wave 0 — Platform (super-admin) dashboard page test stubs.
 * Every `it.todo` maps to a UI-05 verifiable behavior from
 * .planning/phases/18-dashboard-map-polish/18-RESEARCH.md §Validation Architecture.
 * Plan 03 (platform dashboard shell) will flip these to real `it` with assertions.
 */
import { describe, it } from 'vitest';

// Path-resolution canary for the shared fixtures file.
import { onlineCamera, makeDashboardCamera } from '@/test-utils/camera-fixtures';
void onlineCamera;
void makeDashboardCamera;

describe('PlatformDashboardPage (Phase 18)', () => {
  it.todo('UI-05: renders 7 stat cards including Active Streams and Recordings Active (D-05)');
  it.todo('UI-05: grid uses classes grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 (UI-SPEC)');
  it.todo('UI-05: renders PlatformIssuesPanel, ClusterNodesPanel, StorageForecastCard, OrgHealthDataTable, RecentAuditHighlights in vertical stack order (D-07)');
  it.todo('UI-05: keeps 4 SystemMetrics cards (D-06)');
  it.todo('UI-05: replaces Organization Summary Table with OrgHealthDataTable (D-12)');
});
