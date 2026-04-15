import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import { buildFfmpegCommand, StreamProfile } from './ffmpeg-command.builder';

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);
  private runningProcesses = new Map<string, ffmpeg.FfmpegCommand>();
  private eventHandlers = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();
  private intentionalStops = new Set<string>();

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

    return new Promise<void>((resolve, reject) => {
      this.eventHandlers.set(cameraId, { resolve, reject });

      cmd.on('start', (commandLine: string) => {
        this.logger.log(`FFmpeg started for camera ${cameraId}: ${commandLine}`);
      });

      cmd.on('error', (err: Error) => {
        const wasIntentional = this.intentionalStops.has(cameraId);
        this.intentionalStops.delete(cameraId);
        this.runningProcesses.delete(cameraId);
        this.eventHandlers.delete(cameraId);

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

        this.logger.error(`FFmpeg error for camera ${cameraId}: ${err.message}`);
        reject(err);
      });

      cmd.on('end', () => {
        this.intentionalStops.delete(cameraId);
        this.logger.log(`FFmpeg ended for camera ${cameraId}`);
        this.runningProcesses.delete(cameraId);
        this.eventHandlers.delete(cameraId);
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
}
