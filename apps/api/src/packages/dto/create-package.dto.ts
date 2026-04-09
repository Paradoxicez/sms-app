import { z } from 'zod';

export const CreatePackageSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  maxCameras: z.number().int().min(1),
  maxViewers: z.number().int().min(1),
  maxBandwidthMbps: z.number().int().min(1),
  maxStorageGb: z.number().int().min(1),
  features: z.record(z.boolean()).default({}),
});

export type CreatePackageDto = z.infer<typeof CreatePackageSchema>;
