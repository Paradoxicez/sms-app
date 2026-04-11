import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ApiKeysService } from './api-keys.service';

@Processor('api-key-usage')
export class ApiKeyUsageProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ApiKeyUsageProcessor.name);

  constructor(
    private readonly apiKeysService: ApiKeysService,
    @InjectQueue('api-key-usage') private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit() {
    // Register repeatable job for daily aggregation at 00:05 UTC
    await this.queue.upsertJobScheduler(
      'daily-aggregation',
      { pattern: '5 0 * * *' },
      { name: 'aggregate-daily-usage' },
    );
    this.logger.log('Registered daily usage aggregation job (00:05 UTC)');
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing job: ${job.name}`);
    await this.apiKeysService.aggregateDaily();
    this.logger.log('Daily usage aggregation complete');
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.name} failed: ${error.message}`, error.stack);
  }
}
