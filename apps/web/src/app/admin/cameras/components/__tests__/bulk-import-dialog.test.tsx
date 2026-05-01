import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';

import { BulkImportDialog } from '../bulk-import-dialog';
import { validateRow, annotateDuplicates, type CameraRow } from '../bulk-import-dialog';

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

// ---------------------------------------------------------------------------
// Group 1: validateRow + protocol allowlist (D-12, D-16)
// ---------------------------------------------------------------------------

describe('BulkImportDialog validateRow + protocol allowlist — Phase 19 (D-12, D-16)', () => {
  it('accepts rtsp:// URL as valid', () => {
    const errors = validateRow(makeRow({ name: 'Cam', streamUrl: 'rtsp://host/s' }));
    expect(errors.streamUrl).toBeUndefined();
  });

  it('accepts rtmp:// URL as valid', () => {
    const errors = validateRow(makeRow({ name: 'Cam', streamUrl: 'rtmp://host/s' }));
    expect(errors.streamUrl).toBeUndefined();
  });

  it('accepts rtmps:// URL as valid', () => {
    const errors = validateRow(makeRow({ name: 'Cam', streamUrl: 'rtmps://host/s' }));
    expect(errors.streamUrl).toBeUndefined();
  });

  it('accepts srt:// URL as valid', () => {
    const errors = validateRow(makeRow({ name: 'Cam', streamUrl: 'srt://host:9000' }));
    expect(errors.streamUrl).toBeUndefined();
  });

  it('rejects http:// with error "Must be rtsp://, rtmps://, rtmp://, or srt://"', () => {
    const errors = validateRow(makeRow({ name: 'Cam', streamUrl: 'http://host/s' }));
    expect(errors.streamUrl).toBe('Must be rtsp://, rtmps://, rtmp://, or srt://');
  });

  it('rejects empty streamUrl with error "Stream URL is required"', () => {
    const errors = validateRow(makeRow({ name: 'Cam', streamUrl: '' }));
    expect(errors.streamUrl).toBe('Stream URL is required');
  });

  it('rejects URL with empty hostname via new URL() host check', () => {
    const errors = validateRow(makeRow({ name: 'Cam', streamUrl: 'rtsp:///' }));
    expect(errors.streamUrl).toBe('Invalid URL — check host and path');
  });
});

// ---------------------------------------------------------------------------
// Group 2: annotateDuplicates (D-08, D-09, D-10a, D-16)
// ---------------------------------------------------------------------------

