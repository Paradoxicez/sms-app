import { z } from 'zod';

export const UpdatePolicySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  ttlSeconds: z.number().int().min(0).nullable().optional(),
  maxViewers: z.number().int().min(0).nullable().optional(),
  domains: z.array(z.string()).optional(),
  allowNoReferer: z.boolean().nullable().optional(),
});

export type UpdatePolicyDto = z.infer<typeof UpdatePolicySchema>;
