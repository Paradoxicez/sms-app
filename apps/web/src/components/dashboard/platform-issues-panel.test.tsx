/**
 * Phase 18 Wave 0 — Platform (super-admin) IssuesPanel tests.
 * Every `it` maps to UI-05 / D-09 verifiable behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PlatformIssuesPanel } from './platform-issues-panel';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

const usePlatformIssuesMock = vi.fn();

vi.mock('@/hooks/use-platform-dashboard', () => ({
  usePlatformIssues: () => usePlatformIssuesMock(),
  useStorageForecast: vi.fn(),
  useRecentAudit: vi.fn(),
}));

describe('PlatformIssuesPanel (Phase 18 — platform dashboard)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    usePlatformIssuesMock.mockReset();
  });

  it('UI-05: empty state renders "Platform healthy" (D-09)', () => {
    usePlatformIssuesMock.mockReturnValue({
      issues: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PlatformIssuesPanel />);

    expect(screen.getByText('Platform healthy')).toBeInTheDocument();
    expect(screen.getByText('All subsystems operational.')).toBeInTheDocument();
  });

  it('UI-05: renders SRS down issue row with Investigate action', () => {
    usePlatformIssuesMock.mockReturnValue({
      issues: [
        {
          type: 'srs-down',
          severity: 'critical',
          label: 'SRS origin unreachable',
          meta: {},
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PlatformIssuesPanel />);

    expect(screen.getByText(/SRS origin unreachable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /investigate/i })).toBeInTheDocument();
  });

  it('UI-05: renders edge-disconnected row with View cluster action', async () => {
    const user = userEvent.setup();
    usePlatformIssuesMock.mockReturnValue({
      issues: [
        {
          type: 'edge-down',
          severity: 'warning',
          label: 'Edge node edge-sg-01 disconnected',
          meta: { nodeName: 'edge-sg-01', since: '3m ago' },
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PlatformIssuesPanel />);

    expect(
      screen.getByText(/Edge node edge-sg-01 disconnected/i),
    ).toBeInTheDocument();

    const btn = screen.getByRole('button', { name: /view cluster/i });
    await user.click(btn);

    expect(pushMock).toHaveBeenCalledWith('/admin/cluster');
  });
});
