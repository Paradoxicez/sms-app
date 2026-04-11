import { z } from 'zod';

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scope: z.enum(['PROJECT', 'SITE']),
  scopeId: z.string().uuid(),
});

export type CreateApiKeyDto = z.infer<typeof CreateApiKeySchema>;
