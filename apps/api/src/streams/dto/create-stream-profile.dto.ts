import { z } from 'zod';

export const CreateStreamProfileSchema = z.object({
  name: z.string().min(1).max(100),
  codec: z.enum(['auto', 'copy', 'libx264']).default('auto'),
  preset: z
    .enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'])
    .optional()
    .default('veryfast'),
  resolution: z
    .string()
    .regex(/^\d+x\d+$/)
    .optional(),
  fps: z.number().int().min(1).max(60).optional(),
  videoBitrate: z
    .string()
    .regex(/^\d+k$/)
    .optional(),
  audioCodec: z.enum(['aac', 'copy', 'mute']).default('aac'),
  audioBitrate: z
    .string()
    .regex(/^\d+k$/)
    .optional()
    .default('128k'),
  isDefault: z.boolean().optional().default(false),
});

export type CreateStreamProfileDto = z.infer<typeof CreateStreamProfileSchema>;
