/**
 * Phase 18 Plan 06 — OrgHealthDataTable tests (D-12 behavior).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OrgHealthDataTable } from './org-health-data-table';
import type { OrgHealth } from './org-health-columns';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

const useOrgHealthOverviewMock = vi.fn();

vi.mock('@/hooks/use-platform-dashboard', () => ({
  useOrgHealthOverview: () => useOrgHealthOverviewMock(),
}));

const ORGS: OrgHealth[] = [
  {
    orgId: 'beta',
    orgName: 'Beta',
    orgSlug: 'beta',
    packageName: 'Free',
    camerasUsed: 1,
    camerasLimit: 5,
    cameraUsagePct: 20,
    storageUsedBytes: '0',
    storageLimitGb: 10,
    storageUsagePct: 10,
    bandwidthTodayBytes: '0',
    issuesCount: 0,
  },
  {
    orgId: 'alpha',
    orgName: 'Alpha',
    orgSlug: 'alpha',
    packageName: 'Pro',
    camerasUsed: 18,
    camerasLimit: 20,
    cameraUsagePct: 90,
    storageUsedBytes: '0',
    storageLimitGb: 100,
    storageUsagePct: 5,
    bandwidthTodayBytes: '0',
    issuesCount: 2,
  },
];

describe('OrgHealthDataTable (Phase 18 — platform dashboard)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useOrgHealthOverviewMock.mockReset();
    useOrgHealthOverviewMock.mockReturnValue({
      orgs: ORGS,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('UI-05: default sort by usage percent desc (D-12)', () => {
    render(<OrgHealthDataTable />);

    // Alpha (max 90/5 -> 90) should appear before Beta (max 20/10 -> 20).
    const rows = screen.getAllByRole('row');
    // rows[0] = header row. rows[1] and rows[2] are data rows.
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(within(rows[1]).getByText('Alpha')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Beta')).toBeInTheDocument();
  });

  it('UI-05: row click navigates to /admin/organizations?highlight={id}', async () => {
    const user = userEvent.setup();
    render(<OrgHealthDataTable />);

    const alphaCell = screen.getByText('Alpha');
    const row = alphaCell.closest('tr');
    expect(row).not.toBeNull();
    await user.click(row as HTMLElement);

    expect(pushMock).toHaveBeenCalledWith('/admin/organizations?highlight=alpha');
  });

  it('UI-05: cameras cell shows "{used} / {limit}" with Progress bar', () => {
    render(<OrgHealthDataTable />);

    // Alpha: 18 / 20 with a progress bar.
    expect(screen.getByText(/18 \/ 20/)).toBeInTheDocument();
    // Beta: 1 / 5.
    expect(screen.getByText(/1 \/ 5/)).toBeInTheDocument();

    // At least one Progress primitive is rendered.
    const progressBars = document.querySelectorAll('[data-slot="progress"]');
    expect(progressBars.length).toBeGreaterThanOrEqual(2);
  });

  it('UI-05: View action navigates to /admin/organizations?highlight={id}; Manage menu removed (no detail route yet)', async () => {
    const user = userEvent.setup();
    render(<OrgHealthDataTable />);

    const triggers = screen.getAllByRole('button', { name: /open menu/i });
    expect(triggers.length).toBeGreaterThanOrEqual(2);
    await user.click(triggers[0]);

    const view = await screen.findByRole('menuitem', { name: /^view$/i });
    await user.click(view);
    expect(pushMock).toHaveBeenCalledWith('/admin/organizations?highlight=alpha');

    // Manage menu item should not be present — /admin/organizations/{id}/settings does not exist.
    expect(screen.queryByRole('menuitem', { name: /manage/i })).toBeNull();
  });

  it('UI-05: status cell renders destructive badge when issues > 0, Healthy outline badge when 0', () => {
    render(<OrgHealthDataTable />);

    // Alpha has 2 issues.
    expect(screen.getByText(/2 issues/i)).toBeInTheDocument();
    // Beta has 0 issues.
    expect(screen.getByText(/Healthy/i)).toBeInTheDocument();
  });
});
