import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClusterHealthService } from './cluster-health.service';

export interface HealthCheckJobData {
  nodeId: string;
}

@Processor('cluster-health')
export class ClusterHealthProcessor extends WorkerHost {
  private readonly logger = new Logger(ClusterHealthProcessor.name);

  constructor(private readonly healthService: ClusterHealthService) {
    super();
  }

  async process(job: Job<HealthCheckJobData>): Promise<void> {
    const { nodeId } = job.data;
    this.logger.debug(`Running health check for node ${nodeId}`);
    await this.healthService.checkNode(nodeId);
  }
}
