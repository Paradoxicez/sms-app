import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { forwardRef, Inject } from '@nestjs/common';
import { SystemPrismaService } from '../../prisma/system-prisma.service';
import { WebhooksService } from '../../webhooks/webhooks.service';
import { NotificationsService } from '../../notifications/notifications.service';

export interface NotifyDispatchJobData {
  orgId: string;
  cameraId: string;
  cameraName: string;
  newStatus: string;
  previousStatus: string;
}

@Processor('camera-notify')
export class NotifyDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(NotifyDispatchProcessor.name);

  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly webhooksService: WebhooksService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<NotifyDispatchJobData>): Promise<void> {
    const { orgId, cameraId, cameraName, newStatus, previousStatus } = job.data;

    const camera = await this.prisma.camera.findUnique({ where: { id: cameraId } });
    if (!camera) {
      this.logger.debug(`notify-dispatch: camera ${cameraId} gone — skip`);
      return;
    }
    if (camera.maintenanceMode) {
      this.logger.debug(
        `notify-dispatch: maintenance ON at dispatch time for ${cameraId} — suppress`,
      );
      return;
    }
    if (camera.status !== newStatus) {
      this.logger.debug(
        `notify-dispatch: status drifted ${newStatus} -> ${camera.status} for ${cameraId} — suppress stale`,
      );
      return;
    }

    await this.webhooksService
      .emitEvent(orgId, `camera.${newStatus}`, {
        cameraId,
        status: newStatus,
        previousStatus,
        timestamp: new Date().toISOString(),
        // D-22 (Plan 22-03): tag-based webhook subscribers need tags in payload.
        // Display casing preserved per D-04 (camera.tags is canonical user-facing array,
        // not tagsNormalized). `?? []` guards against null/undefined; the camera record
        // is loaded via findUnique without `select`, so tags is always populated.
        // Description and cameraName intentionally excluded per D-22 (human-facing,
        // not machine-actionable).
        tags: camera.tags ?? [],
      })
      .catch((err: Error) => {
        this.logger.warn(
          `notify-dispatch: webhook emit failed for ${cameraId}: ${err.message}`,
        );
      });

    await this.notificationsService
      .createForCameraEvent(orgId, cameraId, newStatus, cameraName)
      .catch((err: Error) => {
        this.logger.warn(
          `notify-dispatch: notification create failed for ${cameraId}: ${err.message}`,
        );
      });

    this.logger.log(`notify-dispatch: delivered camera.${newStatus} for ${cameraId}`);
  }
}
