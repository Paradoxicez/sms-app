// apps/api/src/cameras/stream-key.util.ts
//
// Phase 19.1 — Stream-key primitives.
// D-02: nanoid 21 chars (default URL-safe alphabet, ~128-bit entropy).
// D-07: plain storage, masking at non-owner surfaces, 4-char prefix in logs.
// Researcher-recommended nanoid v3.3.11 (CommonJS-safe for Node 22.11).

import { nanoid } from 'nanoid';

const STREAM_KEY_LENGTH = 21;

/** D-02: generate a 21-char URL-safe nanoid stream key. */
export function generateStreamKey(): string {
  return nanoid(STREAM_KEY_LENGTH);
}

/**
 * D-07: mask for non-owner surfaces — first-4 + ellipsis + last-4.
 * Defensive: keys of length ≤ 8 collapse to ellipsis only.
 */
export function maskStreamKey(key: string): string {
  if (!key || key.length <= 8) return '…';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** D-21: audit-log prefix — first 4 chars only, NEVER the full key. */
export function streamKeyPrefix(key: string): string {
  return (key ?? '').slice(0, 4);
}

/** D-01: canonical push URL template. */
export function buildPushUrl(host: string, key: string): string {
  return `rtmp://${host}:1935/push/${key}`;
}
