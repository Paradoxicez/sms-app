import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import {
  BulkImportDialog,
  validateRow,
  annotateDuplicates,
  type CameraRow,
} from '../bulk-import-dialog';

/**
 * Phase 19.1 Plan 06 — Task 2 (D-12, D-13, D-14)
 *
 * Push-aware helpers:
 *   - validateRow: push rows must leave streamUrl empty; pull rows unchanged
 *   - annotateDuplicates: push rows are never flagged (server generates URLs;
 *     within-file duplicate detection only applies to pull rows)
 *   - <PushUrlsDownloadButton>: renders in the result panel when push rows are
 *     imported, synthesizes CSV client-side (no server round-trip).
 */

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api';

const apiFetchMock = vi.mocked(apiFetch);

function makeRow(overrides: Partial<CameraRow> = {}): CameraRow {
  return {
    name: '',
    streamUrl: '',
    tags: '',
    description: '',
    latitude: '',
    longitude: '',
    errors: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiFetchMock.mockReset();
});

describe('bulk-import validateRow push-aware (D-12, D-13)', () => {
  it('accepts pull row with valid rtsp URL', () => {
    const errors = validateRow(makeRow({ name: 'cam', streamUrl: 'rtsp://h/a' }));
    expect(errors.streamUrl).toBeUndefined();
  });

  it('accepts push row with empty streamUrl', () => {
    const errors = validateRow(
      makeRow({ name: 'cam', streamUrl: '', ingestMode: 'push' }),
    );
    expect(errors.streamUrl).toBeUndefined();
  });

  it('rejects push row with non-empty streamUrl — uses UI-SPEC verbatim copy', () => {
    const errors = validateRow(
      makeRow({ name: 'cam', streamUrl: 'rtmp://x/y', ingestMode: 'push' }),
    );
    expect(errors.streamUrl).toBe(
      'Push rows must leave streamUrl empty — a URL will be generated.',
    );
  });

  it('rejects pull row with missing streamUrl', () => {
    const errors = validateRow(
      makeRow({ name: 'cam', streamUrl: '', ingestMode: 'pull' }),
    );
    expect(errors.streamUrl).toBe('Stream URL is required');
  });

  it('defaults to pull semantics when ingestMode absent (backward compat)', () => {
    const errors = validateRow(makeRow({ name: 'cam', streamUrl: '' }));
    // No ingestMode means pull — streamUrl required.
    expect(errors.streamUrl).toBe('Stream URL is required');
  });
});

describe('bulk-import annotateDuplicates push-aware (D-12)', () => {
  it('push rows are never flagged as duplicates (server generates URLs)', () => {
    const rows: CameraRow[] = [
      makeRow({ name: 'a', streamUrl: '', ingestMode: 'push' }),
      makeRow({ name: 'b', streamUrl: '', ingestMode: 'push' }),
    ];
    const annotated = annotateDuplicates(rows);
    expect(annotated[0].duplicate).toBe(false);
    expect(annotated[1].duplicate).toBe(false);
    expect(annotated[1].duplicateReason).toBeUndefined();
  });

  it('pull-row dedup still works alongside push rows in the same file', () => {
    const rows: CameraRow[] = [
      makeRow({ name: 'a', streamUrl: '', ingestMode: 'push' }),
      makeRow({ name: 'b', streamUrl: '', ingestMode: 'push' }),
      makeRow({ name: 'c', streamUrl: 'rtsp://h/x', ingestMode: 'pull' }),
      makeRow({ name: 'd', streamUrl: 'rtsp://h/x', ingestMode: 'pull' }),
    ];
    const annotated = annotateDuplicates(rows);
    // push rows untouched
    expect(annotated[0].duplicate).toBe(false);
    expect(annotated[1].duplicate).toBe(false);
    // pull duplicate annotated as usual
    expect(annotated[2].duplicate).toBe(false);
    expect(annotated[3].duplicate).toBe(true);
    expect(annotated[3].duplicateReason).toBe('within-file');
  });
});

