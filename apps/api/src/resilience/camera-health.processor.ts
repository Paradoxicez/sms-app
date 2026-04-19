import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CameraHealthService } from './camera-health.service';

@Processor('camera-health')
export class CameraHealthProcessor extends WorkerHost {
  private readonly logger = new Logger(CameraHealthProcessor.name);

  constructor(private readonly cameraHealthService: CameraHealthService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.cameraHealthService.runTick();
  }
}
