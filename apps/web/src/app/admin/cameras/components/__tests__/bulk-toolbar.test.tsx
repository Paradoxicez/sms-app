import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  onStopStream: vi.fn(),
  onStopRecording: vi.fn(),
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

/**
 * Phase 22 Plan 22-11 — bulk Add tag / Remove tag toolbar buttons (D-11, D-12, D-13).
 *
 * Reference:
 * - 22-UI-SPEC.md §"Bulk toolbar — Add / Remove tag" (lines 172–195)
 * - 22-UI-SPEC.md §"Surface-by-Surface Contract Summary" line 362 (insertion point)
 *
 * Wiring contract:
 *   - 'Add tag' visible whenever selection ≥ 1.
 *   - 'Remove tag' visible only when ≥1 selected camera has ≥1 tag.
 *   - selectionTagUnion is computed by the toolbar from selected.tags arrays
 *     (case-insensitive dedup, first-seen casing wins).
 *   - On submit-success the popovers call onTagBulkSuccess (parent refetches +
 *     clears selection).
 *   - No <AlertDialog> is mounted by the toolbar (D-13 non-destructive).
 */
describe('Phase 22: tag bulk actions', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    // Default fetch stub for distinct-tags + bulk POST.
    // @ts-expect-error — assignment to global.fetch is fine in tests.
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/cameras/tags/distinct')) {
        return Promise.resolve(
          new Response(JSON.stringify({ tags: ['lobby', 'outdoor'] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (typeof url === 'string' && url.includes('/cameras/bulk/tags')) {
        const body = init?.body
          ? JSON.parse(typeof init.body === 'string' ? init.body : '{}')
          : { cameraIds: [] };
        return Promise.resolve(
          new Response(
            JSON.stringify({ updatedCount: body.cameraIds?.length ?? 0 }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      }
      return Promise.resolve(new Response('null', { status: 404 }));
    });
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('Test 1: shows "Add tag" button whenever selection is non-empty', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[
          cam({ id: 'a', tags: [] }),
          cam({ id: 'b', tags: [] }),
        ]}
        processing={false}
        onTagBulkSuccess={vi.fn()}
        {...handlers}
      />,
    );
    expect(
      screen.getByRole('button', { name: /^add tag$/i }),
    ).toBeInTheDocument();
  });

  it('Test 2: hides "Remove tag" button when no selected camera has any tag', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[
          cam({ id: 'a', tags: [] }),
          cam({ id: 'b', tags: [] }),
        ]}
        processing={false}
        onTagBulkSuccess={vi.fn()}
        {...handlers}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /^remove tag$/i }),
    ).toBeNull();
  });

  it('Test 3: shows "Remove tag" button when ≥1 selected camera has ≥1 tag', () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[
          cam({ id: 'a', tags: ['x'] }),
          cam({ id: 'b', tags: [] }),
        ]}
        processing={false}
        onTagBulkSuccess={vi.fn()}
        {...handlers}
      />,
    );
    expect(
      screen.getByRole('button', { name: /^remove tag$/i }),
    ).toBeInTheDocument();
  });

  it('Test 4: selectionTagUnion is the case-insensitive union (first-seen casing wins, sorted)', async () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[
          cam({ id: 'a', tags: ['a', 'b'] }),
          cam({ id: 'b', tags: ['B', 'c'] }),
        ]}
        processing={false}
        onTagBulkSuccess={vi.fn()}
        {...handlers}
      />,
    );
    // Open the Remove tag popover — its TagInputCombobox suggestions are the
    // selectionTagUnion. The combobox renders suggestion <button role="option">
    // rows when its input has focus.
    fireEvent.click(screen.getByRole('button', { name: /^remove tag$/i }));
    // Find the input inside the popover's TagInputCombobox group and focus it
    // so the dropdown opens with all suggestions visible.
    const group = await screen.findByRole('group', { name: /remove tag/i });
    const input = group.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.focus(input);
    const options = await screen.findAllByRole('option');
    const optionLabels = options.map((o) => o.textContent?.trim());
    // First-seen casing: 'B' from camera b is dropped because 'b' from camera a
    // came first. Sorted alphabetically (case-insensitive) by tag-input-combobox.
    // Suggestions are passed in already-sorted by the toolbar.
    expect(optionLabels).toContain('a');
    expect(optionLabels).toContain('b');
    expect(optionLabels).toContain('c');
    // 'B' MUST NOT appear — case-insensitive dedup picks first-seen casing.
    expect(optionLabels).not.toContain('B');
  });

  it('Test 5: onTagBulkSuccess fires after a successful Add tag submit', async () => {
    const handlers = allHandlers();
    const onTagBulkSuccess = vi.fn();
    render(
      <BulkToolbar
        selected={[cam({ id: 'a', tags: [] }), cam({ id: 'b', tags: [] })]}
        processing={false}
        onTagBulkSuccess={onTagBulkSuccess}
        {...handlers}
      />,
    );
    // Open Add tag popover
    fireEvent.click(screen.getByRole('button', { name: /^add tag$/i }));
    const group = await screen.findByRole('group', { name: /add tag/i });
    const input = group.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    // Type a tag and Enter to commit it as the single-tag value
    fireEvent.change(input, { target: { value: 'newtag' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Click the Add tag CTA inside the popover. There are two buttons matching
    // /^add tag$/i — the trigger and the CTA. The CTA is the second one (inside
    // the popover content). Use getAllByRole + last() to pick it.
    const addTagButtons = await screen.findAllByRole('button', {
      name: /^add tag$/i,
    });
    const cta = addTagButtons[addTagButtons.length - 1];
    fireEvent.click(cta);
    await waitFor(() => {
      expect(onTagBulkSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('Test 6: no AlertDialog is mounted by the toolbar before/after Add or Remove (D-13)', async () => {
    const handlers = allHandlers();
    render(
      <BulkToolbar
        selected={[cam({ id: 'a', tags: ['existing'] })]}
        processing={false}
        onTagBulkSuccess={vi.fn()}
        {...handlers}
      />,
    );
    // Before any clicks — no alertdialog
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // Click Add tag trigger — no alertdialog (only the Popover content opens)
    fireEvent.click(screen.getByRole('button', { name: /^add tag$/i }));
    await screen.findByRole('group', { name: /add tag/i });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
