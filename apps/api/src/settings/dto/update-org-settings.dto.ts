import { z } from 'zod';

export const UpdateOrgSettingsSchema = z.object({
  defaultRetentionDays: z.number().int().min(1).max(3650).optional(),
});

export type UpdateOrgSettingsDto = z.infer<typeof UpdateOrgSettingsSchema>;
