import { z } from 'zod';

export const updatePreferenceSchema = z.object({
  eventType: z.enum([
    'camera.online',
    'camera.offline',
    'camera.degraded',
    'camera.reconnecting',
    'system.alert',
  ]),
  enabled: z.boolean(),
});

export type UpdatePreferenceDto = z.infer<typeof updatePreferenceSchema>;
