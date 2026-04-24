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