describe('bulk-import CSV header parsing — ingestMode column (D-12)', () => {
  it('parses ingestMode column case-insensitive and populates push rows', async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/projects') return [{ id: 'p1', name: 'Proj' }];
      if (path.includes('/sites')) return [{ id: 's1', name: 'Site' }];
      return undefined as never;
    });

    render(
      <BulkImportDialog
        open
        onOpenChange={() => {}}
        onSuccess={() => {}}
      />,
    );

    // Mixed CSV: one pull row (with URL) + one push row (empty URL + ingestMode=PUSH)
    const csv = `name,streamUrl,ingestMode
pull-cam,rtsp://h/s,pull
push-cam,,PUSH`;
    const file = new File([csv], 'mixed.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      // Both rows should be valid (push-cam with empty streamUrl is valid per D-13)
      expect(screen.getByText('2 valid')).toBeInTheDocument();
    });
    // And zero errors (the empty URL on push row must not trigger "Stream URL is required")
    expect(screen.queryByText(/errors/)).toBeNull();
  });
});

describe('bulk-import PushUrlsDownloadButton (D-14)', () => {
  async function loadMixedCsv(csv: string) {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/projects') return [{ id: 'p1', name: 'Proj' }];
      if (path.includes('/sites')) return [{ id: 's1', name: 'Site' }];
      return undefined as never;
    });

    render(
      <BulkImportDialog
        open
        onOpenChange={() => {}}
        onSuccess={() => {}}
      />,
    );

    const file = new File([csv], 'mixed.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm Import/i })).toBeInTheDocument();
    });
  }

  it('renders Download push URLs (CSV) button after successful push import', async () => {
    const csv = `name,streamUrl,ingestMode
push-cam-1,,push
push-cam-2,,push`;
    await loadMixedCsv(csv);

    apiFetchMock.mockImplementationOnce(async () => ({
      imported: 2,
      skipped: 0,
      errors: [],
      cameras: [
        { id: 'c1', name: 'push-cam-1', ingestMode: 'push', streamUrl: 'rtmp://h/push/K1' },
        { id: 'c2', name: 'push-cam-2', ingestMode: 'push', streamUrl: 'rtmp://h/push/K2' },
      ],
    }));

    const confirm = screen.getByRole('button', { name: /Confirm Import/i });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.click(confirm);

    await waitFor(() => {
      // base-ui Tooltip renders a focus-guard span with role=button alongside
      // the real button, so query by text and assert at least one element.
      expect(
        screen.getAllByText(/Download push URLs \(CSV\)/i).length,
      ).toBeGreaterThan(0);
    });
  });

  it('does NOT render download button when response has no push rows', async () => {
    const csv = `name,streamUrl,ingestMode
pull-cam,rtsp://h/s,pull`;
    await loadMixedCsv(csv);

    apiFetchMock.mockImplementationOnce(async () => ({
      imported: 1,
      skipped: 0,
      errors: [],
      cameras: [
        { id: 'c1', name: 'pull-cam', ingestMode: 'pull', streamUrl: 'rtsp://h/s' },
      ],
    }));

    const confirm = screen.getByRole('button', { name: /Confirm Import/i });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.click(confirm);

    // After import completes the button should never appear.
    await waitFor(() => {
      expect(screen.queryByText(/Download push URLs/i)).toBeNull();
    });
  });

  it('Download button click triggers client-side CSV synthesis via Blob', async () => {
    const csv = `name,streamUrl,ingestMode
push-cam,,push`;
    await loadMixedCsv(csv);

    apiFetchMock.mockImplementationOnce(async () => ({
      imported: 1,
      skipped: 0,
      errors: [],
      cameras: [
        { id: 'c1', name: 'push-cam', ingestMode: 'push', streamUrl: 'rtmp://h/push/K1' },
      ],
    }));

    // Stub createObjectURL / revokeObjectURL (jsdom does not implement them for Blob)
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    const confirm = screen.getByRole('button', { name: /Confirm Import/i });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.click(confirm);

    // Find the real download <button> (base-ui Tooltip adds a focus-guard span
    // with role=button; narrow to actual HTMLButtonElement).
    const downloadEl = await waitFor(() => {
      const matches = screen.getAllByText(/Download push URLs \(CSV\)/i);
      const button = matches
        .map((el) => el.closest('button'))
        .find((el): el is HTMLButtonElement => el !== null);
      if (!button) throw new Error('Download button not found');
      return button;
    });
    fireEvent.click(downloadEl);

    expect(createObjectURL).toHaveBeenCalled();
    // Button flips to "Downloaded" label for 3s
    await waitFor(() => {
      expect(screen.getAllByText(/^Downloaded$/i).length).toBeGreaterThan(0);
    });
  });
});
