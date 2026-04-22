import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProbeResult {
  codec: string;
  width: number;
  height: number;
  fps: number;
  audioCodec: string;
  needsTranscode: boolean;
}

@Injectable()
export class FfprobeService {
  private readonly logger = new Logger(FfprobeService.name);

  /** Returns the input-specific flags string for ffprobe. D-13 — only RTSP needs -rtsp_transport. */
  private inputFlagsFor(streamUrl: string): string {
    if (streamUrl.startsWith('rtsp://')) return '-rtsp_transport tcp ';
    // rtmp, rtmps, srt, http(s): no input flags needed
    return '';
  }

  async probeCamera(streamUrl: string): Promise<ProbeResult> {
    const redactedUrl = this.redactUrl(streamUrl);
    this.logger.log(`Probing camera: ${redactedUrl}`);

    const transportFlag = this.inputFlagsFor(streamUrl);
    const cmd = `ffprobe -v quiet -print_format json -show_streams ${transportFlag}"${streamUrl}"`;
    const { stdout } = await execAsync(cmd, { timeout: 15000 });
    const data = JSON.parse(stdout);

    const videoStream = data.streams?.find(
      (s: any) => s.codec_type === 'video',
    );
    const audioStream = data.streams?.find(
      (s: any) => s.codec_type === 'audio',
    );

    if (!videoStream) {
      throw new Error('No video stream found in camera feed');
    }

    const codec = videoStream.codec_name;
    const needsTranscode = ['hevc', 'h265'].includes(codec.toLowerCase());

    const fpsStr = videoStream.r_frame_rate || '30/1';
    const [num, den] = fpsStr.split('/').map(Number);
    const fps = Math.round(num / (den || 1));

    return {
      codec,
      width: videoStream.width || 0,
      height: videoStream.height || 0,
      fps,
      audioCodec: audioStream?.codec_name || 'none',
      needsTranscode,
    };
  }

  private redactUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password) {
        parsed.username = '***';
        parsed.password = '***';
      }
      return parsed.toString();
    } catch {
      return url.replace(/:\/\/[^@]+@/, '://***:***@');
    }
  }
}

// test-only export — do not use in production code
export const __test__ = {
  inputFlagsFor: (service: FfprobeService, url: string): string =>
    (service as any).inputFlagsFor(url),
};
