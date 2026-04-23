// Phase 19.1 Plan 04 — StreamsService push routing tests (D-17).
//
// StreamsService.startStream must branch on `camera.ingestMode`:
//   - pull                             → inputUrl = camera.streamUrl (unchanged)
//   - push + needsTranscode=true       → inputUrl = rtmp://127.0.0.1:1935/push/<streamKey>
//   - push + needsTranscode=false      → early return, no queue.add (SRS forward remaps)
//
// Constructor signature: (prisma, streamQueue, ffmpegService, statusService)
// — see apps/api/src/streams/streams.service.ts line 13-18.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fluent-ffmpeg so FfmpegService import doesn't spawn real processes
// (matches stream-lifecycle.test.ts pattern).
vi.mock('fluent-ffmpeg', () => ({
  default: vi.fn(() => ({
    inputOptions: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    outputFormat: vi.fn().mockReturnThis(),
    videoCodec: vi.fn().mockReturnThis(),
    audioCodec: vi.fn().mockReturnThis(),
    addOutputOptions: vi.fn().mockReturnThis(),
    videoBitrate: vi.fn().mockReturnThis(),
    size: vi.fn().mockReturnThis(),
    fps: vi.fn().mockReturnThis(),
    audioBitrate: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    run: vi.fn(),
    kill: vi.fn(),
  })),
}));

import { StreamsService } from '../../src/streams/streams.service';

describe('StreamsService.startStream input URL routing (D-17)', () => {
  let mockQueue: any;
  let mockFfmpegService: any;
  let mockStatusService: any;

  function buildService(camera: any) {
    const mockPrisma: any = {
      camera: {
        findUnique: vi.fn().mockResolvedValue(camera),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const svc = new StreamsService(
      mockPrisma,
      mockQueue,
      mockFfmpegService,
      mockStatusService,
    );
    return { svc, prisma: mockPrisma };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      remove: vi.fn().mockResolvedValue(undefined),
      getJob: vi.fn().mockResolvedValue(null),
    };
    mockFfmpegService = {
      stopStream: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
    };
    mockStatusService = {
      transition: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('push + transcode → inputUrl = rtmp://127.0.0.1:1935/push/{streamKey}', async () => {
    const camera = {
      id: 'c1',
      orgId: 'orgA',
      name: 'Push Cam',
      ingestMode: 'push',
      streamKey: 'KEY21CHARNANOIDXXXXXX',
      streamUrl: 'rtmp://ext-host:1935/push/KEY21CHARNANOIDXXXXXX',
      needsTranscode: true,
      streamProfile: {
        codec: 'libx264',
        preset: 'veryfast',
        resolution: '1280x720',
        fps: 30,
        videoBitrate: '2000k',
        audioCodec: 'aac',
        audioBitrate: '128k',
      },
    };
    const { svc } = buildService(camera);

    await svc.startStream('c1');

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({
        cameraId: 'c1',
        orgId: 'orgA',
        inputUrl: 'rtmp://127.0.0.1:1935/push/KEY21CHARNANOIDXXXXXX',
        needsTranscode: true,
      }),
      expect.objectContaining({ jobId: 'camera:c1:ffmpeg' }),
    );
  });

  it('push + passthrough → startStream is a no-op (no queue add)', async () => {
    const camera = {
      id: 'c2',
      orgId: 'orgA',
      name: 'Passthrough Cam',
      ingestMode: 'push',
      streamKey: 'KEY2',
      streamUrl: 'rtmp://ext-host:1935/push/KEY2',
      needsTranscode: false,
      streamProfile: null,
    };
    const { svc } = buildService(camera);

    await svc.startStream('c2');

    // SRS forward handles the remap — no FFmpeg needed for passthrough push.
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('pull path unchanged — inputUrl = camera.streamUrl', async () => {
    const camera = {
      id: 'c3',
      orgId: 'orgA',
      name: 'Pull Cam',
      ingestMode: 'pull',
      streamKey: null,
      streamUrl: 'rtsp://cam.example.com/s',
      needsTranscode: true,
      streamProfile: null,
    };
    const { svc } = buildService(camera);

    await svc.startStream('c3');

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({
        inputUrl: 'rtsp://cam.example.com/s',
        needsTranscode: true,
      }),
      expect.anything(),
    );
  });
});
