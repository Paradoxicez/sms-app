import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RecordingsController } from './recordings.controller';
import { RecordingsService } from './recordings.service';
import { MinioService } from './minio.service';
import { ManifestService } from './manifest.service';
import { RetentionProcessor } from './retention.processor';
import { ScheduleProcessor } from './schedule.processor';
import { BulkDownloadService } from './bulk-download.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'recording-retention' }),
    BullModule.registerQueue({ name: 'recording-schedule' }),
  ],
  controllers: [RecordingsController],
  providers: [
    RecordingsService,
    MinioService,
    ManifestService,
    BulkDownloadService,
    RetentionProcessor,
    ScheduleProcessor,
  ],
  exports: [RecordingsService, MinioService, ManifestService],
})
export class RecordingsModule implements OnModuleInit {
  constructor(
    @InjectQueue('recording-retention') private readonly retentionQueue: Queue,
    @InjectQueue('recording-schedule') private readonly scheduleQueue: Queue,
  ) {}

  async onModuleInit() {
    // Retention cleanup: every hour
    await this.retentionQueue.upsertJobScheduler(
      'retention-cleanup',
      { pattern: '0 * * * *' },
      { name: 'retention-cleanup' },
    );

    // Schedule check: every minute
    await this.scheduleQueue.upsertJobScheduler(
      'schedule-check',
      { pattern: '* * * * *' },
      { name: 'schedule-check' },
    );
  }
}
