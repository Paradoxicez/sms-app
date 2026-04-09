import { z } from 'zod';

export const UpdateSystemSettingsSchema = z.object({
  hlsFragment: z.number().int().min(1).max(10).optional(),
  hlsWindow: z.number().int().min(5).max(120).optional(),
  hlsEncryption: z.boolean().optional(),
  rtmpPort: z.number().int().min(1024).max(65535).optional(),
  srtPort: z.number().int().min(1024).max(65535).optional(),
  timeoutSeconds: z.number().int().min(5).max(300).optional(),
});

export type UpdateSystemSettingsDto = z.infer<typeof UpdateSystemSettingsSchema>;
