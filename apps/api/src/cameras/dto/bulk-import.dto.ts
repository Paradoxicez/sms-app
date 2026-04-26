import { z } from 'zod';
import { TAG_MAX_LENGTH, TAG_MAX_PER_CAMERA } from '../tag-normalize';

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
    // Phase 22 D-10: bulk-import keeps comma/semicolon parsing client-side
    // (in apps/web/.../bulk-import-dialog.tsx); server-side enforcement is
    // identical to single-camera writes — same TAG_MAX_LENGTH +
    // TAG_MAX_PER_CAMERA from tag-normalize.ts.
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Tag must not be empty')
          .max(TAG_MAX_LENGTH, `Tag must be ${TAG_MAX_LENGTH} characters or fewer`),
      )
      .max(TAG_MAX_PER_CAMERA, `Maximum ${TAG_MAX_PER_CAMERA} tags per camera`)
      .optional(),
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
