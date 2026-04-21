/**
 * Phase 18 Plan 02 — Tenant IssuesPanel tests (UI-05 / D-04).
 * Flipped from Plan 00 `it.todo` stubs to real assertions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

import {
  onlineCamera,
  offlineCamera,
  degradedCamera,
  reconnectingCamera,
  maintenanceCamera,
  makeDashboardCamera,
} from '@/test-utils/camera-fixtures';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const useDashboardIssuesMock = vi.fn();
vi.mock('@/hooks/use-dashboard-issues', () => ({
  useDashboardIssues: () => useDashboardIssuesMock(),
}));

import { IssuesPanel } from './issues-panel';

beforeEach(() => {
  mockPush.mockReset();
  useDashboardIssuesMock.mockReset();
});

describe('IssuesPanel (Phase 18 — tenant dashboard)', () => {
  it('UI-05: empty state renders CheckCircle2 + "All cameras healthy" (D-04 reward signal)', () => {
    useDashboardIssuesMock.mockReturnValue({
      issues: [],
      loading: false,
      error: null,
      onlineCount: 4,
    });

    const { container } = render(<IssuesPanel />);

    expect(screen.getByText('All cameras healthy')).toBeInTheDocument();
    const svgs = container.querySelectorAll('svg');
    const hasPrimary = Array.from(svgs).some((s) =>
      s.getAttribute('class')?.includes('text-primary'),
    );
    expect(hasPrimary).toBe(true);
  });

  it('UI-05: sorts issues severity offline → degraded → reconnecting → recording-failed → maintenance (D-04)', () => {
    // recording-failed deferred per Phase 18 RESEARCH OQ-01
    useDashboardIssuesMock.mockReturnValue({
      issues: [offlineCamera, maintenanceCamera, degradedCamera, reconnectingCamera],
      loading: false,
      error: null,
      onlineCount: 1,
    });

    const { container } = render(<IssuesPanel />);

    const rows = container.querySelectorAll('[data-testid="issue-row"]');
    expect(rows).toHaveLength(4);
    expect(rows[0].getAttribute('data-camera-id')).toBe(offlineCamera.id);
    expect(rows[1].getAttribute('data-camera-id')).toBe(degradedCamera.id);
    expect(rows[2].getAttribute('data-camera-id')).toBe(reconnectingCamera.id);
    expect(rows[3].getAttribute('data-camera-id')).toBe(maintenanceCamera.id);
  });

  it('UI-05: offline row action Investigate navigates to /app/cameras/{id}', () => {
    useDashboardIssuesMock.mockReturnValue({
      issues: [offlineCamera],
      loading: false,
      error: null,
      onlineCount: 0,
    });

    const { container } = render(<IssuesPanel />);

    const row = container.querySelector('[data-testid="issue-row"]')!;
    const button = within(row as HTMLElement).getByRole('button', {
      name: /investigate/i,
    });
    fireEvent.click(button);

    expect(mockPush).toHaveBeenCalledWith(`/app/cameras/${offlineCamera.id}`);
  });

  it('UI-05: maintenance row shows "Maintenance · by {user} · {time}"', () => {
    useDashboardIssuesMock.mockReturnValue({
      issues: [maintenanceCamera],
      loading: false,
      error: null,
      onlineCount: 0,
    });

    const { container } = render(<IssuesPanel />);

    const row = container.querySelector('[data-testid="issue-row"]')!;
    const meta = (row as HTMLElement).textContent ?? '';
    expect(meta).toContain('Maintenance');
    expect(meta).toContain('by Jane Doe');
    expect(meta).toMatch(/ago|in\s\d/);
  });

  it('UI-05: empty-state body shows "{N} cameras online, 0 issues."', () => {
    useDashboardIssuesMock.mockReturnValue({
      issues: [],
      loading: false,
      error: null,
      onlineCount: 7,
    });

    render(<IssuesPanel />);
    void onlineCamera;
    void makeDashboardCamera;

    expect(screen.getByText('7 cameras online, 0 issues.')).toBeInTheDocument();
  });
});
