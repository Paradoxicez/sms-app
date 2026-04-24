import { Injectable, Logger } from '@nestjs/common';

interface ArchiveMetricsSnapshot {
  successes: number;
  failures: number;
  total: number;
  failureRate: number;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
  lastSuccessAt: string | null;
  status: 'healthy' | 'degraded' | 'failing' | 'idle';
}

@Injectable()
export class ArchiveMetricsService {
  private readonly logger = new Logger(ArchiveMetricsService.name);
  private successes = 0;
  private failures = 0;
  private lastFailureAt: Date | null = null;
  private lastFailureMessage: string | null = null;
  private lastSuccessAt: Date | null = null;

  recordSuccess(): void {
    this.successes += 1;
    this.lastSuccessAt = new Date();
  }

  recordFailure(err: Error): void {
    this.failures += 1;
    this.lastFailureAt = new Date();
    this.lastFailureMessage = err.message;
    if (this.failures === 1 || this.failures % 10 === 0) {
      this.logger.error(
        `Archive failures: ${this.failures} total (successes: ${this.successes}). Latest: ${err.message}`,
      );
    }
  }

  snapshot(): ArchiveMetricsSnapshot {
    const total = this.successes + this.failures;
    const failureRate = total > 0 ? this.failures / total : 0;

    let status: ArchiveMetricsSnapshot['status'];
    if (total === 0) status = 'idle';
    else if (failureRate === 0) status = 'healthy';
    else if (failureRate < 0.1) status = 'degraded';
    else status = 'failing';

    return {
      successes: this.successes,
      failures: this.failures,
      total,
      failureRate,
      lastFailureAt: this.lastFailureAt?.toISOString() ?? null,
      lastFailureMessage: this.lastFailureMessage,
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
      status,
    };
  }
}
