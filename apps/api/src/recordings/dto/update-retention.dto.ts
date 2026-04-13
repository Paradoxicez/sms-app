import { z } from 'zod';

export const updateRetentionSchema = z.object({
  cameraId: z.string().uuid(),
  retentionDays: z.number().int().min(1).max(365).nullable(), // null = use org default
});

export type UpdateRetentionDto = z.infer<typeof updateRetentionSchema>;
