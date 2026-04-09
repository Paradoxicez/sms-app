import { z } from 'zod';

export const UpdateOrgSettingsSchema = z.object({
  defaultProfileId: z.string().uuid().optional().nullable(),
  maxReconnectAttempts: z.number().int().min(1).max(100).optional(),
  autoStartOnBoot: z.boolean().optional(),
  defaultRecordingMode: z.enum(['none', 'continuous', 'motion']).optional(),
});

export type UpdateOrgSettingsDto = z.infer<typeof UpdateOrgSettingsSchema>;
