// Phase 19.1 D-01 semantics: ingestMode is immutable post-create.
// Changing modes is ambiguous (old streamKey orphaned? pull streamUrl
// deleted? rotate flow?) — service strips any ingestMode key submitted.
// .strict() below additionally rejects unknown keys at the zod layer.
import { z } from 'zod';

const STREAM_URL_ALLOWED_PREFIXES = ['rtsp://', 'rtmps://', 'rtmp://', 'srt://'] as const;

export const UpdateCameraSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    // ingestMode deliberately omitted — UpdateCameraDto cannot change it.
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
    // Camera move within the org — the Edit dialog's Site selector PATCHes
    // siteId to relocate a camera between sites of the same project.
    // RLS scopes the update to the caller's org; deeper cross-project
    // validation is enforced server-side when needed.
    siteId: z.string().uuid().optional(),
    // Phase 19.1 D-16: CodecMismatchBanner "Enable auto-transcode" PATCHes
    // this field to flip a push camera from Passthrough → Transcode after
    // a codec mismatch kick. Allowed in UpdateCameraDto so the banner's
    // fetch call passes strict-mode validation.
    needsTranscode: z.boolean().optional(),
  })
  .strict();

export type UpdateCameraDto = z.infer<typeof UpdateCameraSchema>;
