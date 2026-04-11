import { z } from 'zod';

export const BatchSessionsSchema = z.object({
  cameraIds: z.array(z.string().uuid()).min(1).max(50),
});

export type BatchSessionsDto = z.infer<typeof BatchSessionsSchema>;
