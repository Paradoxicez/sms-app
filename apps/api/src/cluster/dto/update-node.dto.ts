import { z } from 'zod';

export const UpdateNodeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  apiUrl: z.string().url().optional(),
  hlsUrl: z.string().url().optional(),
  hlsPort: z.number().int().min(1).max(65535).optional(),
  isLocal: z.boolean().optional(),
});

export type UpdateNodeDto = z.infer<typeof UpdateNodeSchema>;
