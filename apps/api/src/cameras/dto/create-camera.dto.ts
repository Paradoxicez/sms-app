import { z } from 'zod';

export const CreateCameraSchema = z.object({
  name: z.string().min(1).max(100),
  streamUrl: z.string().url().refine(
    (url) => url.startsWith('rtsp://') || url.startsWith('srt://'),
    { message: 'Stream URL must be rtsp:// or srt://' },
  ),
  description: z.string().max(500).optional(),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  tags: z.array(z.string()).optional(),
  thumbnail: z.string().url().optional(),
  streamProfileId: z.string().uuid().optional(),
});

export type CreateCameraDto = z.infer<typeof CreateCameraSchema>;
