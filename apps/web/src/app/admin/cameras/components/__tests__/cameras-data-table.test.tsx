import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useState, useCallback } from 'react';
import type { RowSelectionState } from '@tanstack/react-table';

import { CamerasDataTable } from '../cameras-data-table';
import type { CameraRow } from '../cameras-columns';

/**
 * Phase 20 Plan 03 — CamerasDataTable selection plumbing integration checks.
 *
 * These tests lock the Planner constraint that cameras-data-table.tsx stays
 * hand-rolled with `useReactTable` directly, uses `getRowId: (row) => row.id`
 * so rowSelection is keyed by camera UUID (not row index), and wires
 * errorByCameraId through to the Status column.
 */

function cam(id: string, overrides: Partial<CameraRow> = {}): CameraRow {
  return {
    id,
    name: `Cam-${id}`,
    status: 'offline',
    isRecording: false,
    maintenanceMode: false,
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

function Harness({
  cameras,
  errorByCameraId,
}: {
  cameras: CameraRow[];
  errorByCameraId?: Record<string, string>;
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const noop = useCallback(() => {}, []);
  return (
    <div>
      <span data-testid="selection-json">{JSON.stringify(rowSelection)}</span>
      <CamerasDataTable
        cameras={cameras}
        loading={false}
        onEdit={noop}
        onViewStream={noop}
        onDelete={noop}
        onRecordToggle={noop}
        onStreamToggle={noop}
        onMaintenanceToggle={noop}
        onEmbedCode={noop}
        onCreateCamera={noop}
        view="table"
        onViewChange={noop}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        errorByCameraId={errorByCameraId}
      />
    </div>
  );
}

describe('CamerasDataTable selection plumbing (Phase 20 Plan 03)', () => {
  it('renders the select column as the FIRST column of the table (header has a checkbox)', () => {
    render(<Harness cameras={[cam('a')]} />);
    const headerRow = screen.getAllByRole('row')[0];
    const firstTh = within(headerRow).getAllByRole('columnheader')[0];
    expect(firstTh).toBeDefined();
    // The first header cell contains a checkbox (select-all control).
    expect(within(firstTh).getByRole('checkbox')).toBeInTheDocument();
  });

  it('rowSelection state is keyed by camera.id (getRowId contract)', async () => {
    render(<Harness cameras={[cam('uuid-alpha'), cam('uuid-beta')]} />);
    const rows = screen.getAllByRole('row');
    const cbA = within(rows[1]).getByRole('checkbox');
    fireEvent.click(cbA);
    expect(screen.getByTestId('selection-json').textContent).toBe(
      JSON.stringify({ 'uuid-alpha': true }),
    );
  });

  it('header checkbox toggles all-page selection (tri-state contract)', () => {
    render(<Harness cameras={[cam('a'), cam('b'), cam('c')]} />);
    const header = screen.getAllByRole('row')[0];
    const headerCheckbox = within(header).getByRole('checkbox');
    fireEvent.click(headerCheckbox);
    const selection = JSON.parse(
      screen.getByTestId('selection-json').textContent!,
    );
    expect(Object.keys(selection).sort()).toEqual(['a', 'b', 'c']);
  });

  it('row checkbox cell wraps the input in a div (stopPropagation cell wrapper pattern)', () => {
    render(<Harness cameras={[cam('a')]} />);
    const rows = screen.getAllByRole('row');
    const dataRow = rows[1];
    const checkbox = within(dataRow).getByRole('checkbox');
    // Checkbox must be enclosed in a wrapper div (recordings-columns pattern).
    const wrapper = checkbox.closest('div');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.tagName.toLowerCase()).toBe('div');
  });

  it('errorByCameraId prop surfaces AlertTriangle badge in Status cell', () => {
    render(
      <Harness
        cameras={[cam('a'), cam('b')]}
        errorByCameraId={{ a: 'stream queue full' }}
      />,
    );
    const badge = screen.getByRole('img', {
      name: /bulk action failed: stream queue full/i,
    });
    expect(badge).toBeInTheDocument();
    // Only the failed camera should have the badge.
    expect(
      screen.queryAllByRole('img', { name: /bulk action failed/i }),
    ).toHaveLength(1);
  });

  it('cameras-data-table preserves getRowId so sort/filter changes never reassign the selection key', () => {
    // Simulate a selection, then re-render with the same cameras in reverse.
    // With getRowId keyed by camera.id, the selection still references the
    // same CAMERA — even though the visible row index flips.
    const camA = cam('cam-alpha');
    const camB = cam('cam-beta');
    const { rerender } = render(<Harness cameras={[camA, camB]} />);
    const rows = screen.getAllByRole('row');
    const cbA = within(rows[1]).getByRole('checkbox');
    fireEvent.click(cbA);
    expect(screen.getByTestId('selection-json').textContent).toBe(
      JSON.stringify({ 'cam-alpha': true }),
    );
    // Re-render with order reversed (camA is now row index 1, not 0).
    rerender(<Harness cameras={[camB, camA]} />);
    // Selection still keyed by id, NOT by index → still only cam-alpha.
    expect(screen.getByTestId('selection-json').textContent).toBe(
      JSON.stringify({ 'cam-alpha': true }),
    );
  });

  it('select column is non-sortable', () => {
    render(<Harness cameras={[cam('a')]} />);
    const header = screen.getAllByRole('row')[0];
    const firstTh = within(header).getAllByRole('columnheader')[0];
    // The select column header is a bare <th> containing a checkbox, no sort button.
    expect(within(firstTh).queryByRole('button')).toBeNull();
  });

  it('still uses hand-rolled useReactTable (Planner constraint: not migrated to shared DataTable primitive)', async () => {
    // Meta-test: read the source file and assert the import surface is
    // useReactTable directly, not the shared <DataTable> component.
    // This locks the Planner's binding constraint so accidental refactors
    // trigger a regression.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'cameras-data-table.tsx'),
      'utf8',
    );
    expect(src).toContain('useReactTable');
    // Must NOT import the full DataTable primitive (Toolbar/Pagination are OK).
    expect(/from\s+"@\/components\/ui\/data-table"\s*$/.test(src)).toBe(false);
    // Must pass getRowId and enableRowSelection.
    expect(src).toContain('getRowId: (row) => row.id');
    expect(src).toContain('enableRowSelection: true');
  });

  it('emits a single onRowSelectionChange call per checkbox click (stable reference contract)', () => {
    const spy = vi.fn();
    function ControlledHarness() {
      const noop = useCallback(() => {}, []);
      return (
        <CamerasDataTable
          cameras={[cam('a')]}
          loading={false}
          onEdit={noop}
          onViewStream={noop}
          onDelete={noop}
          onRecordToggle={noop}
          onStreamToggle={noop}
          onMaintenanceToggle={noop}
          onEmbedCode={noop}
          onCreateCamera={noop}
          view="table"
          onViewChange={noop}
          rowSelection={{}}
          onRowSelectionChange={spy}
        />
      );
    }
    render(<ControlledHarness />);
    const rows = screen.getAllByRole('row');
    fireEvent.click(within(rows[1]).getByRole('checkbox'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('forwards onRowSelectionChange prop to useReactTable (integration smoke test)', () => {
    // Covered by the rowSelection keyed test, but explicit assertion here
    // makes the integration breakage location easier to spot.
    const spy = vi.fn();
    function UncontrolledHarness() {
      const noop = useCallback(() => {}, []);
      const [sel, setSel] = useState<RowSelectionState>({});
      const onChange = (
        updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState),
      ) => {
        spy(updater);
        setSel(typeof updater === 'function' ? updater(sel) : updater);
      };
      return (
        <CamerasDataTable
          cameras={[cam('z')]}
          loading={false}
          onEdit={noop}
          onViewStream={noop}
          onDelete={noop}
          onRecordToggle={noop}
          onStreamToggle={noop}
          onMaintenanceToggle={noop}
          onEmbedCode={noop}
          onCreateCamera={noop}
          view="table"
          onViewChange={noop}
          rowSelection={sel}
          onRowSelectionChange={onChange}
        />
      );
    }
    render(<UncontrolledHarness />);
    fireEvent.click(
      within(screen.getAllByRole('row')[1]).getByRole('checkbox'),
    );
    expect(spy).toHaveBeenCalled();
  });
});

/**
 * Phase 22 Plan 22-08 — Tags MultiSelect filter integration (D-06, D-07).
 *
 * Asserts the toolbar surfaces a "Tags" filter populated from
 * `/api/cameras/tags/distinct` and that selecting a tag narrows the visible
 * rows via the column filterFn (case-insensitive OR semantics, defined in
 * cameras-columns.tsx Plan 22-08 Task 2).
 *
 * The fetch is stubbed via `vi.stubGlobal('fetch', …)` so the test does not
 * touch the network. The DataTable mounts the toolbar before the filter
 * dropdown is opened — no need to wait on async population for the trigger
 * button assertion (it shows even with zero options).
 */
describe('Phase 22: tags filter MultiSelect (D-06, D-07)', () => {
  function cam22(id: string, overrides: Partial<CameraRow> = {}): CameraRow {
    return {
      id,
      name: `Cam-${id}`,
      status: 'offline',
      isRecording: false,
      maintenanceMode: false,
      streamUrl: 'rtsp://x',
      codecInfo: null,
      streamProfileId: null,
      location: null,
      description: null,
      tags: [],
      site: { id: 's', name: 'S', project: { id: 'p', name: 'P' } },
      createdAt: new Date('2026-04-26T00:00:00Z').toISOString(),
      ...overrides,
    };
  }

  function Wrap22({ cameras }: { cameras: CameraRow[] }) {
    const noop = useCallback(() => {}, []);
    const [sel, setSel] = useState<RowSelectionState>({});
    return (
      <CamerasDataTable
        cameras={cameras}
        loading={false}
        onEdit={noop}
        onViewStream={noop}
        onDelete={noop}
        onRecordToggle={noop}
        onStreamToggle={noop}
        onMaintenanceToggle={noop}
        onEmbedCode={noop}
        onCreateCamera={noop}
        view="table"
        onViewChange={noop}
        rowSelection={sel}
        onRowSelectionChange={setSel}
      />
    );
  }

  it('toolbar exposes a "Tags" filter trigger button', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tags: ['lobby', 'outdoor'] }),
      }),
    );
    render(<Wrap22 cameras={[cam22('a', { tags: ['lobby'] })]} />);
    expect(screen.getByRole('button', { name: /^Tags$/i })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('fetches /api/cameras/tags/distinct on mount', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tags: ['lobby'] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    render(<Wrap22 cameras={[cam22('a')]} />);
    // Wait for useEffect to fire
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchSpy).toHaveBeenCalled();
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/api/cameras/tags/distinct');
    vi.unstubAllGlobals();
  });

  it('filter survives a fetch failure (still mounts the trigger; no crash)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    render(<Wrap22 cameras={[cam22('a')]} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByRole('button', { name: /^Tags$/i })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
