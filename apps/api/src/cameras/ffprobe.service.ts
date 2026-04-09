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
    // Stub — will be implemented in Task 2
    throw new Error('Not implemented');
  }
}
