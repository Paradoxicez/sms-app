import { Injectable, Logger, Optional } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import { buildFfmpegCommand, StreamProfile } from './ffmpeg-command.builder';
import { StreamHealthMetricsService } from '../stream-health-metrics.service';

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);
  private runningProcesses = new Map<string, ffmpeg.FfmpegCommand>();
  private eventHandlers = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();
  private intentionalStops = new Set<string>();
  // Ring buffer of recent FFmpeg stderr lines per camera (last 30).
  // Surfaced on the 'error' event so production logs reveal the actual
  // libx264 / RTSP / RTMP failure cause instead of a bare "Input/output error".
  private readonly stderrBuffers = new Map<string, string[]>();
  private readonly STDERR_BUFFER_SIZE = 30;

  // Optional so existing positional-construction tests (no health metrics)
  // continue to build. When undefined, recordStart/recordExit are no-ops
  // and crash-loop detection silently degrades to the legacy behavior.
  constructor(
    @Optional() private readonly healthMetrics?: StreamHealthMetricsService,
  ) {}

  async startStream(
    cameraId: string,
    inputUrl: string,
    outputUrl: string,
    profile: StreamProfile,
    needsTranscode: boolean,
  ): Promise<void> {
    if (this.runningProcesses.has(cameraId)) {
      this.logger.warn(`Stream already running for camera ${cameraId}`);
      return;
    }

    const cmd = buildFfmpegCommand(inputUrl, outputUrl, profile, needsTranscode);
    this.runningProcesses.set(cameraId, cmd);

    this.stderrBuffers.set(cameraId, []);

    return new Promise<void>((resolve, reject) => {
      this.eventHandlers.set(cameraId, { resolve, reject });

      cmd.on('start', (commandLine: string) => {
        this.healthMetrics?.recordStart(cameraId);
        this.logger.log(`FFmpeg started for camera ${cameraId}: ${commandLine}`);
      });

      cmd.on('stderr', (line: string) => {
        const buf = this.stderrBuffers.get(cameraId);
        if (!buf) return;
        buf.push(line);
        if (buf.length > this.STDERR_BUFFER_SIZE) buf.shift();
      });

      cmd.on('error', (err: Error) => {
        const wasIntentional = this.intentionalStops.has(cameraId);
        const tail = (this.stderrBuffers.get(cameraId) ?? []).join('\n');
        this.healthMetrics?.recordExit(cameraId, wasIntentional);
        this.intentionalStops.delete(cameraId);
        this.runningProcesses.delete(cameraId);
        this.eventHandlers.delete(cameraId);
        this.stderrBuffers.delete(cameraId);

        if (wasIntentional) {
          // SIGTERM from stopStream() makes fluent-ffmpeg fire 'error'
          // with a non-zero exit status — treat it as a clean stop so the
          // BullMQ job completes (removeOnComplete) instead of retrying
          // up to 20 times and restarting the stream on its own.
          this.logger.log(
            `FFmpeg stopped intentionally for camera ${cameraId}`,
          );
          resolve();
          return;
        }

        this.logger.error(
          `FFmpeg error for camera ${cameraId}: ${err.message}` +
            (tail ? `\n--- last stderr lines ---\n${tail}` : ''),
        );
        reject(err);
      });

      cmd.on('end', () => {
        this.healthMetrics?.recordExit(cameraId, true);
        this.intentionalStops.delete(cameraId);
        this.logger.log(`FFmpeg ended for camera ${cameraId}`);
        this.runningProcesses.delete(cameraId);
        this.eventHandlers.delete(cameraId);
        this.stderrBuffers.delete(cameraId);
        resolve();
      });

      cmd.run();
    });
  }

  stopStream(cameraId: string): void {
    const cmd = this.runningProcesses.get(cameraId);
    if (cmd) {
      // Mark before killing so the 'error' handler knows the SIGTERM is
      // expected. Do NOT delete from runningProcesses here — let the
      // async 'error'/'end' handler clean up, otherwise a subsequent
      // start-stream for the same camera can race with the dying process.
      this.intentionalStops.add(cameraId);
      cmd.kill('SIGTERM');
    }
  }

  isRunning(cameraId: string): boolean {
    return this.runningProcesses.has(cameraId);
  }

  /**
   * Test helper: simulate the 'end' event for a running process.
   * Only used in tests.
   */
  simulateEnd(cameraId: string): void {
    const handler = this.eventHandlers.get(cameraId);
    if (handler) {
      this.runningProcesses.delete(cameraId);
      this.eventHandlers.delete(cameraId);
      handler.resolve();
    }
  }

  getRunningCameraIds(): string[] {
    return Array.from(this.runningProcesses.keys());
  }

  forceKill(cameraId: string): void {
    const cmd = this.runningProcesses.get(cameraId);
    if (!cmd) return;
    // Same intentional-stop contract as stopStream — tells the 'error'
    // handler to treat this as clean so BullMQ does not retry.
    this.intentionalStops.add(cameraId);
    cmd.kill('SIGKILL');
    this.logger.warn(`FFmpeg SIGKILLed for camera ${cameraId} (grace expired)`);
  }

  /**
   * Phase 21 D-05: graceful per-camera restart.
   *
   * SIGTERM the running FFmpeg, poll isRunning every 100ms until either
   * the process exits naturally OR the grace deadline expires (then SIGKILL).
   * No-op if the camera has no running process.
   *
   * graceMs default 5000 — restart-flow value per 21-RESEARCH.md §6, NOT
   * the 10s shutdown grace from resilience.service.ts (which prioritizes
   * clean exit over latency; restart prioritizes latency over clean exit).
   *
   * Mirrors resilience.service.ts:39-53 polling loop, single-camera variant.
   * Resolves in all cases — never rejects (FFmpeg restart must not surface
   * errors to the BullMQ worker layer; the subsequent startStream call
   * carries failure semantics if the new spawn fails).
   */
  async gracefulRestart(
    cameraId: string,
    graceMs: number = 5_000,
  ): Promise<void> {
    if (!this.isRunning(cameraId)) return;

    this.stopStream(cameraId); // SIGTERM, sets intentionalStops
    const deadline = Date.now() + graceMs;

    while (Date.now() < deadline) {
      if (!this.isRunning(cameraId)) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }

    // Grace expired — force the kill. forceKill is a no-op if the process
    // already exited between the last poll and now (it checks runningProcesses).
    this.forceKill(cameraId);
  }
}
