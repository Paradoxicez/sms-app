/**
 * Phase 18 Plan 06 — Platform (super-admin) dashboard page tests.
 * Every `it` maps to a UI-05 verifiable behavior from
 * .planning/phases/18-dashboard-map-polish/18-RESEARCH.md §Validation Architecture.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

// Path-resolution canary for the shared fixtures file.
import { onlineCamera, makeDashboardCamera } from '@/test-utils/camera-fixtures';
void onlineCamera;
void makeDashboardCamera;

import PlatformDashboardPage from '@/components/pages/platform-dashboard-page';

// --- Mocks ----------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

// apiFetch is still used directly inside the page (for stats + metrics),
// so stub it to return loader-satisfying shapes per endpoint.
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn((path: string) => {
    if (path.startsWith('/api/admin/dashboard/stats')) {
      return Promise.resolve({
        totalOrgs: 4,
        totalCameras: 20,
        camerasOnline: 18,
        camerasOffline: 2,
        totalViewers: 50,
        streamBandwidth: 12345,
      });
    }
    if (path.startsWith('/api/admin/dashboard/system-metrics')) {
      return Promise.resolve({
        cpuPercent: 45.2,
        memPercent: 60.1,
        load1m: 1.12,
        srsUptime: 86400,
      });
    }
    return Promise.resolve({});
  }),
}));

// Hooks from Plan 05 + Plan 06 — mock to return deterministic fixtures.
vi.mock('@/hooks/use-platform-dashboard', () => ({
  usePlatformIssues: () => ({
    issues: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useStorageForecast: () => ({
    forecast: { points: [], estimatedDaysUntilFull: null },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRecentAudit: () => ({
    entries: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useActiveStreamsCount: () => ({
    count: 7,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRecordingsActive: () => ({
    count: 3,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useOrgHealthOverview: () => ({
    orgs: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-cluster-nodes', () => ({
  useClusterNodes: () => ({
    nodes: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Recharts ResponsiveContainer has no layout engine in JSDOM; stub it so
// StorageForecastCard renders through to its caption even without the chart.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 800, height: 256 }}>
        {children}
      </div>
    ),
  };
});

// --- Tests ----------------------------------------------------------------

describe('PlatformDashboardPage (Phase 18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UI-05: renders 7 stat cards including Active Streams and Recordings Active (D-05)', async () => {
    render(<PlatformDashboardPage />);

    // Wait for stats to load (apiFetch is async).
    await screen.findByText(/^Organizations$/);

    expect(screen.getByText(/^Organizations$/)).toBeInTheDocument();
    expect(screen.getByText(/Total Cameras/i)).toBeInTheDocument();
    expect(screen.getByText(/Cameras Online/i)).toBeInTheDocument();
    expect(screen.getByText(/Cameras Offline/i)).toBeInTheDocument();
    expect(screen.getByText(/Stream Bandwidth/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Streams/i)).toBeInTheDocument();
    expect(screen.getByText(/Recordings Active/i)).toBeInTheDocument();
  });

  it('UI-05: grid uses classes grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 (UI-SPEC)', async () => {
    const { container } = render(<PlatformDashboardPage />);

    await screen.findByText(/^Organizations$/);

    const statGrid = container.querySelector('[data-testid="stat-grid"]');
    expect(statGrid).not.toBeNull();
    expect(statGrid?.className).toContain('grid-cols-1');
    expect(statGrid?.className).toContain('sm:grid-cols-2');
    expect(statGrid?.className).toContain('lg:grid-cols-4');
    expect(statGrid?.className).toContain('xl:grid-cols-7');
  });

  it('UI-05: renders PlatformIssuesPanel, ClusterNodesPanel, StorageForecastCard, OrgHealthDataTable, RecentAuditHighlights in vertical stack order (D-07)', async () => {
    render(<PlatformDashboardPage />);

    await screen.findByText(/^Organizations$/);

    // Each widget renders a CardTitle with a recognisable label.
    const platformIssues = screen.getByText(/Platform Issues/i);
    const clusterNodes = screen.getByText(/Cluster & Edge Nodes/i);
    const storageForecast = screen.getByText(/Storage Forecast/i);
    const orgHealth = screen.getByText(/Organization Health/i);
    const recentActivity = screen.getByText(/Recent Activity/i);

    // Assert DOM document order: platformIssues < clusterNodes < storageForecast < orgHealth < recentActivity.
    const follows = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

    expect(follows(platformIssues, clusterNodes)).toBe(true);
    expect(follows(clusterNodes, storageForecast)).toBe(true);
    expect(follows(storageForecast, orgHealth)).toBe(true);
    expect(follows(orgHealth, recentActivity)).toBe(true);
  });

  it('UI-05: keeps 4 SystemMetrics cards (D-06)', async () => {
    render(<PlatformDashboardPage />);

    await screen.findByText(/CPU Usage/i);

    expect(screen.getByText(/CPU Usage/i)).toBeInTheDocument();
    expect(screen.getByText(/Memory Usage/i)).toBeInTheDocument();
    expect(screen.getByText(/System Load/i)).toBeInTheDocument();
    expect(screen.getByText(/SRS Uptime/i)).toBeInTheDocument();
  });

  it('UI-05: replaces Organization Summary Table with OrgHealthDataTable (D-12)', async () => {
    render(<PlatformDashboardPage />);

    await screen.findByText(/^Organizations$/);

    // Old "Organization Summary" title is gone.
    expect(screen.queryByText(/Organization Summary/i)).toBeNull();

    // New "Organization Health" title is present.
    expect(screen.getByText(/Organization Health/i)).toBeInTheDocument();

    // Legacy raw-table columns ("Online" / "Offline") must not appear as
    // column headers (the DataTable renders different columns).
    expect(
      within(document.body).queryByRole('columnheader', { name: /^Online$/ }),
    ).toBeNull();
    expect(
      within(document.body).queryByRole('columnheader', { name: /^Offline$/ }),
    ).toBeNull();
  });
});
