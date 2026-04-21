/**
 * Phase 18 Plan 03 — CameraMapInner cluster iconCreateFunction tests.
 * Exercises the pure `createClusterIcon` helper directly with mocked
 * L.MarkerCluster child markers; the cluster-refresh behavior is verified
 * via manual VALIDATION.md check (Leaflet lifecycle — not unit-testable).
 * Plan 00 left 4 `it.todo` placeholders; this file flips them all (3 asserting,
 * 1 skipped with pointer to manual check per RESEARCH Assumption A4).
 */
import { describe, it, expect } from 'vitest';

import { onlineCamera, offlineCamera, degradedCamera, makeMapCamera } from '@/test-utils/camera-fixtures';
import { createClusterIcon, type ClusterLike } from './camera-map-inner';

void onlineCamera;
void offlineCamera;
void degradedCamera;
void makeMapCamera;

/** Minimal mock of L.MarkerCluster for iconCreateFunction input. */
function mockCluster(statuses: string[]): ClusterLike {
  return {
    getAllChildMarkers: () =>
      statuses.map((s) => ({ options: { cameraStatus: s } })),
    getChildCount: () => statuses.length,
  };
}

describe('CameraMapInner — cluster icons (Phase 18)', () => {
  it('UI-06: iconCreateFunction returns red bubble when any child has status=offline (D-16)', () => {
    const icon = createClusterIcon(mockCluster(['online', 'offline', 'online']));
    expect(icon.options.html).toContain('#ef4444');
    // Count rendered
    expect(icon.options.html).toContain('>3<');
    // aria-label mentions worst status
    expect(icon.options.html).toMatch(/aria-label="[^"]*worst status offline/);
  });

  it('UI-06: iconCreateFunction returns amber bubble when worst child is degraded/reconnecting', () => {
    const degraded = createClusterIcon(mockCluster(['online', 'degraded']));
    expect(degraded.options.html).toContain('#f59e0b');

    const reconnecting = createClusterIcon(mockCluster(['online', 'reconnecting']));
    expect(reconnecting.options.html).toContain('#f59e0b');
  });

  it('UI-06: iconCreateFunction returns green bubble when all children are online/connecting', () => {
    const icon = createClusterIcon(mockCluster(['online', 'online', 'connecting']));
    expect(icon.options.html).toContain('#22c55e');
  });

  // See VALIDATION.md Manual-Only §Cluster refresh — verifying
  // MarkerClusterGroup.refreshClusters() on child status change requires the
  // full Leaflet lifecycle which jsdom does not emulate (RESEARCH Assumption
  // A4). The unit-level guarantee here is that cluster color is a pure
  // function of child marker options; map rerender is the integration concern.
  it.skip('UI-06: cluster refresh triggered on camera status change — manual check only', () => {
    // Intentionally skipped — see comment above.
  });
});
