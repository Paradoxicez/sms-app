import { z } from 'zod';

export const UpdateCameraSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  streamUrl: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith('rtsp://') || url.startsWith('srt://'),
      { message: 'Stream URL must be rtsp:// or srt://' },
    )
    .optional(),
  description: z.string().max(500).optional().nullable(),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional()
    .nullable(),
  tags: z.array(z.string()).optional(),
  thumbnail: z.string().url().optional().nullable(),
  streamProfileId: z.string().uuid().optional().nullable(),
});

export type UpdateCameraDto = z.infer<typeof UpdateCameraSchema>;
