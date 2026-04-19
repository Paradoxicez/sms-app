import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BootRecoveryService } from '../../src/resilience/boot-recovery.service';

describe('BootRecoveryService', () => {
  let service: BootRecoveryService;
  let mockPrisma: any;
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
    mockStreamQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };

    service = new BootRecoveryService(mockPrisma, mockStreamQueue);
  });

  it('enqueues desired-running cameras with 0-30s jitter', async () => {
    const cameras = [
      makeCamera({ id: 'cam-1' }),
      makeCamera({ id: 'cam-2' }),
      makeCamera({ id: 'cam-3' }),
    ];
    mockPrisma.camera.findMany.mockResolvedValue(cameras);

    await service.onApplicationBootstrap();

    expect(mockStreamQueue.add).toHaveBeenCalledTimes(3);

    for (const call of mockStreamQueue.add.mock.calls) {
      const [jobName, payload, options] = call;
      expect(jobName).toBe('start');
      expect(payload).toHaveProperty('cameraId');
      expect(payload).toHaveProperty('orgId');
      expect(options.jobId).toMatch(/^camera:cam-.*:ffmpeg$/);
      expect(options.delay).toBeGreaterThanOrEqual(0);
      expect(options.delay).toBeLessThan(30_000);
      expect(options.attempts).toBe(20);
      expect(options.removeOnComplete).toBe(true);
      expect(options.removeOnFail).toBe(false);
    }
  });

  it('skips cameras where maintenanceMode=true (filter applied in Prisma where)', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([]);

    await service.onApplicationBootstrap();

    expect(mockPrisma.camera.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['online', 'connecting', 'reconnecting', 'degraded'] },
        maintenanceMode: false,
      },
      include: { streamProfile: true },
    });
  });

  it('skips cameras with status=offline (status.in excludes offline)', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([]);

    await service.onApplicationBootstrap();

    const callArgs = mockPrisma.camera.findMany.mock.calls[0][0];
    expect(callArgs.where.status.in).not.toContain('offline');
    expect(callArgs.where.status.in).toEqual(
      expect.arrayContaining(['online', 'connecting', 'reconnecting', 'degraded']),
    );
  });

  it('handles empty result set gracefully (no enqueues, no error)', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([]);

    await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
    expect(mockStreamQueue.add).not.toHaveBeenCalled();
  });

  it('idempotency — second bootstrap still calls queue.add with same jobId (BullMQ owns dedup)', async () => {
    const cameras = [makeCamera({ id: 'cam-idem' })];
    mockPrisma.camera.findMany.mockResolvedValue(cameras);

    await service.onApplicationBootstrap();
    await service.onApplicationBootstrap();

    expect(mockStreamQueue.add).toHaveBeenCalledTimes(2);
    // Both calls target the same deterministic jobId — BullMQ's jobId dedup
    // silently keeps the first job, which is the expected behavior.
    for (const call of mockStreamQueue.add.mock.calls) {
      expect(call[2].jobId).toBe('camera:cam-idem:ffmpeg');
    }
  });

  it('includes streamProfile fields in enqueued payload when camera has profile', async () => {
    const cameras = [
      makeCamera({
        id: 'cam-profile',
        needsTranscode: true,
        streamProfile: {
          codec: 'libx264',
          preset: 'veryfast',
          resolution: '1920x1080',
          fps: 30,
          videoBitrate: '2000k',
          audioCodec: 'aac',
          audioBitrate: '128k',
        },
      }),
    ];
    mockPrisma.camera.findMany.mockResolvedValue(cameras);

    await service.onApplicationBootstrap();

    expect(mockStreamQueue.add).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({
        cameraId: 'cam-profile',
        needsTranscode: true,
        profile: expect.objectContaining({
          codec: 'libx264',
          preset: 'veryfast',
        }),
      }),
      expect.anything(),
    );
  });
});
