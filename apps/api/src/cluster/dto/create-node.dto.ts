import { z } from 'zod';

export const CreateNodeSchema = z.object({
  name: z.string().min(1).max(100),
  apiUrl: z.string().url(),
  hlsUrl: z.string().url(),
  hlsPort: z.number().int().min(1).max(65535).optional().default(8080),
  isLocal: z.boolean().optional().default(true),
});

export type CreateNodeDto = z.infer<typeof CreateNodeSchema>;
