import { z } from 'zod';

export const CreatePolicySchema = z.object({
  level: z.enum(['SYSTEM', 'PROJECT', 'SITE', 'CAMERA']),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  ttlSeconds: z.number().int().min(0).optional(),
  maxViewers: z.number().int().min(0).optional(),
  domains: z.array(z.string()).optional(),
  allowNoReferer: z.boolean().optional(),
  rateLimit: z.number().int().min(0).optional(),
  cameraId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});

export type CreatePolicyDto = z.infer<typeof CreatePolicySchema>;
