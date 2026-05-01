import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CameraHealthService } from '../../src/resilience/camera-health.service';

describe('CameraHealthService', () => {
  let service: CameraHealthService;
  let mockPrisma: any;
  let mockSrsApi: any;
  let mockFfmpeg: any;
  let mockStatusService: any;
  let mockSrsRestartDetector: any;
  let mockHealthQueue: any;
  let mockStreamQueue: any;

  const makeCamera = (overrides: any = {}) => ({
    id: 'cam-1',
    orgId: 'org-1',
    streamUrl: 'rtsp://192.168.1.100/stream',
    needsTranscode: false,
    status: 'online',
    maintenanceMode: false,
    streamProfile: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      camera: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    mockSrsApi = {
      getStreams: vi.fn().mockResolvedValue({ streams: [] }),
    };
    mockFfmpeg = {
      isRunning: vi.fn().mockReturnValue(true),
      stopStream: vi.fn(),
    };
    mockStatusService = {
      transition: vi.fn().mockResolvedValue(undefined),
    };
    mockSrsRestartDetector = {
      detectAndHandle: vi.fn().mockResolvedValue(undefined),
    };
    mockHealthQueue = {
      add: vi.fn().mockResolvedValue({ id: 'health-job-1' }),
    };
    mockStreamQueue = {
      // Phase 21 B-1 collision guard: enqueueStart now calls getJob before add.
      // Default returns null (no in-flight job), allowing the normal recovery path.
      getJob: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockResolvedValue({ id: 'stream-job-1' }),
    };

    service = new CameraHealthService(
      mockPrisma,
      mockSrsApi,
      mockFfmpeg,
      mockStatusService,
      mockSrsRestartDetector,
      mockHealthQueue,
      mockStreamQueue,
    );
  });

  describe('onModuleInit', () => {
    it('schedules a single repeatable tick with deterministic jobId', async () => {
      await service.onModuleInit();

      expect(mockHealthQueue.add).toHaveBeenCalledWith(
        'tick',
        {},
        expect.objectContaining({
          jobId: 'camera-health-tick',
          repeat: { every: 60_000 },
          removeOnComplete: true,
          removeOnFail: 10,
        }),
      );
    });
  });

  describe('runTick — Prisma filter', () => {
    it('queries only non-offline, non-maintenance cameras with streamProfile included', async () => {
      await service.runTick();

      expect(mockPrisma.camera.findMany).toHaveBeenCalledWith({
        where: {
          status: { in: ['online', 'connecting', 'reconnecting', 'degraded'] },
          maintenanceMode: false,
        },
        include: { streamProfile: true },
      });
    });

    it('delegates to SrsRestartDetector before checking cameras', async () => {
      await service.runTick();

      expect(mockSrsRestartDetector.detectAndHandle).toHaveBeenCalledTimes(1);
    });
  });

  describe('runTick — dead stream recovery', () => {
    it('triggers SIGTERM + transition + enqueue when FFmpeg is running but SRS does not know about it (after MISS_TOLERANCE consecutive misses)', async () => {
      const camera = makeCamera({ id: 'cam-dead-1' });
      mockPrisma.camera.findMany.mockResolvedValue([camera]);
      mockFfmpeg.isRunning.mockReturnValue(true);
      mockSrsApi.getStreams.mockResolvedValue({ streams: [] }); // SRS has no stream

      // MISS_TOLERANCE=2: first tick is tolerated (missCounter=1), second tick triggers reap
      await service.runTick();
      await service.runTick();

      expect(mockFfmpeg.stopStream).toHaveBeenCalledWith('cam-dead-1');
      expect(mockStatusService.transition).toHaveBeenCalledWith(
        'cam-dead-1',
        'org-1',
        'reconnecting',
      );
      expect(mockStreamQueue.add).toHaveBeenCalledWith(
        'start',
        expect.objectContaining({ cameraId: 'cam-dead-1', orgId: 'org-1' }),
        expect.objectContaining({
          jobId: 'camera:cam-dead-1:ffmpeg',
          attempts: 8,
          removeOnComplete: true,
          removeOnFail: false,
        }),
      );
    });

    it('triggers recovery when FFmpeg not running even if SRS knows about it', async () => {
      const camera = makeCamera({ id: 'cam-dead-2' });
      mockPrisma.camera.findMany.mockResolvedValue([camera]);
      mockFfmpeg.isRunning.mockReturnValue(false);
      mockSrsApi.getStreams.mockResolvedValue({ streams: [{ name: 'cam-dead-2' }] });

      await service.runTick();

      // FFmpeg is not running → no stopStream call
      expect(mockFfmpeg.stopStream).not.toHaveBeenCalled();
      // But status transition + enqueue still fire
      expect(mockStatusService.transition).toHaveBeenCalledWith(
        'cam-dead-2',
        'org-1',
        'reconnecting',
      );
      expect(mockStreamQueue.add).toHaveBeenCalled();
    });
  });

  describe('runTick — healthy streams produce no recovery', () => {
    it('does not trigger recovery when FFmpeg running and SRS knows about stream', async () => {
      const camera = makeCamera({ id: 'cam-healthy' });
      mockPrisma.camera.findMany.mockResolvedValue([camera]);
      mockFfmpeg.isRunning.mockReturnValue(true);
      mockSrsApi.getStreams.mockResolvedValue({ streams: [{ name: 'cam-healthy' }] });

      await service.runTick();

      expect(mockFfmpeg.stopStream).not.toHaveBeenCalled();
      expect(mockStatusService.transition).not.toHaveBeenCalled();
      expect(mockStreamQueue.add).not.toHaveBeenCalled();
    });

    it('does not call SRS getStreams per-camera — single call per tick (T-15-03)', async () => {
      const cameras = [
        makeCamera({ id: 'cam-a' }),
        makeCamera({ id: 'cam-b' }),
        makeCamera({ id: 'cam-c' }),
      ];
      mockPrisma.camera.findMany.mockResolvedValue(cameras);
      mockFfmpeg.isRunning.mockReturnValue(true);
      mockSrsApi.getStreams.mockResolvedValue({
        streams: [{ name: 'cam-a' }, { name: 'cam-b' }, { name: 'cam-c' }],
      });

      await service.runTick();

      expect(mockSrsApi.getStreams).toHaveBeenCalledTimes(1);
    });
  });

  describe('runTick — error handling (post-fix: cache + miss tolerance)', () => {
    it('does not throw when SRS getStreams fails on the first tick', async () => {
      const camera = makeCamera({ id: 'cam-err' });
      mockPrisma.camera.findMany.mockResolvedValue([camera]);
      mockFfmpeg.isRunning.mockReturnValue(true);
      mockSrsApi.getStreams.mockRejectedValue(new Error('connection refused'));

      await expect(service.runTick()).resolves.not.toThrow();
    });

    it('does NOT kill any camera when SRS getStreams fails on a cold cache (no warm-up tick)', async () => {
      // Bug #1 (production-cameras-flapping, 2026-04-30): under SRS HTTP
      // overload, getStreams() throws → previously the catch returned
      // {streams: []} and EVERY healthy camera was SIGTERM'd. Post-fix
      // (cache + miss tolerance), a cold cache + failed call must NOT
      // re-enqueue anything — better to skip the liveness pass than nuke
      // working FFmpegs.
      const cameras = [
        makeCamera({ id: 'cam-a' }),
        makeCamera({ id: 'cam-b' }),
        makeCamera({ id: 'cam-c' }),
      ];
      mockPrisma.camera.findMany.mockResolvedValue(cameras);
      mockFfmpeg.isRunning.mockReturnValue(true);
      mockSrsApi.getStreams.mockRejectedValue(new Error('client disconnect peer. ret=1007'));

      await service.runTick();

      expect(mockFfmpeg.stopStream).not.toHaveBeenCalled();
      expect(mockStatusService.transition).not.toHaveBeenCalled();
      expect(mockStreamQueue.add).not.toHaveBeenCalled();
    });

    it('falls back to last-known-good cache when SRS getStreams fails after a successful tick', async () => {
      // Warm the cache with a successful tick first.
      const camera = makeCamera({ id: 'cam-warm' });
      mockPrisma.camera.findMany.mockResolvedValue([camera]);
      mockFfmpeg.isRunning.mockReturnValue(true);
      mockSrsApi.getStreams.mockResolvedValueOnce({
        streams: [{ name: 'cam-warm' }],
      });

      await service.runTick();

      expect(mockStreamQueue.add).not.toHaveBeenCalled();

      // Second tick: SRS fails. Cache should be reused → camera stays alive.
      mockSrsApi.getStreams.mockRejectedValueOnce(new Error('ret=1007'));

      await service.runTick();

      expect(mockFfmpeg.stopStream).not.toHaveBeenCalled();
      expect(mockStatusService.transition).not.toHaveBeenCalled();
      expect(mockStreamQueue.add).not.toHaveBeenCalled();
    });

    it('tolerates a single tick of srs-miss when ffmpeg is still running (MISS_TOLERANCE)', async () => {
      // Bug #1 secondary safety net: even if SRS responds successfully but
      // omits a stream for ONE tick (e.g. transient registry race), do not
      // immediately SIGTERM. The camera must miss MISS_TOLERANCE ticks in a
      // row before being declared dead.
      const camera = makeCamera({ id: 'cam-flicker' });
      mockPrisma.camera.findMany.mockResolvedValue([camera]);
      mockFfmpeg.isRunning.mockReturnValue(true);
      // SRS returns empty (camera missing) — but successful response, so cache
      // updates to empty.
      mockSrsApi.getStreams.mockResolvedValue({ streams: [] });

      // Tick 1: miss=1 (under tolerance) → no kill.
      await service.runTick();
      expect(mockStreamQueue.add).not.toHaveBeenCalled();
      expect(mockFfmpeg.stopStream).not.toHaveBeenCalled();
    });

    it('declares dead after MISS_TOLERANCE consecutive srs-misses', async () => {
      const camera = makeCamera({ id: 'cam-truly-dead' });
      mockPrisma.camera.findMany.mockResolvedValue([camera]);
      mockFfmpeg.isRunning.mockReturnValue(true);
      mockSrsApi.getStreams.mockResolvedValue({ streams: [] });

      // MISS_TOLERANCE=2 (default, no healthMetrics injected) → 2 misses in a
      // row triggers the kill path on the 2nd tick.
      await service.runTick(); // miss=1 → tolerated
      await service.runTick(); // miss=2 → exceeds tolerance → kill

      expect(mockFfmpeg.stopStream).toHaveBeenCalledWith('cam-truly-dead');
      expect(mockStreamQueue.add).toHaveBeenCalled();
    });
  });
});
