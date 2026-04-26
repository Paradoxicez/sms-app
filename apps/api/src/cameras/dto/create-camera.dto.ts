import { z } from 'zod';
import { TAG_MAX_LENGTH, TAG_MAX_PER_CAMERA } from '../tag-normalize';

const STREAM_URL_ALLOWED_PREFIXES = ['rtsp://', 'rtmps://', 'rtmp://', 'srt://'] as const;

export const CreateCameraSchema = z
  .object({
    name: z.string().min(1).max(100),
    // Phase 19.1 D-04: ingestMode discriminator, defaults to pull (backward-compatible).
    ingestMode: z.enum(['pull', 'push']).default('pull'),
    // streamUrl is optional at DTO level because push mode lets the server generate it.
    // Per-mode enforcement (D-13) happens in the superRefine below.
    streamUrl: z.string().optional(),
    description: z.string().max(500).optional(),
    location: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .optional(),
    // Phase 22 D-04 / D-05: per-element trim + length limit, max-count cap.
    // Server-side normalization (case-insensitive dedup, first-seen casing)
    // happens later in the Prisma extension; the schema here only enforces
    // the hard input bounds.
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
    thumbnail: z.string().url().optional(),
    streamProfileId: z.string().uuid().optional(),
  })
  .superRefine((dto, ctx) => {
    if (dto.ingestMode === 'pull') {
      if (!dto.streamUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Pull cameras require a streamUrl',
          path: ['streamUrl'],
        });
        return;
      }
      // Reuse Phase 19's URL + allowlist check.
      try {
        // eslint-disable-next-line no-new
        new URL(dto.streamUrl);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid URL',
          path: ['streamUrl'],
        });
        return;
      }
      const urlOk = STREAM_URL_ALLOWED_PREFIXES.some((p) =>
        dto.streamUrl!.startsWith(p),
      );
      if (!urlOk) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Stream URL must be rtsp://, rtmps://, rtmp://, or srt://',
          path: ['streamUrl'],
        });
      }
    }
    if (dto.ingestMode === 'push') {
      // D-13: push rows must NOT supply streamUrl — server generates it.
      if (dto.streamUrl && dto.streamUrl.trim() !== '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Push cameras must leave streamUrl empty — a URL will be generated.',
          path: ['streamUrl'],
        });
      }
    }
  });

export type CreateCameraDto = z.infer<typeof CreateCameraSchema>;
