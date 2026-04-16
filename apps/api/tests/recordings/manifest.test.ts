import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManifestService } from '../../src/recordings/manifest.service';

describe('ManifestService - Dynamic m3u8 Generation (REC-02)', () => {
  let service: ManifestService;
  let mockPrisma: any;
  let mockMinioService: any;

  beforeEach(() => {
    mockPrisma = {
      recording: {
        findFirst: vi.fn(),
      },
      recordingSegment: {
        findMany: vi.fn(),
        groupBy: vi.fn(),
      },
    };

    mockMinioService = {
      getPresignedUrl: vi.fn(),
    };

    service = new ManifestService(mockPrisma, mockMinioService);
  });

  it('generates valid fMP4 HLS manifest with EXT-X-MAP for init segment', () => {
    const segments = [
      { duration: 2.0, url: 'https://minio/seg1.m4s' },
      { duration: 2.0, url: 'https://minio/seg2.m4s' },
    ];
    const initUrl = 'https://minio/init.mp4';

    const m3u8 = service.buildManifest(segments, initUrl);

    expect(m3u8).toContain('#EXTM3U');
    expect(m3u8).toContain('#EXT-X-VERSION:7');
    expect(m3u8).toContain(`#EXT-X-MAP:URI="${initUrl}"`);
  });

  it('includes only segments within the requested time range', async () => {
    const orgId = 'org-1';
    const recordingId = 'rec-1';
    const startTime = new Date('2026-04-13T08:00:00Z');
    const endTime = new Date('2026-04-13T09:00:00Z');

    mockPrisma.recording.findFirst.mockResolvedValue({
      id: recordingId,
      orgId,
      initSegment: null,
    });

    mockPrisma.recordingSegment.findMany.mockResolvedValue([
      { id: 's1', objectPath: 'cam/2026-04-13/08-00-00_1.m4s', duration: 2.0, seqNo: 1 },
    ]);

    const m3u8 = await service.generateManifest(recordingId, orgId, startTime, endTime);

    expect(mockPrisma.recordingSegment.findMany).toHaveBeenCalledWith({
      where: {
        recordingId,
        orgId,
        timestamp: { gte: startTime, lte: endTime },
      },
      orderBy: { seqNo: 'asc' },
    });

    // Manifest should use proxy URLs, not presigned MinIO URLs
    expect(m3u8).toContain('/api/recordings/segments/s1/proxy');
    expect(mockMinioService.getPresignedUrl).not.toHaveBeenCalled();
  });

  it('sets EXT-X-VERSION:7 and EXT-X-ENDLIST for VOD playback', () => {
    const segments = [
      { duration: 2.0, url: 'https://minio/seg1.m4s' },
    ];

    const m3u8 = service.buildManifest(segments, null);

    expect(m3u8).toContain('#EXT-X-VERSION:7');
    expect(m3u8).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
    expect(m3u8).toContain('#EXT-X-ENDLIST');
  });

  it('generates correct EXTINF durations for each segment', () => {
    const segments = [
      { duration: 2.123456, url: 'https://minio/seg1.m4s' },
      { duration: 1.987654, url: 'https://minio/seg2.m4s' },
    ];

    const m3u8 = service.buildManifest(segments, null);

    expect(m3u8).toContain('#EXTINF:2.123456,');
    expect(m3u8).toContain('#EXTINF:1.987654,');
    expect(m3u8).toContain('https://minio/seg1.m4s');
    expect(m3u8).toContain('https://minio/seg2.m4s');
  });

  it('returns empty manifest when no segments exist for time range', async () => {
    const orgId = 'org-1';
    const recordingId = 'rec-1';

    mockPrisma.recording.findFirst.mockResolvedValue({
      id: recordingId,
      orgId,
      initSegment: null,
    });

    mockPrisma.recordingSegment.findMany.mockResolvedValue([]);

    const m3u8 = await service.generateManifest(recordingId, orgId);

    expect(m3u8).toContain('#EXTM3U');
    expect(m3u8).toContain('#EXT-X-VERSION:7');
    expect(m3u8).toContain('#EXT-X-ENDLIST');
    expect(m3u8).not.toContain('#EXTINF');
    expect(m3u8).not.toContain('#EXT-X-MAP');
  });
});
