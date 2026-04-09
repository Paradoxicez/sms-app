import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SrsCallbackController } from '../../src/srs/srs-callback.controller';
import { SrsApiService } from '../../src/srs/srs-api.service';

describe('SRS Callback Controller', () => {
  let controller: SrsCallbackController;
  let mockStatusService: any;
  let mockStatusGateway: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStatusService = {
      transition: vi.fn().mockResolvedValue(undefined),
      incrementViewers: vi.fn().mockReturnValue(1),
      decrementViewers: vi.fn().mockReturnValue(0),
    };

    mockStatusGateway = {
      broadcastViewerCount: vi.fn(),
    };

    controller = new SrsCallbackController(mockStatusService, mockStatusGateway);
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
    it('should increment viewer count', async () => {
      const result = await controller.onPlay({
        action: 'on_play',
        app: 'live',
        stream: 'org-1/cam-1',
      });

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
    it('should return code 0', async () => {
      const result = await controller.onHls({ duration: 2, file: '/data/hls/live/org-1/cam-1.ts' });
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
