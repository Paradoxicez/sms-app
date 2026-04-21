/**
 * Phase 18 Wave 0 — Platform StorageForecastCard tests.
 * Every `it` maps to UI-05 / D-10 verifiable behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StorageForecastCard } from './storage-forecast-card';

const useStorageForecastMock = vi.fn();

vi.mock('@/hooks/use-platform-dashboard', () => ({
  usePlatformIssues: vi.fn(),
  useStorageForecast: (...args: unknown[]) => useStorageForecastMock(...args),
  useRecentAudit: vi.fn(),
}));

// Recharts uses ResizeObserver + SVG measurement under JSDOM — stub the
// ResponsiveContainer so the chart renders deterministically.
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

function makeForecast(daysUntilFull: number | null) {
  return {
    points: [
      { date: '2026-04-14', bytes: '1073741824' }, // 1 GB
      { date: '2026-04-15', bytes: '2147483648' }, // 2 GB
      { date: '2026-04-16', bytes: '3221225472' }, // 3 GB
    ],
    estimatedDaysUntilFull: daysUntilFull,
  };
}

describe('StorageForecastCard (Phase 18 — platform dashboard)', () => {
  beforeEach(() => {
    useStorageForecastMock.mockReset();
  });

  it('UI-05: toggle group switches between 7 days and 30 days, default 7 days (D-10)', async () => {
    const user = userEvent.setup();
    useStorageForecastMock.mockReturnValue({
      forecast: makeForecast(42),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<StorageForecastCard />);

    // Default range is 7d.
    expect(useStorageForecastMock).toHaveBeenCalledWith('7d');

    const thirtyDays = screen.getByRole('radio', { name: /30 days/i });
    await user.click(thirtyDays);

    // After clicking, the hook must have been re-invoked with '30d' at some
    // point (in addition to the initial 7d call).
    const args = useStorageForecastMock.mock.calls.map((c) => c[0]);
    expect(args).toContain('30d');
  });

  it('UI-05: caption shows "Estimated {N} days until full"', () => {
    useStorageForecastMock.mockReturnValue({
      forecast: makeForecast(42),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<StorageForecastCard />);

    expect(
      screen.getByText(/Estimated 42 days until full/i),
    ).toBeInTheDocument();
  });

  it('UI-05: warning styling when daysUntilFull <= 14', () => {
    useStorageForecastMock.mockReturnValue({
      forecast: makeForecast(7),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(<StorageForecastCard />);

    const caption = within(container).getByText(/Estimated 7 days until full/i);
    // The rendered element (or a nearby ancestor) must carry text-destructive.
    const el = caption.closest('[class*="text-destructive"]');
    expect(el).not.toBeNull();
  });
});
