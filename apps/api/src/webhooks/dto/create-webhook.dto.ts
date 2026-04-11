import { z } from 'zod';

const VALID_EVENTS = [
  'camera.online',
  'camera.offline',
  'camera.degraded',
  'camera.reconnecting',
] as const;

export const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.enum(VALID_EVENTS)).min(1),
});

export const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.enum(VALID_EVENTS)).min(1).optional(),
  isActive: z.boolean().optional(),
});

export type CreateWebhookDto = z.infer<typeof CreateWebhookSchema>;
export type UpdateWebhookDto = z.infer<typeof UpdateWebhookSchema>;
