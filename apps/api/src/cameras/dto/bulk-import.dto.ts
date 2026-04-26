import { z } from 'zod';

const STREAM_URL_ALLOWED_PREFIXES = ['rtsp://', 'rtmps://', 'rtmp://', 'srt://'] as const;

export const BulkImportCameraSchema = z
  .object({
    name: z.string().min(1).max(100),
    // D-12: ingestMode column; defaults to 'pull' for backward-compat with existing CSVs.
    ingestMode: z.enum(['pull', 'push']).default('pull'),
    streamUrl: z.string().optional(),
    description: z.string().max(500).optional(),
    location: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .optional(),
    tags: z.array(z.string()).optional(),
    streamProfileId: z.string().uuid().optional(),
  })
  .superRefine((row, ctx) => {
    if (row.ingestMode === 'pull') {
      if (!row.streamUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Pull rows require streamUrl',
          path: ['streamUrl'],
        });
        return;
      }
      try {
        // eslint-disable-next-line no-new
        new URL(row.streamUrl);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid URL',
          path: ['streamUrl'],
        });
        return;
      }
      const urlOk = STREAM_URL_ALLOWED_PREFIXES.some((p) => row.streamUrl!.startsWith(p));
      if (!urlOk) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Stream URL must be rtsp://, rtmps://, rtmp://, or srt://',
          path: ['streamUrl'],
        });
      }
    }
    if (row.ingestMode === 'push') {
      // D-13: push rows MUST leave streamUrl empty.
      if (row.streamUrl && row.streamUrl.trim() !== '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Push rows must leave streamUrl empty — a URL will be generated.',
          path: ['streamUrl'],
        });
      }
    }
  });

export const BulkImportSchema = z.object({
  cameras: z.array(BulkImportCameraSchema).min(1).max(500),
  siteId: z.string().uuid(),
});

export type BulkImportCameraDto = z.infer<typeof BulkImportCameraSchema>;
export type BulkImportDto = z.infer<typeof BulkImportSchema>;
