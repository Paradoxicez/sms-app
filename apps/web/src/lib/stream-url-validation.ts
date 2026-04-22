/**
 * D-15: Client-side live validation mirroring backend zod refine in create-camera.dto.ts.
 * Duplicated vs shared to avoid zod 3/4 cross-package risk (RESEARCH Pitfall 4).
 * Also consumed by P07 bulk-import-dialog validateRow.
 */

export const ALLOWED_PREFIXES = ['rtsp://', 'rtmps://', 'rtmp://', 'srt://'] as const;

export const HELPER_TEXT = 'Supported: rtsp://, rtmps://, rtmp://, srt://';

export const ERROR_PREFIX = 'URL must start with rtsp://, rtmps://, rtmp://, or srt://';
export const ERROR_HOST = 'Invalid URL — check host and path';

/**
 * Returns an error message string if the URL is invalid, or null if valid (or empty).
 * Empty strings return null — the HTML `required` attribute + disabled Save button
 * handle the "not yet typed anything" case without showing a premature error.
 */
export function validateStreamUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (!ALLOWED_PREFIXES.some((p) => trimmed.startsWith(p))) {
    return ERROR_PREFIX;
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) return ERROR_HOST;
  } catch {
    return ERROR_HOST;
  }

  return null;
}
