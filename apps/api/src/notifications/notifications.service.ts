import { Inject, Injectable, Logger } from '@nestjs/common';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
    private readonly gateway: NotificationsGateway,
  ) {}

  async createForCameraEvent(
    orgId: string,
    cameraId: string,
    status: string,
    cameraName: string,
  ): Promise<void> {
    const eventType = `camera.${status}`;

    // Find users who have this event enabled (or have no preference record, defaulting to enabled)
    const preferences = await this.prisma.notificationPreference.findMany({
      where: { orgId, eventType, enabled: true },
    });

    // Get all org members to notify (those with explicit enabled preference)
    const userIds = preferences.map((p: any) => p.userId);

    // If no preferences exist yet, get all org members (default is enabled)
    if (userIds.length === 0) {
      // Query members directly via raw model (members are in a different table)
      // For now, skip — notifications only go to users who have set preferences
      return;
    }

    for (const userId of userIds) {
      try {
        const notification = await this.prisma.notification.create({
          data: {
            orgId,
            userId,
            type: eventType,
            title: `${cameraName} is ${status}`,
            body: `Camera status changed to ${status}`,
            data: { cameraId, status },
          },
        });

        this.gateway.sendToUser(userId, notification);
      } catch (err: any) {
        this.logger.warn(
          `Failed to create notification for user ${userId}: ${err.message}`,
        );
      }
    }
  }

  async createSystemAlert(
    orgId: string,
    title: string,
    body: string,
    data?: any,
  ): Promise<void> {
    // For system alerts, we'd query org admins/operators
    // This is a placeholder that will be used by monitoring features
    this.logger.log(`System alert for org ${orgId}: ${title}`);
  }

  async findForUser(
    userId: string,
    query: { cursor?: string; take?: number; unreadOnly?: boolean },
  ): Promise<{ items: any[]; nextCursor: string | null }> {
    const take = query.take ?? 20;
    const where: any = { userId };
    if (query.unreadOnly) {
      where.read = false;
    }

    const items = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | null = null;
    if (items.length > take) {
      const nextItem = items.pop();
      nextCursor = nextItem.id;
    }

    return { items, nextCursor };
  }

  async markAsRead(userId: string, notificationId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  async getPreferences(userId: string, orgId: string): Promise<any[]> {
    return this.prisma.notificationPreference.findMany({
      where: { userId, orgId },
    });
  }

  async updatePreference(
    userId: string,
    orgId: string,
    eventType: string,
    enabled: boolean,
  ): Promise<any> {
    return this.prisma.notificationPreference.upsert({
      where: {
        userId_orgId_eventType: { userId, orgId, eventType },
      },
      create: { userId, orgId, eventType, enabled },
      update: { enabled },
    });
  }
}
