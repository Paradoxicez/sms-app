import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
    private readonly prisma: PrismaService,
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
