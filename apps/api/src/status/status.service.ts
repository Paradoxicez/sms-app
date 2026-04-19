import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { StatusGateway } from './status.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);
  private viewerCounts = new Map<string, number>();

  private readonly validTransitions: Record<string, string[]> = {
    offline: ['connecting'],
    connecting: ['online', 'offline'],
    online: ['reconnecting', 'degraded', 'offline'],
    reconnecting: ['online', 'offline'],
    degraded: ['online', 'offline'],
  };

  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
    private readonly statusGateway: StatusGateway,
    private readonly webhooksService: WebhooksService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @InjectQueue('camera-notify') private readonly notifyQueue: Queue,
  ) {}

  async transition(cameraId: string, orgId: string, newStatus: string): Promise<void> {
    const camera = await this.prisma.camera.findUnique({ where: { id: cameraId } });
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
