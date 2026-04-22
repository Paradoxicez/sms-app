import { z } from 'zod';

const STREAM_URL_ALLOWED_PREFIXES = ['rtsp://', 'rtmps://', 'rtmp://', 'srt://'] as const;

export const CreateCameraSchema = z.object({
  name: z.string().min(1).max(100),
  streamUrl: z
    .string()
    .url()
    .refine((url) => STREAM_URL_ALLOWED_PREFIXES.some((p) => url.startsWith(p)), {
      message: 'Stream URL must be rtsp://, rtmps://, rtmp://, or srt://',
    }),
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
