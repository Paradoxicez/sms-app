import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RecordingsController } from './recordings.controller';
import { RecordingsService } from './recordings.service';
import { MinioService } from './minio.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'recording-retention' }),
    BullModule.registerQueue({ name: 'recording-schedule' }),
  ],
  controllers: [RecordingsController],
  providers: [RecordingsService, MinioService],
  exports: [RecordingsService, MinioService],
})
export class RecordingsModule {}
