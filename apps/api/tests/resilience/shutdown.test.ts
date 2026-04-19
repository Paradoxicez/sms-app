import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResilienceService } from '../../src/resilience/resilience.service';

describe('ResilienceService — onApplicationShutdown', () => {
  let service: ResilienceService;
  let mockFfmpeg: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFfmpeg = {
      getRunningCameraIds: vi.fn().mockReturnValue([]),
      stopStream: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
      forceKill: vi.fn(),
    };

    service = new ResilienceService(mockFfmpeg);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no-op when no running processes', async () => {
    mockFfmpeg.getRunningCameraIds.mockReturnValue([]);

    await service.onApplicationShutdown('SIGTERM');

    expect(mockFfmpeg.stopStream).not.toHaveBeenCalled();
    expect(mockFfmpeg.forceKill).not.toHaveBeenCalled();
  });

  it('SIGTERMs all running processes (stopStream called once per camera)', async () => {
    mockFfmpeg.getRunningCameraIds.mockReturnValue(['cam-a', 'cam-b', 'cam-c']);
    // All processes "exit" cleanly on first poll — isRunning returns false.
    mockFfmpeg.isRunning.mockReturnValue(false);

    await service.onApplicationShutdown('SIGTERM');

    expect(mockFfmpeg.stopStream).toHaveBeenCalledTimes(3);
    const stopArgs = new Set(
      mockFfmpeg.stopStream.mock.calls.map((c: any[]) => c[0]),
    );
    expect(stopArgs).toEqual(new Set(['cam-a', 'cam-b', 'cam-c']));
    expect(mockFfmpeg.forceKill).not.toHaveBeenCalled();
  });

  it('returns before grace expires when all exit cleanly', async () => {
    mockFfmpeg.getRunningCameraIds.mockReturnValue(['cam-1']);
    // First isRunning poll returns true, second returns false — process exits during grace.
    let pollCount = 0;
    mockFfmpeg.isRunning.mockImplementation(() => {
      pollCount++;
      return pollCount < 2; // alive first check, dead after
    });

    const start = Date.now();
    await service.onApplicationShutdown('SIGTERM');
    const elapsed = Date.now() - start;

    expect(mockFfmpeg.stopStream).toHaveBeenCalledWith('cam-1');
    expect(mockFfmpeg.forceKill).not.toHaveBeenCalled();
    // Should return well under 10s — this is a real-timer test to prove the
    // grace loop exits early.
    expect(elapsed).toBeLessThan(1000);
  });

  it('SIGKILLs stragglers after 10s grace (fake timers)', async () => {
    vi.useFakeTimers();

    mockFfmpeg.getRunningCameraIds.mockReturnValue(['cam-x', 'cam-y']);
    // isRunning always true — processes never exit cleanly.
    mockFfmpeg.isRunning.mockReturnValue(true);

    const shutdownPromise = service.onApplicationShutdown('SIGTERM');

    // Advance past the 10s grace window.
    await vi.advanceTimersByTimeAsync(10_500);

    await shutdownPromise;

    expect(mockFfmpeg.stopStream).toHaveBeenCalledTimes(2);
    expect(mockFfmpeg.forceKill).toHaveBeenCalledTimes(2);
    const killArgs = new Set(
      mockFfmpeg.forceKill.mock.calls.map((c: any[]) => c[0]),
    );
    expect(killArgs).toEqual(new Set(['cam-x', 'cam-y']));
  });
});
