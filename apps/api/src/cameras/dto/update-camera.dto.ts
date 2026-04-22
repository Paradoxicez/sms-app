import { z } from 'zod';

const STREAM_URL_ALLOWED_PREFIXES = ['rtsp://', 'rtmps://', 'rtmp://', 'srt://'] as const;

export const UpdateCameraSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  streamUrl: z
    .string()
    .url()
    .refine((url) => STREAM_URL_ALLOWED_PREFIXES.some((p) => url.startsWith(p)), {
      message: 'Stream URL must be rtsp://, rtmps://, rtmp://, or srt://',
    })
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
