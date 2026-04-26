import { z } from 'zod';
import { TAG_MAX_LENGTH } from '../tag-normalize';

/**
 * Phase 22 Plan 22-06 (D-11, D-12, D-13) — DTO for bulk tag operations.
 *
 * Single-tag-per-action keeps the API simple (D-11): one POST applies one
 * action ('add' | 'remove') with one `tag` value to N cameras. Combining
 * multiple actions or multi-tag mutations into one request was rejected
 * because (a) the bulk toolbar UX in Phase 20 already surfaces two distinct
 * "Add tag" / "Remove tag" buttons, (b) audit traceability gets muddled if a
 * single request both adds and removes from the same camera, and (c) the
 * server-side per-camera transaction loop stays trivial.
 *
 * Validation rules:
 *   • cameraIds: 1..500 uuids — empty rejected (D-13: nothing to do); 500
 *     cap matches BulkImportSchema and bounds the per-row audit/transaction
 *     loop runtime (T-22-07 acceptance threshold).
 *   • action: enum 'add' | 'remove' — anything else (e.g. 'replace') 400s.
 *   • tag: trimmed, 1..TAG_MAX_LENGTH chars — empty/whitespace rejected,
 *     over-length rejected (matches single-camera + bulk-import bounds).
 *
 * The DTO mirrors the validation shape of CreateCameraDto's `tags` element
 * but applies to ONE tag per action (single string, not array). The service
 * layer (CamerasService.bulkTagAction) handles case-insensitive dedup
 * against each camera's existing tags array.
 */
export const bulkTagsDtoSchema = z.object({
  cameraIds: z
    .array(z.string().uuid())
    .min(1, 'Select at least one camera')
    .max(500, 'Maximum 500 cameras per request'),
  action: z.enum(['add', 'remove']),
  tag: z
    .string()
    .trim()
    .min(1, 'Tag must not be empty')
    .max(TAG_MAX_LENGTH, `Tag must be ${TAG_MAX_LENGTH} characters or fewer`),
});

export type BulkTagsDto = z.infer<typeof bulkTagsDtoSchema>;
