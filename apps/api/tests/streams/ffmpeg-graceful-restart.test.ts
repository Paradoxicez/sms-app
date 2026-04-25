import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FfmpegService } from '../../src/streams/ffmpeg/ffmpeg.service';

describe('Phase 21 — D-05 FfmpegService.gracefulRestart helper', () => {
  let ffmpegService: FfmpegService;

  beforeEach(() => {
    ffmpegService = new FfmpegService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns immediately when isRunning(cameraId) is false (no-op)', async () => {
    const stopSpy = vi.spyOn(ffmpegService, 'stopStream');
    const killSpy = vi.spyOn(ffmpegService, 'forceKill');

    await ffmpegService.gracefulRestart('cam-1');

    expect(stopSpy).not.toHaveBeenCalled();
    expect(killSpy).not.toHaveBeenCalled();
  });

  it('calls stopStream(cameraId) which sets intentionalStops and SIGTERM-kills the process', async () => {
    // Inject a fake running process via the private map.
    (ffmpegService as any).runningProcesses.set('cam-2', { kill: vi.fn() });
    const stopSpy = vi.spyOn(ffmpegService, 'stopStream');

    const promise = ffmpegService.gracefulRestart('cam-2', 100);
    expect(stopSpy).toHaveBeenCalledWith('cam-2');

    // Drain the polling loop so the test can complete.
    (ffmpegService as any).runningProcesses.delete('cam-2');
    await vi.advanceTimersByTimeAsync(200);
    await promise;
  });

  it('polls isRunning every 100ms; resolves when isRunning returns false BEFORE graceMs elapses (no SIGKILL)', async () => {
    (ffmpegService as any).runningProcesses.set('cam-3', { kill: vi.fn() });
    const killSpy = vi.spyOn(ffmpegService, 'forceKill');

    const promise = ffmpegService.gracefulRestart('cam-3', 1_000);
    // Simulate the FFmpeg process exiting after 200ms (between polls).
    setTimeout(() => (ffmpegService as any).runningProcesses.delete('cam-3'), 200);
    await vi.advanceTimersByTimeAsync(300);
    await promise;

    expect(killSpy).not.toHaveBeenCalled();
  });

  it('calls forceKill(cameraId) when isRunning still returns true after graceMs', async () => {
    (ffmpegService as any).runningProcesses.set('cam-4', { kill: vi.fn() });
    const killSpy = vi
      .spyOn(ffmpegService, 'forceKill')
      .mockImplementation(() => {
        (ffmpegService as any).runningProcesses.delete('cam-4');
      });

    const promise = ffmpegService.gracefulRestart('cam-4', 500);
    await vi.advanceTimersByTimeAsync(600);
    await promise;

    expect(killSpy).toHaveBeenCalledWith('cam-4');
  });

  it('default graceMs is 5000 (5 seconds) — restart-flow value, not the 10s shutdown grace', async () => {
    (ffmpegService as any).runningProcesses.set('cam-5', { kill: vi.fn() });
    const killSpy = vi
      .spyOn(ffmpegService, 'forceKill')
      .mockImplementation(() => {
        (ffmpegService as any).runningProcesses.delete('cam-5');
      });

    const promise = ffmpegService.gracefulRestart('cam-5'); // no graceMs arg
    // At T+4900ms forceKill must NOT have fired yet.
    await vi.advanceTimersByTimeAsync(4_900);
    expect(killSpy).not.toHaveBeenCalled();
    // At T+5100ms it MUST have fired.
    await vi.advanceTimersByTimeAsync(200);
    await promise;
    expect(killSpy).toHaveBeenCalled();
  });

  it('forceKill is NOT called when SIGTERM succeeds within graceMs (early-exit fast path)', async () => {
    (ffmpegService as any).runningProcesses.set('cam-6', { kill: vi.fn() });
    const killSpy = vi.spyOn(ffmpegService, 'forceKill');

    const promise = ffmpegService.gracefulRestart('cam-6', 2_000);
    // Process exits cleanly at T+50ms (before the first 100ms poll, even).
    setTimeout(() => (ffmpegService as any).runningProcesses.delete('cam-6'), 50);
    await vi.advanceTimersByTimeAsync(150);
    await promise;

    expect(killSpy).not.toHaveBeenCalled();
  });
});