describe('BulkImportDialog duplicate detection — Phase 19 (D-08, D-09, D-10a)', () => {
  it('annotateDuplicates flags within-file duplicates with duplicate: true, duplicateReason: "within-file"', () => {
    const rows = [
      makeRow({ name: 'A', streamUrl: 'rtsp://h/s' }),
      makeRow({ name: 'B', streamUrl: 'rtsp://h/s' }),
    ];
    const annotated = annotateDuplicates(rows);
    expect(annotated[0].duplicate).toBe(false);
    expect(annotated[1].duplicate).toBe(true);
    expect(annotated[1].duplicateReason).toBe('within-file');
  });

  it('first occurrence of a URL is NOT flagged (only subsequent rows)', () => {
    const rows = [
      makeRow({ name: 'A', streamUrl: 'rtsp://h/s' }),
      makeRow({ name: 'B', streamUrl: 'rtsp://h/s' }),
      makeRow({ name: 'C', streamUrl: 'rtsp://h/s' }),
    ];
    const annotated = annotateDuplicates(rows);
    expect(annotated[0].duplicate).toBe(false);
    expect(annotated[1].duplicate).toBe(true);
    expect(annotated[2].duplicate).toBe(true);
  });

  it('URL comparison is exact string match — trailing slash treated as different', () => {
    const rows = [
      makeRow({ name: 'A', streamUrl: 'rtsp://h/s' }),
      makeRow({ name: 'B', streamUrl: 'rtsp://h/s/' }),
    ];
    const annotated = annotateDuplicates(rows);
    expect(annotated[0].duplicate).toBe(false);
    expect(annotated[1].duplicate).toBe(false);
  });

  it('footer counter shows "N valid" + "M duplicate" + "K errors" when duplicates present', async () => {
    render(
      <BulkImportDialog
        open
        onOpenChange={() => {}}
        onSuccess={() => {}}
      />,
    );

    // Upload a CSV via file input with two rows sharing the same URL plus one invalid row
    const csv = `name,streamUrl
A,rtsp://h/s
B,rtsp://h/s
C,http://bad/url`;
    const file = new File([csv], 'cameras.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('1 new')).toBeInTheDocument();
    });

    expect(screen.getByText('1 already in DB')).toBeInTheDocument();
    expect(screen.getByText('1 errors')).toBeInTheDocument();
  });

  it('Import button stays enabled when validCount + duplicateCount > 0 && errorCount === 0', async () => {
    const listSites = vi.fn().mockResolvedValue([]);
    // Two rows, same URL — one valid, one duplicate, zero errors
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/projects') {
        return [{ id: 'p1', name: 'Proj' }];
      }
      if (path.includes('/sites')) {
        return [{ id: 's1', name: 'Site' }];
      }
      if (path === '/api/cameras') return [];
      return listSites();
    });

    render(
      <BulkImportDialog
        open
        onOpenChange={() => {}}
        onSuccess={() => {}}
      />,
    );

    const csv = `name,streamUrl
A,rtsp://h/s
B,rtsp://h/s`;
    const file = new File([csv], 'cameras.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('1 new')).toBeInTheDocument();
    });
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Confirm Import/i });
      expect(btn).not.toBeDisabled();
    });
  });

  it('Import button disabled when errorCount > 0 regardless of duplicates', async () => {
    render(
      <BulkImportDialog
        open
        onOpenChange={() => {}}
        onSuccess={() => {}}
      />,
    );

    const csv = `name,streamUrl
A,rtsp://h/s
B,rtsp://h/s
C,http://bad`;
    const file = new File([csv], 'cameras.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('1 errors')).toBeInTheDocument();
    });

    const btn = screen.getByRole('button', { name: /Confirm Import/i });
    expect(btn).toBeDisabled();
  });

  it('editing a duplicate row streamUrl to unique value removes duplicate flag', async () => {
    // Unit-level check: annotateDuplicates recomputes to false when URL changes
    const rows = [
      makeRow({ name: 'A', streamUrl: 'rtsp://h/s' }),
      makeRow({ name: 'B', streamUrl: 'rtsp://h/s' }),
    ];
    const annotatedBefore = annotateDuplicates(rows);
    expect(annotatedBefore[1].duplicate).toBe(true);

    const edited = annotatedBefore.map((r, i) => (i === 1 ? { ...r, streamUrl: 'rtsp://other/s' } : r));
    const annotatedAfter = annotateDuplicates(edited);
    expect(annotatedAfter[1].duplicate).toBe(false);
    expect(annotatedAfter[1].duplicateReason).toBeUndefined();
  });

  it('quick-260426-lg5: annotateDuplicates flags rows whose streamUrl is in existingUrls as against-db', () => {
    const existingUrls = new Set(['rtsp://existing/1']);
    const rows = [
      makeRow({ name: 'A', streamUrl: 'rtsp://existing/1' }),
      makeRow({ name: 'B', streamUrl: 'rtsp://new/1' }),
      makeRow({ name: 'C', streamUrl: 'rtsp://new/1' }),
    ];
    const annotated = annotateDuplicates(rows, existingUrls);

    // Row 0: against-db hit (wins over within-file)
    expect(annotated[0].duplicate).toBe(true);
    expect(annotated[0].duplicateReason).toBe('against-db');

    // Row 1: first occurrence of a new URL → not flagged
    expect(annotated[1].duplicate).toBe(false);

    // Row 2: within-file duplicate of row 1 → flagged within-file
    expect(annotated[2].duplicate).toBe(true);
    expect(annotated[2].duplicateReason).toBe('within-file');
  });

  it('quick-260426-lg5: omitting existingUrls preserves prior behavior (within-file only)', () => {
    const rows = [
      makeRow({ name: 'A', streamUrl: 'rtsp://h/s' }),
      makeRow({ name: 'B', streamUrl: 'rtsp://h/s' }),
    ];
    const annotated = annotateDuplicates(rows);
    expect(annotated[0].duplicate).toBe(false);
    expect(annotated[1].duplicate).toBe(true);
    expect(annotated[1].duplicateReason).toBe('within-file');
  });
});

// ---------------------------------------------------------------------------
// Group 3: Post-import toast cascade (UI-SPEC)
// ---------------------------------------------------------------------------

