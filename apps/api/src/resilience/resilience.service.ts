import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { FfmpegService } from '../streams/ffmpeg/ffmpeg.service';

const SHUTDOWN_GRACE_MS = 10_000; // 10 seconds before SIGKILL stragglers
const POLL_INTERVAL_MS = 100;

/**
 * onApplicationShutdown hook triggered by Docker SIGTERM / Ctrl-C SIGINT.
 * Sends SIGTERM to all running FFmpegs in parallel, polls for clean exit
 * within the grace window, then SIGKILLs stragglers (T-15-05 mitigation —
 * bounded orphan window).
 *
 * Does NOT touch Prisma / BullMQ / status.transition — DB state stays at
 * last-known value so boot recovery can re-enqueue on next startup (D-09).
 */
@Injectable()
export class ResilienceService implements OnApplicationShutdown {
  private readonly logger = new Logger(ResilienceService.name);

  constructor(private readonly ffmpeg: FfmpegService) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    const running = this.ffmpeg.getRunningCameraIds();
    if (running.length === 0) {
      this.logger.log('Shutdown: no running FFmpeg processes');
      return;
    }

    this.logger.log(
      `Shutting down ${running.length} FFmpeg processes (signal=${signal})`,
    );

    // Parallel SIGTERM — stopStream is synchronous.
    for (const cameraId of running) {
      this.ffmpeg.stopStream(cameraId);
    }

    // Poll for clean exit within grace window.
    const deadline = Date.now() + SHUTDOWN_GRACE_MS;
    while (Date.now() < deadline) {
      const stillRunning = running.filter((id) => this.ffmpeg.isRunning(id));
      if (stillRunning.length === 0) {
        this.logger.log('All FFmpegs exited cleanly within grace');
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    // Grace expired — SIGKILL stragglers.
    const stragglers = running.filter((id) => this.ffmpeg.isRunning(id));
    for (const cameraId of stragglers) {
      this.ffmpeg.forceKill(cameraId);
    }
    this.logger.warn(
      `SIGKILLed stragglers: ${stragglers.join(', ')} (${stragglers.length} processes)`,
    );
  }
}
