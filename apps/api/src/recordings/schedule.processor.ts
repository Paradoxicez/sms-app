import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { RecordingsService } from './recordings.service';

@Processor('recording-schedule')
@Injectable()
export class ScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduleProcessor.name);

  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly recordingsService: RecordingsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log('Checking recording schedules...');

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = now.getDay(); // 0=Sun

    const schedules = await this.prisma.recordingSchedule.findMany({
      where: { enabled: true },
    });

    for (const schedule of schedules) {
      const config = schedule.config as { startTime: string; endTime: string; days?: number[] };

      // Check day-of-week for weekly schedules
      if (schedule.scheduleType === 'weekly' && config.days && !config.days.includes(currentDay)) {
        continue;
      }

      const shouldBeRecording = currentTime >= config.startTime && currentTime < config.endTime;

      try {
        const camera = await this.prisma.camera.findUnique({
          where: { id: schedule.cameraId },
          select: { isRecording: true, status: true },
        });

        if (!camera) continue;

        if (shouldBeRecording && !camera.isRecording && camera.status === 'online') {
          await this.recordingsService.startRecording(schedule.cameraId, schedule.orgId);
          this.logger.log(`Schedule started recording: camera=${schedule.cameraId}`);
        } else if (!shouldBeRecording && camera.isRecording) {
          await this.recordingsService.stopRecording(schedule.cameraId, schedule.orgId);
          this.logger.log(`Schedule stopped recording: camera=${schedule.cameraId}`);
        }
      } catch (err: any) {
        this.logger.error(`Schedule error for camera=${schedule.cameraId}: ${err.message}`);
      }
    }
  }
}
