import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';

import { createCamerasColumns, type CameraRow } from '../cameras-columns';

/**
 * Phase 22 Plan 22-08 — Tags column + name-cell description tooltip.
 *
 * Covers:
 *   - D-14 Tags column with TagsCell renderer (up to 3 + overflow)
 *   - D-17 conditional name tooltip (only when description is non-empty)
 *   - D-18 tooltip width `max-w-[320px]` + `line-clamp-6`
 *   - filterFn: case-insensitive OR semantics for the Tags MultiSelect
 *
 * The createCamerasColumns factory is rendered via a small TanStack Table
 * harness so cells receive a real `row.original` shape. We don't render the
 * full DataTable wrapper; the single-column-at-a-time approach keeps the
 * surface area minimal and the assertions targeted.
 */

function cam(overrides: Partial<CameraRow> = {}): CameraRow {
  return {
    id: 'cam-a',
    name: 'Front Door',
    status: 'online',
    isRecording: false,
    maintenanceMode: false,
    streamUrl: 'rtsp://x',
    codecInfo: null,
    streamProfileId: null,
    streamProfile: null,
    location: null,
    description: null,
    tags: [],
    site: { id: 's', name: 'S', project: { id: 'p', name: 'P' } },
    createdAt: new Date('2026-04-26T00:00:00Z').toISOString(),
    ...overrides,
  };
}

const callbacks = {
  onEdit: vi.fn(),
  onViewStream: vi.fn(),
  onDelete: vi.fn(),
  onRecordToggle: vi.fn(),
  onEmbedCode: vi.fn(),
  onStreamToggle: vi.fn(),
  onMaintenanceToggle: vi.fn(),
};

function Harness({ data }: { data: CameraRow[] }) {
  const columns = createCamerasColumns(callbacks);
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });
  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} data-column={cell.column.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

describe('Phase 22: cameras-columns Tags column', () => {
  it('Tags column is registered with id "tags"', () => {
    const columns = createCamerasColumns(callbacks);
    const ids = columns.map((c) => c.id ?? (c as { accessorKey?: string }).accessorKey);
    expect(ids).toContain('tags');
  });

  it('Tags column appears AFTER the Stream Profile column (UI-SPEC ordering)', () => {
    const columns = createCamerasColumns(callbacks);
    const ids = columns.map((c) => c.id ?? (c as { accessorKey?: string }).accessorKey);
    const streamProfileIdx = ids.indexOf('streamProfile');
    const tagsIdx = ids.indexOf('tags');
    expect(streamProfileIdx).toBeGreaterThanOrEqual(0);
    expect(tagsIdx).toBeGreaterThan(streamProfileIdx);
  });

  it('Tags column renders 2 visible badges when row has tags ["lobby", "outdoor"]', () => {
    render(<Harness data={[cam({ tags: ['lobby', 'outdoor'] })]} />);
    const tagsCell = document.querySelector('td[data-column="tags"]');
    expect(tagsCell).not.toBeNull();
    expect(within(tagsCell as HTMLElement).getByText('lobby')).toBeInTheDocument();
    expect(within(tagsCell as HTMLElement).getByText('outdoor')).toBeInTheDocument();
  });

  it('Tags column cell is empty when row.tags is []', () => {
    render(<Harness data={[cam({ tags: [] })]} />);
    const tagsCell = document.querySelector('td[data-column="tags"]');
    expect(tagsCell).not.toBeNull();
    // No badges, no +N
    expect((tagsCell as HTMLElement).textContent).toBe('');
  });

  it('Tags column filterFn is case-insensitive OR (row.tags=["Lobby"] + value=["lobby"] → true)', () => {
    const columns = createCamerasColumns(callbacks);
    const tagsCol = columns.find(
      (c) => c.id === 'tags' || (c as { accessorKey?: string }).accessorKey === 'tags',
    );
    expect(tagsCol).toBeDefined();
    const filterFn = (tagsCol as { filterFn?: (row: unknown, id: string, value: string[]) => boolean })
      .filterFn;
    expect(typeof filterFn).toBe('function');
    const fakeRow = { getValue: (_id: string) => ['Lobby', 'Entrance'] };
    expect(filterFn!(fakeRow, 'tags', ['lobby'])).toBe(true);
    expect(filterFn!(fakeRow, 'tags', ['perimeter'])).toBe(false);
    // OR semantics: any match → true
    expect(filterFn!(fakeRow, 'tags', ['perimeter', 'entrance'])).toBe(true);
  });

  it('Tags column filterFn returns true when filter value is empty (no filter applied)', () => {
    const columns = createCamerasColumns(callbacks);
    const tagsCol = columns.find(
      (c) => c.id === 'tags' || (c as { accessorKey?: string }).accessorKey === 'tags',
    );
    const filterFn = (tagsCol as { filterFn?: (row: unknown, id: string, value: string[]) => boolean })
      .filterFn;
    const fakeRow = { getValue: () => ['Lobby'] };
    expect(filterFn!(fakeRow, 'tags', [])).toBe(true);
  });
});

describe('Phase 22: Camera-name description tooltip (D-17, D-18)', () => {
  it('hovering camera name shows tooltip with description text when description is set', async () => {
    render(
      <Harness
        data={[cam({ name: 'Lobby Cam', description: 'Inspection note: front-desk angle.' })]}
      />,
    );
    // The name cell wraps the span in a TooltipTrigger when description exists
    const nameSpan = screen.getByText('Lobby Cam');
    fireEvent.focus(nameSpan);
    await new Promise((r) => setTimeout(r, 50));
    const matches = await screen.findAllByText(/Inspection note: front-desk angle\./);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT mount a tooltip when description is null (no TooltipTrigger wrapping)', () => {
    render(<Harness data={[cam({ name: 'Bare Cam', description: null })]} />);
    // No tooltip-trigger / tooltip-content slots should exist for this row
    const triggers = document.querySelectorAll('[data-slot="tooltip-trigger"]');
    expect(triggers.length).toBe(0);
    expect(screen.getByText('Bare Cam')).toBeInTheDocument();
  });

  it('source file uses max-w-[320px] tooltip width (D-18)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'cameras-columns.tsx'),
      'utf8',
    );
    expect(src).toContain('max-w-[320px]');
  });

  it('source file uses line-clamp-6 (D-18)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'cameras-columns.tsx'),
      'utf8',
    );
    expect(src).toContain('line-clamp-6');
  });

  it('source file does NOT pass delayDuration prop (D-18 — Radix default delay)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'cameras-columns.tsx'),
      'utf8',
    );
    expect(src).not.toContain('delayDuration=');
  });
});
