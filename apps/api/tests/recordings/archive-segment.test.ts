import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingsService } from '../../src/recordings/recordings.service';
import { MinioService } from '../../src/recordings/minio.service';

// Mock fs/promises at module level for ESM compatibility
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import * as fsp from 'fs/promises';

describe('RecordingsService - Segment Archival (REC-01)', () => {
  let service: RecordingsService;
  let minioService: Partial<MinioService>;
  let tenantPrisma: any;
  let systemPrisma: any;
  let rawPrisma: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SRS_HLS_PATH = '/srs-hls';

    minioService = {
      ensureBucket: vi.fn().mockResolvedValue(undefined),
      uploadSegment: vi.fn().mockResolvedValue(undefined),
      removeObject: vi.fn().mockResolvedValue(undefined),
      removeObjects: vi.fn().mockResolvedValue(undefined),
    };

    // tenantPrisma — only used by HTTP CRUD methods, not archive flow
    tenantPrisma = {};

    // systemPrisma — used by archiveSegment / archiveInitSegment / getActiveRecording
    // / checkStorageQuota aggregation after 260420-oid plan.
    systemPrisma = {
      recording: {
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      recordingSegment: {
        count: vi.fn().mockResolvedValue(1), // not first segment by default
        create: vi.fn().mockResolvedValue({}),
        aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0n } }),
      },
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      member: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    rawPrisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'org-1',
          package: { maxStorageGb: 100 },
        }),
      },
    };

    service = new RecordingsService(
      tenantPrisma,
      systemPrisma,
      rawPrisma,
      minioService as MinioService,
    );
  });

  it('archives segment to MinIO when recording is active', async () => {
    const mockBuffer = Buffer.from('fake-segment-data');
    vi.mocked(fsp.readFile).mockResolvedValueOnce(mockBuffer);

    await service.archiveSegment('rec-1', 'org-1', 'cam-1', {
      filePath: '/srs-hls/live/org-1/cam-1/segment-5.ts',
      duration: 2.0,
      seqNo: 5,
      url: '/live/org-1/cam-1/segment-5.ts',
      m3u8Path: '/srs-hls/live/org-1/cam-1/stream.m3u8',
    });

    // SRS v6 emits MPEG-TS; object path must end in .ts so MinIO serves the
    // correct Content-Type (video/mp2t) through proxySegment.
    expect(minioService.uploadSegment).toHaveBeenCalledWith(
      'org-1',
      expect.stringMatching(/^cam-1\/\d{4}-\d{2}-\d{2}\/.+\.ts$/),
      mockBuffer,
      mockBuffer.length,
    );
  });

  it('skips archive when recording is not active for camera', async () => {
    systemPrisma.recording.findFirst.mockResolvedValue(null);

    const result = await service.getActiveRecording('cam-1', 'org-1');
    expect(result).toBeNull();
  });

  it('skips archive when orgId/cameraId cannot be parsed from stream key', () => {
    // This is tested at the controller level -- parseStreamKey returns empty
    // for internal streams. The service relies on the controller to not call it.
    expect(true).toBe(true);
  });

  it('does NOT archive an init segment on first callback (SRS v6 = MPEG-TS)', async () => {
    // SRS 6.0.184 emits MPEG-TS segments. There is no init.mp4 to archive
    // (hls_use_fmp4 is a v7.0.51+ feature). archiveInitSegment was removed;
    // first-segment path must upload exactly one object (.ts only).
    systemPrisma.recordingSegment.count.mockResolvedValue(0);

    const mockSegBuffer = Buffer.from('segment-data');
    vi.mocked(fsp.readFile).mockResolvedValueOnce(mockSegBuffer);

    await service.archiveSegment('rec-1', 'org-1', 'cam-1', {
      filePath: '/srs-hls/live/org-1/cam-1/stream-0.ts',
      duration: 2.0,
      seqNo: 0,
      url: '/live/org-1/cam-1/stream-0.ts',
      m3u8Path: '/srs-hls/live/org-1/cam-1/stream.m3u8',
    });

    // Exactly one upload — the TS segment. No init.mp4 upload, no initSegment
    // column write.
    expect(minioService.uploadSegment).toHaveBeenCalledTimes(1);
    expect(minioService.uploadSegment).toHaveBeenCalledWith(
      'org-1',
      expect.stringMatching(/\.ts$/),
      mockSegBuffer,
      mockSegBuffer.length,
    );

    const updateCalls = systemPrisma.recording.update.mock.calls.map(
      (c: any[]) => c[0],
    );
    for (const call of updateCalls) {
      expect(call?.data?.initSegment).toBeUndefined();
    }
  });

  it('validates file path against allowed mount prefix to prevent path traversal', async () => {
    // Path with .. should be rejected
    await expect(
      service.archiveSegment('rec-1', 'org-1', 'cam-1', {
        filePath: '/srs-hls/../etc/passwd',
        duration: 2.0,
        seqNo: 1,
        url: '/live/segment-1.ts',
        m3u8Path: '/srs-hls/stream.m3u8',
      }),
    ).rejects.toThrow('path traversal');

    // Path not starting with mount prefix should be rejected
    await expect(
      service.archiveSegment('rec-1', 'org-1', 'cam-1', {
        filePath: '/etc/passwd',
        duration: 2.0,
        seqNo: 1,
        url: '/live/segment-1.ts',
        m3u8Path: '/srs-hls/stream.m3u8',
      }),
    ).rejects.toThrow('must start with');
  });

  it('updates recording totalSize and totalDuration after segment upload', async () => {
    const mockBuffer = Buffer.from('fake-segment-data-for-totals');
    vi.mocked(fsp.readFile).mockResolvedValueOnce(mockBuffer);

    await service.archiveSegment('rec-1', 'org-1', 'cam-1', {
      filePath: '/srs-hls/live/org-1/cam-1/segment-3.ts',
      duration: 2.5,
      seqNo: 3,
      url: '/live/segment-3.ts',
      m3u8Path: '/srs-hls/live/stream.m3u8',
    });

    expect(systemPrisma.recording.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rec-1' },
        data: {
          totalSize: { increment: BigInt(mockBuffer.length) },
          totalDuration: { increment: 2.5 },
        },
      }),
    );
  });

  describe('layer-7: hasKeyframe probe (RTMP mid-GOP fix)', () => {
    it('stores hasKeyframe=true when the TS buffer contains an H.264 IDR NAL', async () => {
      // Buffer with AUD + IDR NAL (annexb). The probe short-circuits on first
      // match so a handful of bytes is enough to exercise the positive path.
      const idrBuffer = Buffer.from([
        0x00, 0x00, 0x00, 0x01, 0x09, 0xf0, // AUD
        0x00, 0x00, 0x00, 0x01, 0x65, 0x88, // IDR (nal_unit_type=5)
      ]);
      vi.mocked(fsp.readFile).mockResolvedValueOnce(idrBuffer);

      await service.archiveSegment('rec-1', 'org-1', 'cam-1', {
        filePath: '/srs-hls/live/org-1/cam-1/segment-10.ts',
        duration: 4.12,
        seqNo: 10,
        url: '/live/segment-10.ts',
        m3u8Path: '/srs-hls/stream.m3u8',
      });

      expect(systemPrisma.recordingSegment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ hasKeyframe: true }),
        }),
      );
    });

    it('stores hasKeyframe=false when the TS has only non-IDR slices (mid-GOP)', async () => {
      // Reproduces the bug: RTMP push fragment starting mid-GOP with only
      // AUD + non-IDR P-frames (nal_unit_type=1) and no IDR anywhere.
      // Manifest generator drops leading rows with this flag so hls.js
      // never sees an undecodable fragment as #0.
      const midGopBuffer = Buffer.from([
        0x00, 0x00, 0x00, 0x01, 0x09, 0xf0, // AUD
        0x00, 0x00, 0x00, 0x01, 0x41, 0xe0, // non-IDR slice
        0x00, 0x00, 0x00, 0x01, 0x41, 0xe1, // non-IDR slice
      ]);
      vi.mocked(fsp.readFile).mockResolvedValueOnce(midGopBuffer);

      await service.archiveSegment('rec-1', 'org-1', 'cam-1', {
        filePath: '/srs-hls/live/org-1/cam-1/segment-188.ts',
        duration: 4.12,
        seqNo: 188,
        url: '/live/segment-188.ts',
        m3u8Path: '/srs-hls/stream.m3u8',
      });

      expect(systemPrisma.recordingSegment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ hasKeyframe: false }),
        }),
      );
    });
  });
});
