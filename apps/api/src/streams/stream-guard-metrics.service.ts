import { Injectable, Logger } from '@nestjs/common';

export type StreamGuardRefusalReason = 'undefined_cameraId' | 'empty_inputUrl';

export interface StreamGuardMetricsSnapshot {
  refusals: number;
  byReason: Record<StreamGuardRefusalReason, number>;
  lastRefusalAt: string | null;
  lastRefusalReason: StreamGuardRefusalReason | null;
  status: 'idle' | 'degraded' | 'failing';
}

/**
 * Phase 23 DEBT-01 — Observability for the StreamProcessor empty-job guard.
 *
 * Mirrors `ArchiveMetricsService` topology (in-memory counters + snapshot()
 * surfaced via the existing `/api/srs/callbacks/metrics` endpoint). No
 * `'healthy'` status because StreamGuard has no success denominator — every
 * refusal is degradation. Three-state enum is sufficient for operator
 * alerting (per 23-RESEARCH.md A1).
 */
@Injectable()
export class StreamGuardMetricsService {
  private readonly logger = new Logger(StreamGuardMetricsService.name);
  private refusals = 0;
  private byReason: Record<StreamGuardRefusalReason, number> = {
    undefined_cameraId: 0,
    empty_inputUrl: 0,
  };
  private lastRefusalAt: Date | null = null;
  private lastRefusalReason: StreamGuardRefusalReason | null = null;

  recordRefusal(reason: StreamGuardRefusalReason): void {
    this.refusals += 1;
    this.byReason[reason] += 1;
    this.lastRefusalAt = new Date();
    this.lastRefusalReason = reason;
    // Log on first refusal + every 10th to avoid log spam in a tight loop
    // (matches ArchiveMetricsService:32-36 cadence).
    if (this.refusals === 1 || this.refusals % 10 === 0) {
      this.logger.warn(
        `StreamGuard refusals: ${this.refusals} total. Latest reason: ${reason}`,
      );
    }
  }

  snapshot(): StreamGuardMetricsSnapshot {
    let status: StreamGuardMetricsSnapshot['status'];
    if (this.refusals === 0) status = 'idle';
    else if (this.refusals < 5) status = 'degraded';
    else status = 'failing';

    return {
      refusals: this.refusals,
      byReason: { ...this.byReason },
      lastRefusalAt: this.lastRefusalAt?.toISOString() ?? null,
      lastRefusalReason: this.lastRefusalReason,
      status,
    };
  }
}
