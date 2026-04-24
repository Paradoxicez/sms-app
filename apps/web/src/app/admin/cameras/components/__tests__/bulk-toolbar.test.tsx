import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { BulkToolbar } from '../bulk-toolbar';
import type { CameraRow } from '../cameras-columns';

/**
 * Test fixtures — minimal CameraRow shape (BulkToolbar only touches
 * status / isRecording / maintenanceMode, but TS requires the full shape).
 */
function cam(overrides: Partial<CameraRow> = {}): CameraRow {
  return {
    id: overrides.id ?? 'c1',
    name: overrides.name ?? 'Cam',
    status: overrides.status ?? 'offline',
    isRecording: overrides.isRecording ?? false,
    maintenanceMode: overrides.maintenanceMode ?? false,
    streamUrl: 'rtsp://x',
    codecInfo: null,
    streamProfileId: null,
    location: null,
    description: null,
    tags: [],
    site: { id: 's', name: 'S', project: { id: 'p', name: 'P' } },
    createdAt: new Date('2026-04-24T00:00:00Z').toISOString(),
    ...overrides,
  };
}

const allHandlers = () => ({
  onStartStream: vi.fn(),
  onStartRecording: vi.fn(),
  onEnterMaintenance: vi.fn(),
  onExitMaintenance: vi.fn(),
  onDelete: vi.fn(),
  onClear: vi.fn(),
});

describe('BulkToolbar — visibility (D-04)', () => {
  it('renders null when selected.length === 0', () => {
    const handlers = allHandlers();
    const { container } = render(
      <BulkToolbar selected={[]} processing={false} {...handlers} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders container with role="toolbar" aria-label="Bulk actions" when selected.length > 0', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={false} {...handlers} />);
    const toolbar = screen.getByRole('toolbar', { name: /bulk actions/i });
    expect(toolbar).toBeInTheDocument();
  });

  it('counter chip reads "1 selected" when 1 camera selected', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={false} {...handlers} />);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('counter chip reads "3 selected" when 3 cameras selected', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[cam({ id: 'a' }), cam({ id: 'b' }), cam({ id: 'c' })]}
        processing={false}
        {...handlers}
      />,
    );
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('container has sticky top-0 z-20 backdrop-blur classes', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={false} {...handlers} />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.className).toMatch(/sticky/);
    expect(toolbar.className).toMatch(/top-0/);
    expect(toolbar.className).toMatch(/z-20/);
    expect(toolbar.className).toMatch(/backdrop-blur/);
  });

  it('counter chip has aria-live="polite" for screen-reader announcements', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={false} {...handlers} />);
    const live = screen.getByText('1 selected');
    // The aria-live attribute lives on the counter span itself or an ancestor up to role="toolbar".
    let node: HTMLElement | null = live;
    let found = false;
    while (node && node.getAttribute('role') !== 'toolbar') {
      if (node.getAttribute('aria-live') === 'polite') {
        found = true;
        break;
      }
      node = node.parentElement;
    }
    expect(found).toBe(true);
  });
});

