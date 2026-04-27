import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SrsCallbackController } from '../../src/srs/srs-callback.controller';
import { SrsApiService } from '../../src/srs/srs-api.service';

describe('SRS Callback Controller', () => {
  let controller: SrsCallbackController;
  let mockStatusService: any;
  let mockStatusGateway: any;
  let mockPlaybackService: any;
  let mockRecordingsService: any;
  let mockCamerasService: any;
  let mockStreamsService: any;
  let mockSnapshotService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStatusService = {
      transition: vi.fn().mockResolvedValue(undefined),
      incrementViewers: vi.fn().mockReturnValue(1),
      decrementViewers: vi.fn().mockReturnValue(0),
      getViewerCount: vi.fn().mockReturnValue(0),
    };

    mockStatusGateway = {
      broadcastViewerCount: vi.fn(),
    };

    mockPlaybackService = {
      verifyToken: vi.fn().mockResolvedValue({
        sessionId: 'sess-1',
        cameraId: 'cam-1',
        orgId: 'org-1',
        domains: [],
        allowNoReferer: true,
        maxViewers: 0,
      }),
      matchDomain: vi.fn().mockReturnValue(true),
    };

    mockRecordingsService = {
      // Default: not recording — handler returns early after snapshot trigger.
      getActiveRecording: vi.fn().mockResolvedValue(null),
      checkStorageQuota: vi.fn().mockResolvedValue({ allowed: true }),
      archiveSegment: vi.fn().mockResolvedValue(undefined),
    };

    mockCamerasService = {
      findByStreamKey: vi.fn().mockResolvedValue(null),
      enqueueProbeFromSrs: vi.fn().mockResolvedValue(undefined),
      markFirstPublishIfNeeded: vi.fn().mockResolvedValue(false),
    };

    mockStreamsService = {
      startStream: vi.fn().mockResolvedValue(undefined),
    };

    mockSnapshotService = {
      refreshOneFireAndForget: vi.fn(),
      // Default to false so existing seq_no===0 cases continue to fire via the
      // OR-branch (first-segment short-circuit) — observable behaviour stays
      // identical for those tests.
      hasSnapshot: vi.fn().mockResolvedValue(false),
    };

    // Full positional signature: status, gateway, playback, recordings,
    // cameras, streams, audit, archiveMetrics, streamGuardMetrics, snapshot.
    controller = new SrsCallbackController(
      mockStatusService,
      mockStatusGateway,
      mockPlaybackService,
      mockRecordingsService,
      mockCamerasService,
      mockStreamsService,
      undefined, // auditService — optional, not asserted in this file
      undefined, // archiveMetrics — optional, not asserted in this file
      undefined, // streamGuardMetrics — Phase 23 DEBT-01, not asserted in this file
      mockSnapshotService,
    );
  });

  describe('on_publish', () => {
    it('should extract orgId and cameraId from stream key and transition to online', async () => {
      const result = await controller.onPublish({
        action: 'on_publish',
        client_id: '123',
        ip: '172.18.0.3',
        vhost: '__defaultVhost__',
        app: 'live',
        stream: 'org-1/cam-1',
      });

      expect(mockStatusService.transition).toHaveBeenCalledWith('cam-1', 'org-1', 'online');
      // Quick task 260425-wy8: snapshot trigger relocated to on_hls.
      // on_publish MUST NOT spawn a snapshot — the HLS playlist does not yet
      // exist at on_publish time, so FFmpeg would 404.
      expect(mockSnapshotService.refreshOneFireAndForget).not.toHaveBeenCalled();
      expect(result).toEqual({ code: 0 });
    });
  });

  describe('on_unpublish', () => {
    it('should return code 0 and log event', async () => {
      const result = await controller.onUnpublish({
        action: 'on_unpublish',
        app: 'live',
        stream: 'org-1/cam-1',
      });

      expect(result).toEqual({ code: 0 });
      // Should NOT call transition - reconnect is handled by BullMQ
      expect(mockStatusService.transition).not.toHaveBeenCalled();
    });
  });

  describe('on_play', () => {
    it('should verify token and increment viewer count', async () => {
      const result = await controller.onPlay({
        action: 'on_play',
        app: 'live',
        stream: 'org-1/cam-1',
        param: '?token=valid-token',
        pageUrl: 'https://example.com',
      });

      expect(mockPlaybackService.verifyToken).toHaveBeenCalledWith('valid-token', 'cam-1', 'org-1');
      expect(mockStatusService.incrementViewers).toHaveBeenCalledWith('cam-1');
      expect(mockStatusGateway.broadcastViewerCount).toHaveBeenCalledWith('org-1', 'cam-1', 1);
      expect(result).toEqual({ code: 0 });
    });
  });

  describe('on_stop', () => {
    it('should decrement viewer count', async () => {
      const result = await controller.onStop({
        action: 'on_stop',
        app: 'live',
        stream: 'org-1/cam-1',
      });

      expect(mockStatusService.decrementViewers).toHaveBeenCalledWith('cam-1');
      expect(mockStatusGateway.broadcastViewerCount).toHaveBeenCalledWith('org-1', 'cam-1', 0);
      expect(result).toEqual({ code: 0 });
    });
  });

  describe('on_hls', () => {
    function makeOnHlsBody(
      overrides: Partial<{ stream: string; app: string; seq_no: number }> = {},
    ) {
      return {
        action: 'on_hls' as const,
        client_id: 'c1',
        ip: '127.0.0.1',
        vhost: '__defaultVhost__',
        app: overrides.app ?? 'live',
        stream: overrides.stream ?? 'org-1/cam-1',
        param: '',
        duration: 2,
        cwd: '/usr/local/srs',
        file: './objs/nginx/html/live/org-1/cam-1-0.ts',
        url: '/live/org-1/cam-1-0.ts',
        m3u8: './objs/nginx/html/live/org-1/cam-1.m3u8',
        m3u8_url: '/live/org-1/cam-1.m3u8',
        seq_no: overrides.seq_no ?? 0,
      };
    }

    it('triggers snapshot refresh on the first segment (seq_no===0) for live mode', async () => {
      const result = await controller.onHls(makeOnHlsBody({ seq_no: 0 }));
      expect(mockSnapshotService.refreshOneFireAndForget).toHaveBeenCalledTimes(1);
      expect(mockSnapshotService.refreshOneFireAndForget).toHaveBeenCalledWith('cam-1');
      expect(result).toEqual({ code: 0 });
    });

    it('does NOT trigger snapshot refresh on subsequent segments (seq_no > 0) when thumbnail already exists', async () => {
      // Quick task 260426-06n: the seq_no>0 guard is now an OR — a thumbnail
      // must ALSO already exist for the controller to skip. Mock hasSnapshot
      // → true to assert the steady-state path: no refresh fires.
      mockSnapshotService.hasSnapshot.mockResolvedValue(true);
      await controller.onHls(makeOnHlsBody({ seq_no: 1 }));
      await controller.onHls(makeOnHlsBody({ seq_no: 2 }));
      await controller.onHls(makeOnHlsBody({ seq_no: 47 }));
      expect(mockSnapshotService.refreshOneFireAndForget).not.toHaveBeenCalled();
      // hasSnapshot MUST be consulted on every seq_no>0 callback — proves the
      // OR-guard is actually wired (not a stub).
      expect(mockSnapshotService.hasSnapshot).toHaveBeenCalledWith('cam-1');
      expect(mockSnapshotService.hasSnapshot).toHaveBeenCalledTimes(3);
    });

    it('triggers snapshot when seq_no > 0 AND no thumbnail exists yet (catch-up for already-publishing streams)', async () => {
      // Quick task 260426-06n: cameras already streaming when the fix deploys
      // have seq_no in the thousands and never get a snapshot until republish
      // unless the OR-branch fires. hasSnapshot=false → catch-up refresh.
      mockSnapshotService.hasSnapshot.mockResolvedValue(false);
      const result = await controller.onHls(makeOnHlsBody({ seq_no: 500 }));
      expect(mockSnapshotService.refreshOneFireAndForget).toHaveBeenCalledTimes(1);
      expect(mockSnapshotService.refreshOneFireAndForget).toHaveBeenCalledWith('cam-1');
      expect(result).toEqual({ code: 0 });
    });

    it('skips snapshot when seq_no > 0 AND thumbnail already exists (steady state)', async () => {
      mockSnapshotService.hasSnapshot.mockResolvedValue(true);
      const result = await controller.onHls(makeOnHlsBody({ seq_no: 500 }));
      expect(mockSnapshotService.refreshOneFireAndForget).not.toHaveBeenCalled();
      expect(result).toEqual({ code: 0 });
    });

    it('skips hasSnapshot DB lookup when seq_no === 0 (short-circuits the OR)', async () => {
      // Cheap-path proof: JS `||` short-circuits, so cameras whose first
      // segment fires on_hls must NOT incur a DB hit on every segment.
      mockSnapshotService.hasSnapshot.mockResolvedValue(true);
      await controller.onHls(makeOnHlsBody({ seq_no: 0 }));
      expect(mockSnapshotService.refreshOneFireAndForget).toHaveBeenCalledTimes(1);
      expect(mockSnapshotService.refreshOneFireAndForget).toHaveBeenCalledWith('cam-1');
      expect(mockSnapshotService.hasSnapshot).not.toHaveBeenCalled();
    });

    it('strips .ts segment suffix when resolving cameraId for snapshot', async () => {
      // SRS posts the segment filename in `stream` for on_hls events
      // (e.g., "cam-1-0.ts"). parseStreamKey strips both the extension and
      // the trailing "-{seq}" segment number; the snapshot call must
      // receive the bare cameraId.
      await controller.onHls(makeOnHlsBody({ stream: 'org-1/cam-1-0.ts', seq_no: 0 }));
      expect(mockSnapshotService.refreshOneFireAndForget).toHaveBeenCalledWith('cam-1');
    });

    it('does NOT trigger snapshot for push-mode on_hls payloads', async () => {
      // Push apps are unexpected on on_hls (HLS is served from live/...) but
      // if SRS posts one, parseStreamKey returns mode='push' and we must skip.
      await controller.onHls(makeOnHlsBody({ app: 'push', stream: 'some-stream-key', seq_no: 0 }));
      expect(mockSnapshotService.refreshOneFireAndForget).not.toHaveBeenCalled();
    });

    it('returns code 0 even when seq_no===0 and no active recording', async () => {
      // Default mockRecordingsService.getActiveRecording returns null.
      const result = await controller.onHls(makeOnHlsBody({ seq_no: 0 }));
      expect(result).toEqual({ code: 0 });
    });
  });

  describe('on_dvr', () => {
    it('should return code 0', async () => {
      const result = await controller.onDvr({ cwd: '/usr/local/srs', file: './objs/dvr/cam-1.flv' });
      expect(result).toEqual({ code: 0 });
    });
  });

  describe('parseStreamKey', () => {
    it('should handle app="live" stream="{orgId}/{cameraId}" format', async () => {
      await controller.onPublish({ app: 'live', stream: 'org-123/cam-456' });
      expect(mockStatusService.transition).toHaveBeenCalledWith('cam-456', 'org-123', 'online');
    });

    it('should handle app="live/{orgId}" stream="{cameraId}" format', async () => {
      await controller.onPublish({ app: 'live/org-789', stream: 'cam-abc' });
      expect(mockStatusService.transition).toHaveBeenCalledWith('cam-abc', 'org-789', 'online');
    });

    it('should return empty object for malformed keys', async () => {
      await controller.onPublish({ app: 'live', stream: '' });
      expect(mockStatusService.transition).not.toHaveBeenCalled();
    });

    it('should handle stream key with no app prefix', async () => {
      // When app is empty, just use stream
      await controller.onPublish({ app: '', stream: 'live/org-1/cam-1' });
      expect(mockStatusService.transition).toHaveBeenCalledWith('cam-1', 'org-1', 'online');
    });
  });
});

describe('SRS API Service', () => {
  let service: SrsApiService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
    service = new SrsApiService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should fetch versions from SRS API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ code: 0, server: 'srs', data: { major: 6, minor: 0 } }),
    }) as any;

    const result = await service.getVersions();
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:1985/api/v1/versions');
    expect(result.code).toBe(0);
  });

  it('should fetch streams from SRS API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ code: 0, streams: [] }),
    }) as any;

    const result = await service.getStreams();
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:1985/api/v1/streams');
    expect(result.code).toBe(0);
  });
});
