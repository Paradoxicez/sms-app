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

  async probeCamera(streamUrl: string): Promise<ProbeResult> {
    const redactedUrl = this.redactUrl(streamUrl);
    this.logger.log(`Probing camera: ${redactedUrl}`);

    const cmd = `ffprobe -v quiet -print_format json -show_streams -rtsp_transport tcp "${streamUrl}"`;
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
