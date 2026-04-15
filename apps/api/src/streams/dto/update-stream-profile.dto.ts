import { z } from 'zod';

export const UpdateStreamProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  codec: z.enum(['auto', 'copy', 'libx264']).optional(),
  preset: z
    .enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'])
    .optional()
    .nullable(),
  resolution: z
    .string()
    .regex(/^\d+x\d+$/)
    .optional()
    .nullable(),
  fps: z.number().int().min(1).max(60).optional().nullable(),
  videoBitrate: z
    .string()
    .regex(/^\d+k$/)
    .optional()
    .nullable(),
  audioCodec: z.enum(['aac', 'copy', 'mute']).optional(),
  audioBitrate: z
    .string()
    .regex(/^\d+k$/)
    .optional()
    .nullable(),
  isDefault: z.boolean().optional(),
});

export type UpdateStreamProfileDto = z.infer<typeof UpdateStreamProfileSchema>;
