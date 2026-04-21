/**
 * Phase 18 Wave 0 — CameraMapInner cluster icon + refresh test stubs.
 * Every `it.todo` maps to UI-06 / D-16 verifiable behavior.
 * Plan 04 implementation will flip these against the existing
 * apps/web/src/components/map/camera-map-inner.tsx.
 */
import { describe, it } from 'vitest';

import { onlineCamera, offlineCamera, degradedCamera, makeMapCamera } from '@/test-utils/camera-fixtures';
void onlineCamera;
void offlineCamera;
void degradedCamera;
void makeMapCamera;

describe('CameraMapInner — cluster icons (Phase 18)', () => {
  it.todo('UI-06: iconCreateFunction returns red bubble when any child has status=offline (D-16)');
  it.todo('UI-06: iconCreateFunction returns amber bubble when worst child is degraded/reconnecting');
  it.todo('UI-06: iconCreateFunction returns green bubble when all children are online/connecting');
  it.todo('UI-06: cluster refresh triggered on camera status change');
});
