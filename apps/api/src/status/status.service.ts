import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { StatusGateway } from './status.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StreamHealthMetricsService } from '../streams/stream-health-metrics.service';

@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);
  private viewerCounts = new Map<string, number>();

  // Phase 19.1: `offline -> online` is now allowed to support push+passthrough
  // cameras whose SRS-forward callback fires on_publish directly (no FFmpeg
  // connecting phase). Pull cameras still typically pass through `connecting`
  // because FFmpegService.start() sets that state before the SRS callback
  // fires — the new direct edge is additive, not destructive.
  //
  // 2026-04-30 self-healing edge `connecting/reconnecting -> degraded` added
  // so the crash-loop detector can mark a chronically-failing camera
  // `degraded` from any non-online state. The existing `online -> degraded`
  // edge handled the steady-state case; the new edges cover the more common
  // crash-during-startup case.
  private readonly validTransitions: Record<string, string[]> = {
    offline: ['connecting', 'online'],
    connecting: ['online', 'offline', 'reconnecting', 'degraded'],
    // `connecting` added in Phase 19.1: StreamProcessor runs a FFmpeg job
    // for an already-online camera (BootRecovery re-enqueue, push+transcode
    // orphan cleanup, mid-stream profile change) — it needs to mark the
    // camera as transitional while FFmpeg warms up again.
    online: ['reconnecting', 'degraded', 'offline', 'connecting'],
    reconnecting: ['online', 'offline', 'connecting', 'degraded'],
    degraded: ['online', 'offline', 'connecting'],
  };

  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly statusGateway: StatusGateway,
    private readonly webhooksService: WebhooksService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @InjectQueue('camera-notify') private readonly notifyQueue: Queue,
    // 2026-04-30 self-healing trio (D): record transitions for the
    // streamHealth metrics block + adaptive miss-tolerance reset logic.
    // Optional so existing positional-construction tests still build.
    @Optional()
    private readonly healthMetrics?: StreamHealthMetricsService,
  ) {}

  async transition(cameraId: string, orgId: string, newStatus: string): Promise<void> {
    const camera = await this.prisma.camera.findFirst({ where: { id: cameraId, orgId } });
    if (!camera) {
      throw new Error(`Camera ${cameraId} not found`);
    }

    const currentStatus = camera.status;

    if (newStatus === currentStatus) {
      this.logger.debug(`No-op transition: ${currentStatus} -> ${newStatus} for camera ${cameraId}`);
      return;
    }

    const allowed = this.validTransitions[currentStatus] || [];

    // Always allow transition to 'offline' (user stop or max retries)
    if (newStatus !== 'offline' && !allowed.includes(newStatus)) {
      throw new Error(`Invalid transition: ${currentStatus} -> ${newStatus}`);
    }

    await this.prisma.camera.update({
      where: { id: cameraId },
      data: {
        status: newStatus,
        ...(newStatus === 'online' ? { lastOnlineAt: new Date() } : {}),
      },
    });

    // 2026-04-30: feed the StreamHealth ring buffer so snapshot() reports
    // accurate transitionsPerMinute / topFlapping5min / stuckReconnectingOver5min.
    this.healthMetrics?.recordTransition(cameraId, currentStatus, newStatus);

    // UI state stays live during maintenance per D-04 + D-15
    this.statusGateway.broadcastStatus(orgId, cameraId, newStatus);

    // Maintenance gate (D-15) — suppress ALL outbound notify/webhook.
    if (camera.maintenanceMode) {
      this.logger.debug(
        `Camera ${cameraId} in maintenance — suppressing outbound notify/webhook for ${newStatus}`,
      );
      return;
    }

    // Debounce outbound dispatch (D-04) — 30s window, replaced on each new transition.
    const notifiableStatuses = ['online', 'offline', 'degraded', 'reconnecting'];
    if (!notifiableStatuses.includes(newStatus)) {
      this.logger.log(`Camera ${cameraId}: ${currentStatus} -> ${newStatus}`);
      return;
    }

    const jobId = `camera:${cameraId}:notify`;
    const existing = await this.notifyQueue.getJob(jobId);
    if (existing) {
      await existing.remove().catch(() => {});
    }
    await this.notifyQueue.add(
      'dispatch',
      {
        orgId,
        cameraId,
        cameraName: camera.name,
        newStatus,
        previousStatus: currentStatus,
      },
      {
        jobId,
        delay: 30_000,
        removeOnComplete: true,
        removeOnFail: 10,
      },
    );

    this.logger.log(
      `Camera ${cameraId}: ${currentStatus} -> ${newStatus} (notify scheduled T+30s, jobId=${jobId})`,
    );
  }

  incrementViewers(cameraId: string): number {
    const count = (this.viewerCounts.get(cameraId) || 0) + 1;
    this.viewerCounts.set(cameraId, count);
    return count;
  }

  decrementViewers(cameraId: string): number {
    const count = Math.max(0, (this.viewerCounts.get(cameraId) || 0) - 1);
    this.viewerCounts.set(cameraId, count);
    return count;
  }

  getViewerCount(cameraId: string): number {
    return this.viewerCounts.get(cameraId) || 0;
  }
}
