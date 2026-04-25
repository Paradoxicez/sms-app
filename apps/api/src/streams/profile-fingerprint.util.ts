import { createHash } from 'crypto';

export const FINGERPRINT_FIELDS = [
  'codec',
  'preset',
  'resolution',
  'fps',
  'videoBitrate',
  'audioCodec',
  'audioBitrate',
] as const;

export type FingerprintInput = {
  codec?: string | null;
  preset?: string | null;
  resolution?: string | null;
  fps?: number | null;
  videoBitrate?: string | null;
  audioCodec?: string | null;
  audioBitrate?: string | null;
} | null;

/**
 * Phase 21 D-01: deterministic fingerprint over the 7 FFmpeg-affecting fields.
 *
 * Canonical serialization: pipe-delimited `key=value` pairs in fixed field
 * order, null/undefined → literal 'null'. Output is `'sha256:' + 64-hex`
 * (71 chars). A null input (camera has no profile attached) returns the
 * sentinel `'sha256:none'` so D-02's "previously had no profile" comparison
 * always sees a mismatch against any real profile.
 *
 * Codebase precedent: createHash usage at api-keys.service.ts:25.
 * Source of truth: 21-RESEARCH.md §5.
 */
export function fingerprintProfile(profile: FingerprintInput): string {
  if (!profile) return 'sha256:none';
  const canonical = FINGERPRINT_FIELDS
    .map((k) => `${k}=${profile[k] ?? 'null'}`)
    .join('|');
  return 'sha256:' + createHash('sha256').update(canonical).digest('hex');
}
