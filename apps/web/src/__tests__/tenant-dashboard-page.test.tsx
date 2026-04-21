/**
 * Phase 18 Wave 0 — Tenant dashboard page test stubs.
 * Every `it.todo` maps to a UI-05 verifiable behavior from
 * .planning/phases/18-dashboard-map-polish/18-RESEARCH.md §Validation Architecture.
 * Plan 02 (tenant dashboard shell) will flip these to real `it` with assertions.
 */
import { describe, it } from 'vitest';

// Path-resolution canary for the shared fixtures file. Imported but unused on
// purpose — fails at compile time if @/test-utils/camera-fixtures breaks.
import { onlineCamera, offlineCamera, makeDashboardCamera } from '@/test-utils/camera-fixtures';
void onlineCamera;
void offlineCamera;
void makeDashboardCamera;

describe('TenantDashboardPage (Phase 18)', () => {
  it.todo('UI-05: removes SystemMetrics component (D-01) — no <SystemMetrics /> rendered');
  it.todo('UI-05: renders 6 stat cards with labels Cameras Online, Cameras Offline, Recording, In Maintenance, Total Viewers, Stream Bandwidth (D-02)');
  it.todo('UI-05: grid uses classes grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 (UI-SPEC)');
  it.todo('UI-05: keeps BandwidthChart and ApiUsageChart (D-03)');
  it.todo('UI-05: replaces CameraStatusTable with IssuesPanel (D-04)');
  it.todo('UI-05: removes isSuperAdmin / userRole state (no longer needed after SystemMetrics removal)');
});
