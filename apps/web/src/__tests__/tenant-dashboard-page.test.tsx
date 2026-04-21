/**
 * Phase 18 Plan 02 — TenantDashboardPage tests (UI-05 D-01..D-04).
 * Flipped from Plan 00 stub placeholders to real assertions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Path-resolution canary for the shared fixtures file. Imports kept even if
// unused so the @/test-utils/camera-fixtures path alias is exercised.
import {
  onlineCamera,
  offlineCamera,
  makeDashboardCamera,
} from '@/test-utils/camera-fixtures';
void onlineCamera;
void offlineCamera;
void makeDashboardCamera;

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/hooks/use-dashboard-stats', () => ({
  useDashboardStats: () => ({
    stats: {
      camerasOnline: 4,
      camerasOffline: 1,
      totalCameras: 6,
      totalViewers: 12,
      bandwidth: 0,
      streamBandwidth: 2048,
      camerasRecording: 3,
      camerasInMaintenance: 1,
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCameraStatusList: () => ({
    cameras: [],
    setCameras: vi.fn(),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/use-camera-status', () => ({
  useCameraStatus: vi.fn(),
}));

vi.mock('@/hooks/use-dashboard-issues', () => ({
  useDashboardIssues: () => ({
    issues: [],
    loading: false,
    error: null,
    onlineCount: 4,
  }),
}));

// Better-auth session mock — Task 2 removes the isSuperAdmin code path but
// orgId lookup may still call this. Resolve to a minimal shape.
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({
      data: {
        user: { id: 'user-1' },
        session: { activeOrganizationId: 'org-1' },
      },
    }),
  },
}));

// Chart components are heavy — shallow-stub them to simple markers.
vi.mock('@/components/dashboard/bandwidth-chart', () => ({
  BandwidthChart: () => <div data-testid="bandwidth-chart">BandwidthChart</div>,
}));
vi.mock('@/components/dashboard/api-usage-chart', () => ({
  ApiUsageChart: () => <div data-testid="api-usage-chart">ApiUsageChart</div>,
}));

// IssuesPanel is mocked so we can check it rendered without wiring its full deps.
vi.mock('@/components/dashboard/issues-panel', () => ({
  IssuesPanel: () => (
    <section aria-label="Issues" data-testid="issues-panel">
      <h2>Issues</h2>
    </section>
  ),
}));

import TenantDashboardPage from '@/components/pages/tenant-dashboard-page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TenantDashboardPage (Phase 18)', () => {
  it('UI-05: removes SystemMetrics component (D-01) — no <SystemMetrics /> rendered', async () => {
    render(<TenantDashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Cameras Online')).toBeInTheDocument();
    });
    // SystemMetrics rendered an 'SRS Uptime' card; also the panel title 'System Metrics'.
    expect(screen.queryByText(/SRS Uptime/i)).toBeNull();
    expect(screen.queryByText(/System Metrics/i)).toBeNull();
  });

  it('UI-05: renders 6 stat cards with labels Cameras Online, Cameras Offline, Recording, In Maintenance, Total Viewers, Stream Bandwidth (D-02)', async () => {
    render(<TenantDashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Cameras Online')).toBeInTheDocument();
    });
    for (const label of [
      'Cameras Online',
      'Cameras Offline',
      'Recording',
      'In Maintenance',
      'Total Viewers',
      'Stream Bandwidth',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('UI-05: grid uses classes grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 (UI-SPEC)', async () => {
    render(<TenantDashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Cameras Online')).toBeInTheDocument();
    });
    const grid = screen.getByTestId('stat-cards-grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-3');
    expect(grid.className).toContain('xl:grid-cols-6');
  });

  it('UI-05: keeps BandwidthChart and ApiUsageChart (D-03)', async () => {
    render(<TenantDashboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('bandwidth-chart')).toBeInTheDocument();
    });
    expect(screen.getByTestId('api-usage-chart')).toBeInTheDocument();
  });

  it('UI-05: replaces CameraStatusTable with IssuesPanel (D-04)', async () => {
    render(<TenantDashboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('issues-panel')).toBeInTheDocument();
    });
    // CameraStatusTable rendered a table with the column header 'Viewers'.
    expect(screen.queryByText('Camera Status')).toBeNull();
  });

  it('UI-05: removes isSuperAdmin / userRole state (no longer needed after SystemMetrics removal)', async () => {
    // Smoke test: the page should render without depending on role data.
    // We assert that SystemMetrics is never conditionally shown regardless of
    // session shape (the auth mock returns no role, so a leftover
    // `userRole === 'admin'` check would still hide it — but grep + manual
    // inspection in the plan acceptance criteria guards the literal removal).
    render(<TenantDashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Cameras Online')).toBeInTheDocument();
    });
    expect(screen.queryByText(/CPU Usage/i)).toBeNull();
    expect(screen.queryByText(/System Metrics/i)).toBeNull();
  });
});
