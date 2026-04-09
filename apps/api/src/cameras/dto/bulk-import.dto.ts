import { z } from 'zod';

export const BulkImportCameraSchema = z.object({
  name: z.string().min(1).max(100),
  streamUrl: z.string().refine(
    (url) => url.startsWith('rtsp://') || url.startsWith('srt://'),
    { message: 'Stream URL must be rtsp:// or srt://' },
  ),
  projectName: z.string().optional(),
  siteName: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  tags: z.string().optional(), // comma-separated
  description: z.string().optional(),
});

export const BulkImportSchema = z.object({
  cameras: z.array(BulkImportCameraSchema).min(1).max(500),
  siteId: z.string().uuid(),
});

export type BulkImportCameraDto = z.infer<typeof BulkImportCameraSchema>;
export type BulkImportDto = z.infer<typeof BulkImportSchema>;
