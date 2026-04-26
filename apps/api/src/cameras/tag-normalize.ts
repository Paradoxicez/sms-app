// Phase 22 D-04 / D-05: pure helpers for camera tag normalization.
// Source: 22-RESEARCH.md §"Code Examples → Tag normalization (pure helpers)".
//
// Two normalization shapes:
//   • normalizeForDisplay(raw)  → trims, rejects empty, dedups case-insensitively
//                                 (preserving FIRST-SEEN casing), enforces
//                                 TAG_MAX_LENGTH + TAG_MAX_PER_CAMERA. Used by
//                                 DTO refinement and the bulk-tag service.
//   • normalizeForDb(raw)       → lowercases, trims, dedups, drops empty.
//                                 No length/count enforcement (used both by the
//                                 Prisma write extension to mirror tags →
//                                 tagsNormalized AND by filter input where
//                                 long-tag rejection would break legitimate
//                                 queries against rows created before validation).
//
// Both helpers are PURE — no I/O, safe to import anywhere (DTO, service, tests).

export const TAG_MAX_LENGTH = 50;
export const TAG_MAX_PER_CAMERA = 20;

export class TagValidationError extends Error {
  constructor(public reason: 'too_long' | 'too_many' | 'empty') {
    super(`Tag validation failed: ${reason}`);
    this.name = 'TagValidationError';
  }
}

/**
 * Normalize incoming tag array for storage in Camera.tags (display field).
 * - trims each tag
 * - rejects empty / whitespace-only
 * - case-insensitive dedup, preserving FIRST-SEEN casing
 * - enforces TAG_MAX_LENGTH (per element) and TAG_MAX_PER_CAMERA (per array)
 *
 * Throws TagValidationError on length/count violations so callers can map
 * to the right HTTP error (DTO Zod refinement does both checks pre-call;
 * service-layer callers — bulkTagAction — get a typed error to translate).
 */
export function normalizeForDisplay(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tagRaw of raw) {
    const trimmed = tagRaw.trim();
    if (!trimmed) continue;
    if (trimmed.length > TAG_MAX_LENGTH) {
      throw new TagValidationError('too_long');
    }
    const k = trimmed.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(trimmed);
  }
  if (out.length > TAG_MAX_PER_CAMERA) {
    throw new TagValidationError('too_many');
  }
  return out;
}

/**
 * Normalize for the lowercase shadow column / for filter input.
 * - lowercases (Unicode-safe via String.prototype.toLowerCase)
 * - trims
 * - dedups (case-insensitive)
 * - drops empty
 *
 * Does NOT enforce length/count — that's the writer's job; this helper is
 * also called from filter input where length checks would break legitimate
 * queries that match longer tags created before validation existed.
 */
export function normalizeForDb(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tagRaw of raw) {
    const k = tagRaw.trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}
