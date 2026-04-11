import { describe, it, expect } from 'vitest';

describe('WebhooksService', () => {
  it.todo('should create subscription with HMAC secret');
  it.todo('should validate webhook URL is HTTPS');
  it.todo('should block localhost and private IP URLs (SSRF)');
  it.todo('should list subscriptions without exposing secret');
  it.todo('should emit events to matching active subscriptions');
  it.todo('should not emit to inactive subscriptions');
  it.todo('should not emit to subscriptions not matching event type');
});

describe('WebhooksController', () => {
  it.todo('POST /api/webhooks creates subscription');
  it.todo('GET /api/webhooks lists subscriptions for org');
  it.todo('GET /api/webhooks/:id/deliveries returns delivery log');
  it.todo('DELETE /api/webhooks/:id deletes subscription');
  it.todo('requires FeatureKey.WEBHOOKS feature toggle');
});

describe('WebhookDeliveryProcessor', () => {
  it.todo('should POST payload to webhook URL');
  it.todo('should include X-Webhook-Signature header');
  it.todo('should include X-Webhook-Event header');
  it.todo('should timeout after 10 seconds');
  it.todo('should retry up to 5 times with exponential backoff');
  it.todo('should mark delivery as completed on 2xx response');
  it.todo('should mark delivery as failed after 5 attempts');
});
