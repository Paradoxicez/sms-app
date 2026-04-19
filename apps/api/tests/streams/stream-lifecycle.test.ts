import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fluent-ffmpeg
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

describe('StreamsService', () => {
  let service: StreamsService;
  let mockQueue: any;
  let mockFfmpegService: any;
  let mockStatusService: any;
  let mockPrisma: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      remove: vi.fn().mockResolvedValue(undefined),
      getJob: vi.fn().mockResolvedValue({ id: 'job-1', remove: vi.fn().mockResolvedValue(undefined) }),
    };

    mockFfmpegService = {
      stopStream: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
    };

    mockStatusService = {
      transition: vi.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      camera: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cam-1',
          orgId: 'org-1',
          streamUrl: 'rtsp://192.168.1.100/stream',
          needsTranscode: false,
          streamProfile: null,
          status: 'offline',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    service = new StreamsService(mockPrisma, mockQueue, mockFfmpegService, mockStatusService);
  });

  it('should add a job to BullMQ queue on startStream', async () => {
    await service.startStream('cam-1');

    expect(mockQueue.add).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({
        cameraId: 'cam-1',
        orgId: 'org-1',
        rtspUrl: 'rtsp://192.168.1.100/stream',
      }),
      expect.objectContaining({
        jobId: 'camera:cam-1:ffmpeg',
      }),
    );
  });

  it('should throw if camera not found on startStream', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue(null);

    await expect(service.startStream('nonexistent')).rejects.toThrow('Camera not found');
  });

  it('should stop stream by removing job and killing FFmpeg', async () => {
    mockFfmpegService.isRunning.mockReturnValue(true);

    await service.stopStream('cam-1');

    expect(mockFfmpegService.stopStream).toHaveBeenCalledWith('cam-1');
    expect(mockStatusService.transition).toHaveBeenCalledWith('cam-1', 'org-1', 'offline');
  });

  it('should include stream profile data when camera has a profile', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam-1',
      orgId: 'org-1',
      streamUrl: 'rtsp://192.168.1.100/stream',
      needsTranscode: true,
      status: 'offline',
      streamProfile: {
        codec: 'libx264',
        preset: 'veryfast',
        resolution: '1280x720',
        fps: 30,
        videoBitrate: '2000k',
        audioCodec: 'aac',
        audioBitrate: '128k',
      },
    });

    await service.startStream('cam-1');

    expect(mockQueue.add).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({
        profile: expect.objectContaining({
          codec: 'libx264',
          preset: 'veryfast',
        }),
        needsTranscode: true,
      }),
      expect.anything(),
    );
  });
});
