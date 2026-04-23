// apps/api/src/cameras/serialize-camera.util.ts
//
// Phase 19.1 D-07: centralized masking contract for Camera responses.
// RESEARCH Pitfall 6: a single chokepoint prevents stream-key leakage when
// new endpoints are added. Every outbound Camera representation must flow
// through `serializeCamera(...)` — the controller's list + detail paths
// (perspective='owner') and any future cross-org / embed / audit surface
// (perspective='masked') share this function so the policy is enforced in
// one place.

import { maskStreamKey } from './stream-key.util';

export type CameraPerspective = 'owner' | 'masked';

/**
 * Perspective-aware camera serializer.
 *
 * - Pull cameras: passthrough (no key, no masking needed).
 * - Push cameras, `owner` perspective: passthrough — the caller is the
 *   owning org (enforced upstream via tenancy client). They need the raw
 *   key to copy into their encoder.
 * - Push cameras, `masked` perspective: streamKey is masked AND the same
 *   masked value is substituted into streamUrl so the URL cannot be used
 *   to recover the key.
 */
export function serializeCamera<
  T extends { streamKey?: string | null; streamUrl?: string; ingestMode?: string },
>(camera: T, options: { perspective: CameraPerspective }): T {
  if (!camera || !camera.streamKey || camera.ingestMode !== 'push') {
    return camera;
  }
  if (options.perspective === 'owner') {
    return camera;
  }

  const masked = maskStreamKey(camera.streamKey);
  const urlMasked =
    typeof camera.streamUrl === 'string'
      ? camera.streamUrl.replace(camera.streamKey, masked)
      : camera.streamUrl;
  return { ...camera, streamKey: masked, streamUrl: urlMasked };
}
