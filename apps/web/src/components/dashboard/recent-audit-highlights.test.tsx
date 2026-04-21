/**
 * Phase 18 Wave 0 — Platform RecentAuditHighlights tests.
 * Every `it` maps to UI-05 / D-11 verifiable behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RecentAuditHighlights } from './recent-audit-highlights';

const useRecentAuditMock = vi.fn();

vi.mock('@/hooks/use-platform-dashboard', () => ({
  usePlatformIssues: vi.fn(),
  useStorageForecast: vi.fn(),
  useRecentAudit: (...args: unknown[]) => useRecentAuditMock(...args),
}));

function makeEntries(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `audit-${i + 1}`,
    action: 'create',
    resource: 'organization',
    actorName: `User ${i + 1}`,
    orgName: `Org ${i + 1}`,
    createdAt: new Date(Date.now() - (i + 1) * 60 * 1000).toISOString(),
  }));
}

describe('RecentAuditHighlights (Phase 18 — platform dashboard)', () => {
  beforeEach(() => {
    useRecentAuditMock.mockReset();
  });

  it('UI-05: renders up to 7 entries (D-11)', () => {
    useRecentAuditMock.mockReturnValue({
      entries: makeEntries(7),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<RecentAuditHighlights />);

    // Seven actor names, one per row.
    for (let i = 1; i <= 7; i += 1) {
      expect(
        screen.getByText(new RegExp(`User ${i}\\b`, 'i')),
      ).toBeInTheDocument();
    }
    // Hook must have been called with the limit of 7.
    expect(useRecentAuditMock).toHaveBeenCalledWith(7);
  });

  it('UI-05: footer link "View full audit log" navigates to /admin/audit', () => {
    useRecentAuditMock.mockReturnValue({
      entries: makeEntries(1),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<RecentAuditHighlights />);

    const link = screen.getByRole('link', { name: /view full audit log/i });
    expect(link).toHaveAttribute('href', '/admin/audit');
  });

  it('UI-05: entry format "{actor} {verb} {target} · {time}"', () => {
    useRecentAuditMock.mockReturnValue({
      entries: [
        {
          id: 'a1',
          action: 'create',
          resource: 'organization',
          actorName: 'Jane Doe',
          orgName: 'Acme',
          createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<RecentAuditHighlights />);

    expect(
      screen.getByText(/Jane Doe created organization Acme/i),
    ).toBeInTheDocument();
    // "5 minutes ago" (date-fns formatDistanceToNowStrict addSuffix).
    expect(screen.getByText(/5 minutes ago/i)).toBeInTheDocument();
  });

  it('UI-05: empty state renders "No recent platform activity."', () => {
    useRecentAuditMock.mockReturnValue({
      entries: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<RecentAuditHighlights />);

    expect(
      screen.getByText('No recent platform activity.'),
    ).toBeInTheDocument();
  });
});
