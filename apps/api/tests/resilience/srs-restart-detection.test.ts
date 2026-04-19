import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SrsRestartDetector } from '../../src/resilience/srs-restart-detector';

describe('SrsRestartDetector — pid delta detection', () => {
  let detector: SrsRestartDetector;
  let mockPrisma: any;
  let mockSrsApi: any;
  let mockFfmpeg: any;
  let mockStreamQueue: any;

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

  it('first tick initializes baseline without firing recovery (Pitfall 4 mitigation)', async () => {
    mockSrsApi.getSummaries.mockResolvedValue({
      data: { self: { pid: 1234, srs_uptime: 100 } },
    });

    await detector.detectAndHandle();

    expect(mockPrisma.camera.findMany).not.toHaveBeenCalled();
    expect(mockStreamQueue.add).not.toHaveBeenCalled();
  });

  it('same pid on second tick is a no-op (no recovery)', async () => {
    mockSrsApi.getSummaries
      .mockResolvedValueOnce({ data: { self: { pid: 1234 } } })
      .mockResolvedValueOnce({ data: { self: { pid: 1234 } } });

    await detector.detectAndHandle(); // baseline
    await detector.detectAndHandle(); // same pid

    expect(mockPrisma.camera.findMany).not.toHaveBeenCalled();
    expect(mockStreamQueue.add).not.toHaveBeenCalled();
  });

  it('pid delta triggers handleRestart (bulk re-enqueue)', async () => {
    mockSrsApi.getSummaries
      .mockResolvedValueOnce({ data: { self: { pid: 1234 } } })
      .mockResolvedValueOnce({ data: { self: { pid: 5678 } } });
    mockPrisma.camera.findMany.mockResolvedValue([
      {
        id: 'cam-1',
        orgId: 'org-1',
        streamUrl: 'rtsp://192.168.1.100/stream',
        needsTranscode: false,
        status: 'online',
        maintenanceMode: false,
        streamProfile: null,
      },
    ]);

    await detector.detectAndHandle(); // baseline
    await detector.detectAndHandle(); // different pid -> restart

    expect(mockPrisma.camera.findMany).toHaveBeenCalledTimes(1);
    expect(mockStreamQueue.add).toHaveBeenCalledTimes(1);
  });

  it('handles missing pid in summaries gracefully (warn + skip)', async () => {
    mockSrsApi.getSummaries.mockResolvedValue({ data: { self: {} } });

    await detector.detectAndHandle();

    expect(mockPrisma.camera.findMany).not.toHaveBeenCalled();
    expect(mockStreamQueue.add).not.toHaveBeenCalled();
  });

  it('handles srsApi.getSummaries rejection without throwing', async () => {
    mockSrsApi.getSummaries.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(detector.detectAndHandle()).resolves.not.toThrow();
    expect(mockPrisma.camera.findMany).not.toHaveBeenCalled();
  });
});
