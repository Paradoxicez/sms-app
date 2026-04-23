// apps/web/src/lib/stream-key-mask.ts
//
// Phase 19.1 D-07 — client-side mirror of apps/api/src/cameras/stream-key.util.maskStreamKey.
// Shared mask format so server and client display identical representations.

/**
 * Mask a stream key for non-owner display surfaces.
 * first-4 + ellipsis + last-4, matching backend `maskStreamKey`.
 * Defensive: keys of length ≤ 8 collapse to ellipsis only.
 */
export function maskStreamKey(key: string | null | undefined): string {
  if (!key || key.length <= 8) return "…"
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}

/**
 * Replace the last /push/<key> segment of an RTMP URL with the masked key.
 *
 *   Input:  rtmp://host:1935/push/abcdefghijklmnopqrstu
 *   Output: rtmp://host:1935/push/abcd…qrstu
 *
 * Returns the original URL if it does not end in /push/<key>, so this is safe
 * to call on mixed pull/push URLs (pull URLs pass through unchanged).
 */
export function maskStreamUrl(url: string | null | undefined): string {
  if (!url) return ""
  const match = url.match(/\/push\/([A-Za-z0-9_-]+)$/)
  if (!match) return url
  const key = match[1]
  return url.replace(key, maskStreamKey(key))
}
