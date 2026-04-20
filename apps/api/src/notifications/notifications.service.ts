import { Inject, Injectable, Logger } from '@nestjs/common';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
    private readonly systemPrisma: SystemPrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async createForCameraEvent(
    orgId: string,
    cameraId: string,
    status: string,
    cameraName: string,
  ): Promise<void> {
    const eventType = `camera.${status}`;

    // Worker context (NotifyDispatchProcessor) — no CLS ORG_ID, must use
    // systemPrisma. orgId is in the where clause / data payload as defense
    // in depth.
    const preferences = await this.systemPrisma.notificationPreference.findMany({
      where: { orgId, eventType, enabled: true },
    });

    let userIds = preferences.map((p: any) => p.userId);

    if (userIds.length === 0) {
      const members = await this.systemPrisma.member.findMany({
        where: { organizationId: orgId },
        select: { userId: true },
      });
      userIds = members.map((m: any) => m.userId);
    }

    if (userIds.length === 0) return;

    for (const userId of userIds) {
      try {
        const notification = await this.systemPrisma.notification.create({
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
    // System alert path — also reachable from worker context (storage quota
    // alerts via RecordingsService.checkAndAlertStorageQuota). Use systemPrisma;
    // orgId is in the where clause / data payload as defense in depth.
    const members = await this.systemPrisma.member.findMany({
      where: {
        organizationId: orgId,
        role: { in: ['owner', 'admin'] },
      },
      select: { userId: true },
    });

    if (members.length === 0) {
      this.logger.log(
        `System alert for org ${orgId}: ${title} (no admin/owner members found)`,
      );
      return;
    }

    for (const member of members) {
      try {
        const notification = await this.systemPrisma.notification.create({
          data: {
            orgId,
            userId: member.userId,
            type: 'system.alert',
            title,
            body,
            data: data ?? {},
          },
        });

        this.gateway.sendToUser(member.userId, notification);
      } catch (err: any) {
        this.logger.warn(
          `Failed to create system alert for user ${member.userId}: ${err.message}`,
        );
      }
    }
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

    const items = await this.tenantPrisma.notification.findMany({
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
    await this.tenantPrisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.tenantPrisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async clearAll(userId: string): Promise<void> {
    await this.tenantPrisma.notification.deleteMany({
      where: { userId },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.tenantPrisma.notification.count({
      where: { userId, read: false },
    });
  }

  async getPreferences(userId: string, orgId: string): Promise<any[]> {
    return this.tenantPrisma.notificationPreference.findMany({
      where: { userId, orgId },
    });
  }

  async updatePreference(
    userId: string,
    orgId: string,
    eventType: string,
    enabled: boolean,
  ): Promise<any> {
    return this.tenantPrisma.notificationPreference.upsert({
      where: {
        userId_orgId_eventType: { userId, orgId, eventType },
      },
      create: { userId, orgId, eventType, enabled },
      update: { enabled },
    });
  }
}
