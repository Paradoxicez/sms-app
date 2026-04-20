import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/create-webhook.dto';
import { validateWebhookUrl } from './webhook-url.validator';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
    private readonly systemPrisma: SystemPrismaService,
    @InjectQueue('webhook-delivery') private readonly webhookQueue: Queue,
  ) {}

  async create(orgId: string, dto: CreateWebhookDto) {
    await validateWebhookUrl(dto.url);
    const secret = randomBytes(32).toString('hex');
    const subscription = await this.tenantPrisma.webhookSubscription.create({
      data: {
        orgId,
        name: dto.name,
        url: dto.url,
        secret,
        events: dto.events,
      },
    });
    // Return secret once on creation (like API key pattern)
    return { ...subscription, secret };
  }

  async findAll(orgId: string) {
    return this.tenantPrisma.webhookSubscription.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, orgId: string) {
    return this.tenantPrisma.webhookSubscription.findFirst({
      where: { id, orgId },
    });
  }

  async update(id: string, orgId: string, dto: UpdateWebhookDto) {
    if (dto.url) await validateWebhookUrl(dto.url);
    // Verify ownership before update
    const existing = await this.tenantPrisma.webhookSubscription.findFirst({
      where: { id, orgId },
    });
    if (!existing) return null;
    return this.tenantPrisma.webhookSubscription.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string, orgId: string) {
    // Verify ownership before delete
    const existing = await this.tenantPrisma.webhookSubscription.findFirst({
      where: { id, orgId },
    });
    if (!existing) return null;
    return this.tenantPrisma.webhookSubscription.delete({ where: { id } });
  }

  async getDeliveries(subscriptionId: string, orgId: string, limit = 50) {
    // Verify subscription belongs to org first
    const sub = await this.tenantPrisma.webhookSubscription.findFirst({
      where: { id: subscriptionId, orgId },
    });
    if (!sub) return [];
    return this.tenantPrisma.webhookDelivery.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Called by StatusService (via NotifyDispatchProcessor) when camera status
   * changes. Finds matching active subscriptions and queues BullMQ delivery jobs.
   *
   * Runs from a BullMQ worker — no CLS ORG_ID, so the tenancy extension would
   * skip set_config and RLS would deny rows. Use systemPrisma; orgId is already
   * the primary filter on the subscription lookup so cross-tenant leakage is
   * impossible.
   */
  async emitEvent(
    orgId: string,
    eventType: string,
    payload: Record<string, any>,
  ) {
    const subscriptions = await this.systemPrisma.webhookSubscription.findMany({
      where: {
        orgId,
        isActive: true,
        events: { has: eventType },
      },
    });

    for (const sub of subscriptions) {
      // Create delivery record. WebhookDelivery has no orgId column —
      // RLS scopes via the subscriptionId FK chain.
      const delivery = await this.systemPrisma.webhookDelivery.create({
        data: {
          subscriptionId: sub.id,
          eventType,
          payload,
        },
      });

      // Queue delivery job with custom backoff per D-10
      await this.webhookQueue.add(
        'deliver',
        {
          deliveryId: delivery.id,
          subscriptionId: sub.id,
          url: sub.url,
          secret: sub.secret,
          eventType,
          payload,
        },
        {
          attempts: 5,
          backoff: { type: 'custom' },
          removeOnComplete: { age: 86400 },
          removeOnFail: { age: 604800 },
        },
      );
    }

    this.logger.log(
      `Emitted ${eventType} to ${subscriptions.length} subscriptions for org ${orgId}`,
    );
  }
}
