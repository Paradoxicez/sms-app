import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SrsRestartDetector } from '../../src/resilience/srs-restart-detector';

describe('SrsRestartDetector — bulk re-enqueue with jitter', () => {
  let detector: SrsRestartDetector;
  let mockPrisma: any;
  let mockSrsApi: any;
  let mockFfmpeg: any;
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

  async function simulateRestart(): Promise<void> {
    // Tick 1 — baseline pid=1000
    mockSrsApi.getSummaries.mockResolvedValueOnce({ data: { self: { pid: 1000 } } });
    await detector.detectAndHandle();
    // Tick 2 — pid changed, triggers handleRestart
    mockSrsApi.getSummaries.mockResolvedValueOnce({ data: { self: { pid: 2000 } } });
    await detector.detectAndHandle();
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      camera: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    mockSrsApi = {
      getSummaries: vi.fn(),
    };
    mockFfmpeg = {
      isRunning: vi.fn().mockReturnValue(false),
      stopStream: vi.fn(),
    };
    mockStreamQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };

    detector = new SrsRestartDetector(
      mockPrisma,
      mockSrsApi,
      mockFfmpeg,
      mockStreamQueue,
    );
  });

  it('queries with maintenanceMode=false filter (skips cameras in maintenance)', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([]);

    await simulateRestart();

    expect(mockPrisma.camera.findMany).toHaveBeenCalledWith({
      where: {
        NOT: { status: 'offline' },
        maintenanceMode: false,
      },
      include: { streamProfile: true },
    });
  });

  it('enqueues each camera with delay in [0, 30000) ms (jitter — T-15-04 mitigation)', async () => {
    const cameras = [
      makeCamera({ id: 'cam-1' }),
      makeCamera({ id: 'cam-2' }),
      makeCamera({ id: 'cam-3' }),
    ];
    mockPrisma.camera.findMany.mockResolvedValue(cameras);

    await simulateRestart();

    expect(mockStreamQueue.add).toHaveBeenCalledTimes(3);

    for (const call of mockStreamQueue.add.mock.calls) {
      const options = call[2];
      expect(options).toHaveProperty('delay');
      expect(options.delay).toBeGreaterThanOrEqual(0);
      expect(options.delay).toBeLessThan(30_000);
      expect(options.jobId).toMatch(/^camera:cam-.*:ffmpeg$/);
      expect(options.attempts).toBe(8);
      expect(options.removeOnComplete).toBe(true);
    }
  });

  it('SIGTERMs running FFmpeg processes before re-enqueue', async () => {
    const cameras = [
      makeCamera({ id: 'cam-1' }),
      makeCamera({ id: 'cam-2' }),
    ];
    mockPrisma.camera.findMany.mockResolvedValue(cameras);
    mockFfmpeg.isRunning.mockImplementation((id: string) => id === 'cam-1');

    await simulateRestart();

    expect(mockFfmpeg.stopStream).toHaveBeenCalledWith('cam-1');
    expect(mockFfmpeg.stopStream).not.toHaveBeenCalledWith('cam-2');
  });

  it('handles empty camera list without error', async () => {
    mockPrisma.camera.findMany.mockResolvedValue([]);

    await expect(simulateRestart()).resolves.not.toThrow();
    expect(mockStreamQueue.add).not.toHaveBeenCalled();
  });
});
