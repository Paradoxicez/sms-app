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

  it('generates MPEG-TS HLS manifest without EXT-X-MAP (SRS v6 native)', () => {
    // SRS 6.0.184 emits MPEG-TS (.ts) segments; EXT-X-MAP is only valid for
    // fMP4 which requires SRS v7.0.51+. Manifest must advertise HLS v3 and
    // must NOT reference an init segment.
    const segments = [
      { duration: 2.0, url: 'https://minio/seg1.ts' },
      { duration: 2.0, url: 'https://minio/seg2.ts' },
    ];

    const m3u8 = service.buildManifest(segments);

    expect(m3u8).toContain('#EXTM3U');
    expect(m3u8).toContain('#EXT-X-VERSION:3');
    expect(m3u8).not.toContain('#EXT-X-MAP');
    expect(m3u8).not.toContain('#EXT-X-VERSION:7');
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
      { id: 's1', objectPath: 'cam/2026-04-13/08-00-00_1.ts', duration: 2.0, seqNo: 1 },
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

  it('sets EXT-X-VERSION:3 and EXT-X-ENDLIST for MPEG-TS VOD playback', () => {
    const segments = [
      { duration: 2.0, url: 'https://minio/seg1.ts' },
    ];

    const m3u8 = service.buildManifest(segments);

    expect(m3u8).toContain('#EXT-X-VERSION:3');
    expect(m3u8).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
    expect(m3u8).toContain('#EXT-X-ENDLIST');
  });

  it('generates correct EXTINF durations for each segment', () => {
    const segments = [
      { duration: 2.123456, url: 'https://minio/seg1.ts' },
      { duration: 1.987654, url: 'https://minio/seg2.ts' },
    ];

    const m3u8 = service.buildManifest(segments);

    expect(m3u8).toContain('#EXTINF:2.123456,');
    expect(m3u8).toContain('#EXTINF:1.987654,');
    expect(m3u8).toContain('https://minio/seg1.ts');
    expect(m3u8).toContain('https://minio/seg2.ts');
  });

  it('ignores legacy initSegment column when generating manifest', async () => {
    // Defense in depth: recordings created before the MPEG-TS switch may
    // still have `initSegment` populated, but MPEG-TS manifests MUST NOT
    // include EXT-X-MAP — that would break hls.js / FFmpeg playback.
    const orgId = 'org-1';
    const recordingId = 'rec-1';

    mockPrisma.recording.findFirst.mockResolvedValue({
      id: recordingId,
      orgId,
      initSegment: 'legacy/init.mp4',
    });
    mockPrisma.recordingSegment.findMany.mockResolvedValue([
      { id: 's1', objectPath: 'cam/x.ts', duration: 2.0, seqNo: 1 },
    ]);

    const m3u8 = await service.generateManifest(recordingId, orgId);

    expect(m3u8).not.toContain('#EXT-X-MAP');
    expect(m3u8).not.toContain('init.mp4');
    expect(m3u8).toContain('/api/recordings/segments/s1/proxy');
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
    expect(m3u8).toContain('#EXT-X-VERSION:3');
    expect(m3u8).toContain('#EXT-X-ENDLIST');
    expect(m3u8).not.toContain('#EXTINF');
    expect(m3u8).not.toContain('#EXT-X-MAP');
  });

  describe('layer-7: leading non-keyframe segment skip (RTMP mid-GOP)', () => {
    // These tests cover the root cause of the RTMP push preview failure:
    // recordings that started mid-GOP carried 1-2 leading TS fragments with
    // no H.264 IDR. hls.js 1.6.x fatal-errors on such a leading fragment.
    // The archive path now probes each segment and stores `hasKeyframe`;
    // the manifest generator skips leading false rows.

    const orgId = 'org-1';
    const recordingId = 'rec-rtmp-push';

    beforeEach(() => {
      mockPrisma.recording.findFirst.mockResolvedValue({
        id: recordingId,
        orgId,
        initSegment: null,
      });
    });

    it('skips leading segments with hasKeyframe=false (RTMP regression)', async () => {
      mockPrisma.recordingSegment.findMany.mockResolvedValue([
        { id: 's188', duration: 4.12, seqNo: 188, hasKeyframe: false },
        { id: 's189', duration: 4.22, seqNo: 189, hasKeyframe: true },
        { id: 's190', duration: 4.2, seqNo: 190, hasKeyframe: false },
        { id: 's191', duration: 3.25, seqNo: 191, hasKeyframe: true },
      ]);

      const m3u8 = await service.generateManifest(recordingId, orgId);

      expect(m3u8).not.toContain('/api/recordings/segments/s188/proxy');
      expect(m3u8).toContain('/api/recordings/segments/s189/proxy');
      // Mid-playlist non-keyframe rows are PRESERVED — they carry P-frames
      // that reference the prior IDR and hls.js handles them fine once the
      // decoder has been initialised.
      expect(m3u8).toContain('/api/recordings/segments/s190/proxy');
      expect(m3u8).toContain('/api/recordings/segments/s191/proxy');
    });

    it('treats hasKeyframe=null as playable (legacy RTSP rows)', async () => {
      // Rows archived before the column existed come back with null. RTSP
      // recordings have always started on a keyframe via the pull-side
      // FFmpeg pipeline, so trust them unconditionally.
      mockPrisma.recordingSegment.findMany.mockResolvedValue([
        { id: 'legacy-0', duration: 2.56, seqNo: 0, hasKeyframe: null },
        { id: 'legacy-1', duration: 2.56, seqNo: 1, hasKeyframe: null },
      ]);

      const m3u8 = await service.generateManifest(recordingId, orgId);

      expect(m3u8).toContain('/api/recordings/segments/legacy-0/proxy');
      expect(m3u8).toContain('/api/recordings/segments/legacy-1/proxy');
    });

    it('returns empty manifest when no segment has hasKeyframe=true', async () => {
      // Edge case: recording was stopped before the first IDR arrived.
      // Nothing is decodable; return an empty-but-spec-valid playlist so
      // the UI shows "no content" instead of a FFmpeg error.
      mockPrisma.recordingSegment.findMany.mockResolvedValue([
        { id: 's1', duration: 4.12, seqNo: 1, hasKeyframe: false },
        { id: 's2', duration: 4.22, seqNo: 2, hasKeyframe: false },
      ]);

      const m3u8 = await service.generateManifest(recordingId, orgId);

      expect(m3u8).not.toContain('#EXTINF');
      expect(m3u8).toContain('#EXT-X-ENDLIST');
    });
  });
});