describe('BulkImportDialog post-import toast cascade — Phase 19 (UI-SPEC)', () => {
  async function renderWithRows(csv: string) {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/projects') {
        return [{ id: 'p1', name: 'Proj' }];
      }
      if (path.includes('/sites')) {
        return [{ id: 's1', name: 'Site' }];
      }
      if (path === '/api/cameras') return [];
      return undefined as never;
    });

    render(
      <BulkImportDialog
        open
        onOpenChange={() => {}}
        onSuccess={() => {}}
      />,
    );

    const file = new File([csv], 'cameras.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm Import/i })).toBeInTheDocument();
    });
  }

  it('imported>0 && skipped===0: toast "Imported N cameras successfully."', async () => {
    const csv = `name,streamUrl
A,rtsp://h/a
B,rtsp://h/b
C,rtsp://h/c`;
    await renderWithRows(csv);

    apiFetchMock.mockImplementationOnce(async () => ({ imported: 3, skipped: 0, errors: [] }));

    const btn = screen.getByRole('button', { name: /Confirm Import/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Imported 3 cameras successfully.'),
    );
  });

  it('imported>0 && skipped>0: toast "Imported N cameras, skipped M duplicates."', async () => {
    const csv = `name,streamUrl
A,rtsp://h/a
B,rtsp://h/b`;
    await renderWithRows(csv);

    apiFetchMock.mockImplementationOnce(async () => ({ imported: 2, skipped: 3, errors: [] }));

    const btn = screen.getByRole('button', { name: /Confirm Import/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Imported 2 cameras, skipped 3 duplicates.'),
    );
  });

  it('imported===0 && skipped>0: sonner warning "No cameras imported — all M rows were duplicates."', async () => {
    const csv = `name,streamUrl
A,rtsp://h/a
B,rtsp://h/b`;
    await renderWithRows(csv);

    apiFetchMock.mockImplementationOnce(async () => ({ imported: 0, skipped: 5, errors: [] }));

    const btn = screen.getByRole('button', { name: /Confirm Import/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith('No cameras imported — all 5 rows were duplicates.'),
    );
  });
});

// ---------------------------------------------------------------------------
// Group 4: Drop-zone drag-and-drop (regression guard for
// bulk-import-drop-zone-not-working — the drop zone must accept dropped files
// the same way the file picker does, AND must call preventDefault on dragover
// so the browser doesn't reject the drop / open the file natively)
// ---------------------------------------------------------------------------

describe('BulkImportDialog drop-zone drag-and-drop', () => {
  function findDropZone(): HTMLElement {
    // The drop zone is the upload-step button containing "Drop file here".
    const text = screen.getByText(/drop file here/i);
    const btn = text.closest('button');
    if (!btn) throw new Error('Drop-zone button not found');
    return btn;
  }

  it('dropping a CSV file on the drop zone parses it and advances to the preview step', async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/projects') return [{ id: 'p1', name: 'Proj' }];
      if (path.includes('/sites')) return [{ id: 's1', name: 'Site' }];
      if (path === '/api/cameras') return [];
      return undefined as never;
    });

    render(
      <BulkImportDialog open onOpenChange={() => {}} onSuccess={() => {}} />,
    );

    const csv = `name,streamUrl
DropCam,rtsp://h/d`;
    const file = new File([csv], 'cameras.csv', { type: 'text/csv' });

    const dropZone = findDropZone();
    // Simulate the drag sequence: dragover then drop. fireEvent.drop accepts a
    // dataTransfer object on the second arg; the handler reads dataTransfer.files.
    fireEvent.dragOver(dropZone, { dataTransfer: { files: [file] } });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm Import/i })).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('DropCam')).toBeInTheDocument();
    expect(screen.getByDisplayValue('rtsp://h/d')).toBeInTheDocument();
  });

  it('dragover on the drop zone calls preventDefault (otherwise the browser rejects the drop)', () => {
    render(
      <BulkImportDialog open onOpenChange={() => {}} onSuccess={() => {}} />,
    );

    const dropZone = findDropZone();
    // fireEvent returns false when the event was canceled via preventDefault.
    // This is the load-bearing assertion: without preventDefault on dragover,
    // onDrop never fires regardless of how the handler is written.
    const notCanceled = fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } });
    expect(notCanceled).toBe(false);
  });

  it('dragover toggles the drag-over visual state on the drop zone', () => {
    render(
      <BulkImportDialog open onOpenChange={() => {}} onSuccess={() => {}} />,
    );

    const dropZone = findDropZone();
    expect(dropZone.getAttribute('data-drag-over')).toBeNull();

    fireEvent.dragEnter(dropZone, { dataTransfer: { files: [] } });
    expect(dropZone.getAttribute('data-drag-over')).toBe('true');

    fireEvent.dragLeave(dropZone, { dataTransfer: { files: [] } });
    expect(dropZone.getAttribute('data-drag-over')).toBeNull();
  });

  it('dropping with no files is a no-op (does not crash, stays on upload step)', () => {
    render(
      <BulkImportDialog open onOpenChange={() => {}} onSuccess={() => {}} />,
    );

    const dropZone = findDropZone();
    fireEvent.drop(dropZone, { dataTransfer: { files: [] } });

    // Still on upload step — no preview table, no Confirm Import button.
    expect(screen.queryByRole('button', { name: /Confirm Import/i })).toBeNull();
    expect(screen.getByText(/drop file here/i)).toBeInTheDocument();
  });
});