describe('BulkToolbar — button visibility rules (D-03)', () => {
  it('shows "Start Stream" button always when any selection', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={false} {...handlers} />);
    expect(screen.getByRole('button', { name: /start stream/i })).toBeInTheDocument();
  });

  it('shows "Start Recording" button always when any selection', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={false} {...handlers} />);
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument();
  });

  it('shows "Maintenance" button when selected.some(c => !c.maintenanceMode)', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[cam({ maintenanceMode: false })]}
        processing={false}
        {...handlers}
      />,
    );
    expect(screen.getByRole('button', { name: /^maintenance$/i })).toBeInTheDocument();
  });

  it('does NOT show "Maintenance" button when all selected are in maintenance', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[cam({ maintenanceMode: true })]}
        processing={false}
        {...handlers}
      />,
    );
    expect(screen.queryByRole('button', { name: /^maintenance$/i })).toBeNull();
  });

  it('shows "Exit Maintenance" button when selected.some(c => c.maintenanceMode)', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[cam({ maintenanceMode: true })]}
        processing={false}
        {...handlers}
      />,
    );
    expect(screen.getByRole('button', { name: /exit maintenance/i })).toBeInTheDocument();
  });

  it('does NOT show "Exit Maintenance" button when none are in maintenance', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[cam({ maintenanceMode: false })]}
        processing={false}
        {...handlers}
      />,
    );
    expect(screen.queryByRole('button', { name: /exit maintenance/i })).toBeNull();
  });

  it('shows BOTH Maintenance and Exit Maintenance when mixed-state selection', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[
          cam({ id: 'a', maintenanceMode: false }),
          cam({ id: 'b', maintenanceMode: true }),
        ]}
        processing={false}
        {...handlers}
      />,
    );
    expect(screen.getByRole('button', { name: /^maintenance$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exit maintenance/i })).toBeInTheDocument();
  });

  it('shows "Delete (N)" destructive button always', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[cam({ id: 'a' }), cam({ id: 'b' })]}
        processing={false}
        {...handlers}
      />,
    );
    expect(screen.getByRole('button', { name: /delete \(2\)/i })).toBeInTheDocument();
  });

  it('shows Clear × icon button always', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={false} {...handlers} />);
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
  });
});

describe('BulkToolbar — processing state', () => {
  it('processing=true disables all action buttons (Start Stream, Start Recording, Maintenance, Exit, Delete)', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[
          cam({ id: 'a', maintenanceMode: false }),
          cam({ id: 'b', maintenanceMode: true }),
        ]}
        processing={true}
        {...handlers}
      />,
    );
    expect(screen.getByRole('button', { name: /start stream/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /start recording/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^maintenance$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /exit maintenance/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete \(/i })).toBeDisabled();
  });

  it('processing=true shows "Processing… (N)" in counter chip with spinner (svg)', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[cam({ id: 'a' }), cam({ id: 'b' })]}
        processing={true}
        {...handlers}
      />,
    );
    expect(screen.getByText(/Processing… \(2\)/)).toBeInTheDocument();
    // Loader2 renders as an svg with class animate-spin.
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.querySelector('svg.animate-spin')).not.toBeNull();
  });

  it('processing=true leaves Clear × enabled', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={true} {...handlers} />);
    expect(screen.getByRole('button', { name: /clear selection/i })).not.toBeDisabled();
  });

  it('processing=false shows "N selected" without spinner', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={false} {...handlers} />);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.querySelector('svg.animate-spin')).toBeNull();
  });
});

describe('BulkToolbar — interactions', () => {
  it('clicking Start Stream invokes onStartStream once', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: /start stream/i }));
    expect(handlers.onStartStream).toHaveBeenCalledTimes(1);
  });

  it('clicking Start Recording invokes onStartRecording once', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }));
    expect(handlers.onStartRecording).toHaveBeenCalledTimes(1);
  });

  it('clicking Maintenance invokes onEnterMaintenance once', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[cam({ maintenanceMode: false })]}
        processing={false}
        {...handlers}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^maintenance$/i }));
    expect(handlers.onEnterMaintenance).toHaveBeenCalledTimes(1);
  });

  it('clicking Exit Maintenance invokes onExitMaintenance once', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[cam({ maintenanceMode: true })]}
        processing={false}
        {...handlers}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /exit maintenance/i }));
    expect(handlers.onExitMaintenance).toHaveBeenCalledTimes(1);
  });

  it('clicking Delete invokes onDelete once', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: /delete \(/i }));
    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
  });

  it('clicking Clear × invokes onClear once', () => {
    const handlers = allHandlers();
    render(<BulkToolbar selected={[cam()]} processing={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(handlers.onClear).toHaveBeenCalledTimes(1);
  });
});
