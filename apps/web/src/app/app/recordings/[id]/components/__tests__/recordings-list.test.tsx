/**
 * Quick task 260426-ox9 — RecordingsList row-actions contract tests.
 *
 * Locks the contract from the per-camera Recordings detail-page table:
 *  - kebab menu exposes Download + Delete
 *  - Download opens GET /api/recordings/:id/download in a new tab + toast
 *  - Delete opens AlertDialog with specific copy (time range + size)
 *  - Confirming Delete calls deleteRecording, awaits refetch, then onDeleted
 *  - Kebab clicks do NOT trigger onRowClick (stopPropagation contract)
 *  - Loading + empty-state delegate to DataTable's built-in handling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { format } from 'date-fns';

vi.mock('sonner', () => {
  const fn: any = vi.fn();
  fn.error = vi.fn();
  return { toast: fn };
});

vi.mock('@/hooks/use-recordings', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-recordings')>(
    '@/hooks/use-recordings',
  );
  return {
    ...actual,
    deleteRecording: vi.fn().mockResolvedValue(undefined),
  };
});

import { toast } from 'sonner';
import { deleteRecording, type Recording } from '@/hooks/use-recordings';
import { RecordingsList } from '../recordings-list';

const mockedDelete = vi.mocked(deleteRecording);
// `toast` is mocked as a callable + .error vi.fn — cast so we can use .mockClear/.mock.
const mockedToast = toast as unknown as ReturnType<typeof vi.fn> & {
  error: ReturnType<typeof vi.fn>;
};

function rec(overrides: Partial<Recording> = {}): Recording {
  return {
    id: 'rec-1',
    cameraId: 'cam-1',
    status: 'complete',
    startedAt: '2026-04-26T08:00:00.000Z',
    stoppedAt: '2026-04-26T09:00:00.000Z',
    totalSize: 100 * 1024 * 1024, // 100 MB
    totalDuration: 3600,
    ...overrides,
  };
}

const baseDate = new Date('2026-04-26T00:00:00.000Z');

function renderList(props: Partial<React.ComponentProps<typeof RecordingsList>> = {}) {
  const onRowClick = vi.fn();
  const onDeleted = vi.fn();
  const refetch = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <RecordingsList
      recordings={props.recordings ?? [rec()]}
      loading={props.loading ?? false}
      currentRecordingId={props.currentRecordingId ?? 'rec-1'}
      selectedDate={props.selectedDate ?? baseDate}
      onRowClick={props.onRowClick ?? onRowClick}
      onDeleted={props.onDeleted ?? onDeleted}
      refetch={props.refetch ?? refetch}
    />,
  );
  return { ...utils, onRowClick, onDeleted, refetch };
}

function openKebab(rowEl: HTMLElement) {
  const trigger = within(rowEl).getByRole('button', { name: /open menu/i });
  fireEvent.click(trigger);
  return trigger;
}

describe('RecordingsList (quick task 260426-ox9)', () => {
  beforeEach(() => {
    mockedDelete.mockClear();
    mockedDelete.mockResolvedValue(undefined);
    mockedToast.mockClear();
    mockedToast.error.mockClear();
  });

  it('renders columns in the correct order including the kebab actions column', () => {
    renderList({
      recordings: [rec({ id: 'rec-1' }), rec({ id: 'rec-2', startedAt: '2026-04-26T10:00:00.000Z', stoppedAt: '2026-04-26T11:00:00.000Z' })],
    });

    expect(screen.getByRole('columnheader', { name: 'Time Range' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Duration' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Size' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();

    // Each data row exposes a kebab "Open menu" button (sr-only label from DataTableRowActions).
    const rows = screen.getAllByRole('row');
    // rows[0] is header, rows[1..] are data rows
    const dataRows = rows.slice(1);
    expect(dataRows).toHaveLength(2);
    dataRows.forEach((r) => {
      expect(within(r).getByRole('button', { name: /open menu/i })).toBeInTheDocument();
    });
  });

  it('now-playing icon renders only on the current row', () => {
    const r1 = rec({ id: 'rec-1' });
    const r2 = rec({
      id: 'rec-2',
      startedAt: '2026-04-26T10:00:00.000Z',
      stoppedAt: '2026-04-26T11:00:00.000Z',
    });
    renderList({ currentRecordingId: 'rec-1', recordings: [r1, r2] });

    const nowPlayingIcons = screen.getAllByLabelText('Now playing');
    expect(nowPlayingIcons).toHaveLength(1);

    // Build the rendered Time Range string from the same date-fns format the
    // component uses (timezone-independent across CI + local).
    const r1Range = `${format(new Date(r1.startedAt), 'HH:mm')} - ${format(new Date(r1.stoppedAt!), 'HH:mm')}`;
    const rec1Row = screen.getByText(r1Range).closest('tr');
    expect(rec1Row).not.toBeNull();
    expect(within(rec1Row as HTMLElement).getByLabelText('Now playing')).toBeInTheDocument();
  });

  it('Download action opens the download URL in a new tab and shows a toast', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderList({ recordings: [rec({ id: 'rec-1' })] });

    const dataRow = screen.getAllByRole('row')[1];
    openKebab(dataRow);

    const downloadItem = await screen.findByRole('menuitem', { name: /download/i });
    fireEvent.click(downloadItem);

    expect(openSpy).toHaveBeenCalledWith('/api/recordings/rec-1/download', '_blank');
    expect(mockedToast).toHaveBeenCalledWith('Download started');

    openSpy.mockRestore();
  });

  it('Delete action opens AlertDialog with specific copy (time range + size)', async () => {
    const r = rec({ id: 'rec-1' });
    renderList({ recordings: [r] });

    const dataRow = screen.getAllByRole('row')[1];
    openKebab(dataRow);

    const deleteItem = await screen.findByRole('menuitem', { name: /^delete$/i });
    fireEvent.click(deleteItem);

    // Title — exact copy
    expect(await screen.findByText('Delete recording?')).toBeInTheDocument();

    // Body contains the time range and size. Compute the rendered HH:mm with
    // the same formatter the component uses so the assertion holds across
    // timezones (CI typically runs UTC; local devs run their own).
    const description = await screen.findByText(/will be permanently removed/i);
    const expectedStart = format(new Date(r.startedAt), 'HH:mm');
    const expectedEnd = format(new Date(r.stoppedAt!), 'HH:mm');
    expect(description.textContent).toContain(expectedStart);
    expect(description.textContent).toContain(expectedEnd);
    expect(description.textContent).toMatch(/100/); // 100 MB
  });

  it('Confirming Delete calls deleteRecording, refetch, and onDeleted with the deleted id', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    renderList({ recordings: [rec({ id: 'rec-1' })], refetch, onDeleted });

    const dataRow = screen.getAllByRole('row')[1];
    openKebab(dataRow);

    const deleteItem = await screen.findByRole('menuitem', { name: /^delete$/i });
    fireEvent.click(deleteItem);

    const confirmBtn = await screen.findByRole('button', { name: /^delete recording$/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('rec-1'));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('rec-1'));
  });

  it('Kebab clicks do NOT trigger onRowClick (stopPropagation contract)', () => {
    const onRowClick = vi.fn();
    renderList({ recordings: [rec({ id: 'rec-1' })], onRowClick });

    const dataRow = screen.getAllByRole('row')[1];
    const trigger = within(dataRow).getByRole('button', { name: /open menu/i });
    fireEvent.click(trigger);

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('Loading state delegates to DataTable skeleton rows (no empty-state copy)', () => {
    renderList({ loading: true, recordings: [] });

    expect(
      screen.queryByText('No recordings on this date'),
    ).not.toBeInTheDocument();

    // DataTable renders 5 skeleton rows while loading. Header row + 5 skeleton rows = 6.
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThanOrEqual(6);
  });

  it('Empty state shows the expected copy when not loading and recordings is empty', () => {
    renderList({ loading: false, recordings: [] });
    expect(screen.getByText('No recordings on this date')).toBeInTheDocument();
  });
});
