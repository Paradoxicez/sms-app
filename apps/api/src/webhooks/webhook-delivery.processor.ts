import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHmac } from 'crypto';
import { SystemPrismaService } from '../prisma/system-prisma.service';

// Custom backoff delays per D-10: ~1m, 5m, 30m, 2h, 12h
const WEBHOOK_DELAYS = [60000, 300000, 1800000, 7200000, 43200000];

@Processor('webhook-delivery', {
  settings: {
    backoffStrategy: (attemptsMade: number) =>
      WEBHOOK_DELAYS[attemptsMade - 1] || 43200000,
  },
})
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  /**
   * BullMQ worker — runs without an HTTP request, so CLS has no ORG_ID.
   * Uses SystemPrismaService (RLS-bypass via DB superuser role) for the
   * webhookDelivery.update calls. WebhookDelivery has no orgId column —
   * RLS scopes via the subscriptionId FK chain — so no explicit orgId
   * scoping is possible at this layer. Lookups are by primary key
   * (deliveryId from the BullMQ job, which was created by an org-scoped
   * emitEvent call upstream), which is sufficient.
   */
  constructor(private readonly prisma: SystemPrismaService) {
    super();
  }

  async process(job: Job) {
    const { deliveryId, url, secret, eventType, payload } = job.data;

    const bodyStr = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signaturePayload = `${timestamp}.${bodyStr}`;
    const signature = createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('hex');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout per Pitfall 4

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `t=${timestamp},v1=${signature}`,
          'X-Webhook-Event': eventType,
          'X-Webhook-Delivery': deliveryId,
        },
        body: bodyStr,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseBody = await response.text().catch(() => '');

      // Update delivery record
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          responseStatus: response.status,
          responseBody: responseBody.slice(0, 1000), // Limit stored response
          attempts: job.attemptsMade + 1,
          lastAttemptAt: new Date(),
          ...(response.ok ? { completedAt: new Date() } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`Webhook delivery failed: HTTP ${response.status}`);
      }

      this.logger.log(
        `Webhook delivered: ${deliveryId} -> ${url} (${response.status})`,
      );
    } catch (err: any) {
      clearTimeout(timeout);

      // Update delivery with failure info
      await this.prisma.webhookDelivery
        .update({
          where: { id: deliveryId },
          data: {
            attempts: job.attemptsMade + 1,
            lastAttemptAt: new Date(),
            ...(job.attemptsMade + 1 >= 5 ? { failedAt: new Date() } : {}),
          },
        })
        .catch(() => {});

      this.logger.warn(
        `Webhook delivery failed: ${deliveryId} -> ${url}: ${err.message}`,
      );
      throw err; // Re-throw to trigger BullMQ retry
    }
  }
}
