import { Inject, Injectable, Logger } from '@nestjs/common';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { StatusGateway } from './status.gateway';

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
  ) {}

  async transition(cameraId: string, orgId: string, newStatus: string): Promise<void> {
    const camera = await this.prisma.camera.findUnique({ where: { id: cameraId } });
    if (!camera) {
      throw new Error(`Camera ${cameraId} not found`);
    }

    const currentStatus = camera.status;
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

    this.statusGateway.broadcastStatus(orgId, cameraId, newStatus);
    this.logger.log(`Camera ${cameraId}: ${currentStatus} -> ${newStatus}`);
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
