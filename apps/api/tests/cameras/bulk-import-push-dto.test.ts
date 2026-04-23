// Phase 19.1 — bulk-import DTO push-mode refine tests (converted from Wave 0 todos).
import { describe, it, expect } from 'vitest';
import { BulkImportCameraSchema } from '../../src/cameras/dto/bulk-import.dto';

describe('BulkImportCameraSchema push-mode refine', () => {
  it('accepts pull row with rtsp:// URL', () => {
    const r = BulkImportCameraSchema.safeParse({
      name: 'cam',
      streamUrl: 'rtsp://host/a',
    });
    expect(r.success).toBe(true);
  });

  it('accepts push row with empty streamUrl', () => {
    const r = BulkImportCameraSchema.safeParse({
      name: 'cam',
      streamUrl: '',
      ingestMode: 'push',
    });
    expect(r.success).toBe(true);
  });

  it('rejects push row with non-empty streamUrl — message mentions streamUrl empty', () => {
    const r = BulkImportCameraSchema.safeParse({
      name: 'cam',
      streamUrl: 'rtmp://x/y',
      ingestMode: 'push',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(' ');
      expect(msg).toMatch(/streamUrl empty/i);
    }
  });

  it('defaults ingestMode to "pull" when column absent', () => {
    const r = BulkImportCameraSchema.safeParse({
      name: 'cam',
      streamUrl: 'rtsp://host/a',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ingestMode).toBe('pull');
  });
});
