/**
 * Phase 18 — Shared camera fixtures for all dashboard + map tests.
 *
 * Extends DashboardCamera (use-dashboard-stats.ts) and MapCamera (camera-map.tsx)
 * with the Phase 18 fields that land across Plans 01–05:
 *   - isRecording           (D-14, D-18, D-19)
 *   - maintenanceMode       (D-14, D-18, D-19)
 *   - maintenanceEnteredBy  (schema field — prisma/schema.prisma:223 — NOT "Enabled")
 *   - maintenanceEnteredAt  (schema field — prisma/schema.prisma:224 — NOT "Enabled")
 *   - lastOnlineAt          (D-19 — offline timestamp)
 *   - retentionDays         (D-19 — recording retention badge)
 *
 * Field-spelling rule: `maintenanceEnteredBy` / `maintenanceEnteredAt` (schema spelling).
 * RESEARCH Pitfall 5: the old "Enabled"-prefixed naming was renamed in Phase 15.
 * Downstream tests grep this file for the schema spelling — stay consistent.
 *
 * Usage:
 *   import { onlineCamera, makeDashboardCamera } from '@/test-utils/camera-fixtures';
 */

import type { DashboardCamera } from '@/hooks/use-dashboard-stats';
import type { MapCamera } from '@/components/map/camera-map';

/** DashboardCamera extended with Phase 18 flags. */
export interface DashboardCameraExt extends DashboardCamera {
  isRecording: boolean;
  maintenanceMode: boolean;
  maintenanceEnteredBy: string | null;
  maintenanceEnteredAt: string | null;
  retentionDays: number | null;
}

/** MapCamera extended with Phase 18 flags + offline/recording metadata. */
export interface MapCameraExt extends MapCamera {
  isRecording: boolean;
  maintenanceMode: boolean;
  maintenanceEnteredBy: string | null;
  maintenanceEnteredAt: string | null;
  lastOnlineAt: string | null;
  retentionDays: number | null;
}

const BASE_DASHBOARD: DashboardCameraExt = {
  id: 'cam-base',
  name: 'Base Camera',
  status: 'online',
  lastOnlineAt: '2026-04-21T00:00:00.000Z',
  viewerCount: 0,
  bandwidth: 0,
  isRecording: false,
  maintenanceMode: false,
  maintenanceEnteredBy: null,
  maintenanceEnteredAt: null,
  retentionDays: null,
};

const BASE_MAP: MapCameraExt = {
  id: 'cam-base',
  name: 'Base Camera',
  status: 'online',
  latitude: 13.7563,
  longitude: 100.5018,
  viewerCount: 0,
  isRecording: false,
  maintenanceMode: false,
  maintenanceEnteredBy: null,
  maintenanceEnteredAt: null,
  lastOnlineAt: '2026-04-21T00:00:00.000Z',
  retentionDays: null,
};

/** Factory: DashboardCameraExt with overrides. */
export function makeDashboardCamera(
  overrides: Partial<DashboardCameraExt> = {},
): DashboardCameraExt {
  return { ...BASE_DASHBOARD, ...overrides };
}

/** Factory: MapCameraExt with overrides. */
export function makeMapCamera(
  overrides: Partial<MapCameraExt> = {},
): MapCameraExt {
  return { ...BASE_MAP, ...overrides };
}

// ─── Named fixtures (dashboard shape by default; use makeMapCamera for map) ───

export const onlineCamera: DashboardCameraExt = makeDashboardCamera({
  id: 'cam-online',
  name: 'Lobby Front Door',
  status: 'online',
  viewerCount: 3,
  bandwidth: 2_400_000,
});

export const offlineCamera: DashboardCameraExt = makeDashboardCamera({
  id: 'cam-offline',
  name: 'Warehouse Bay 3',
  status: 'offline',
  lastOnlineAt: '2026-04-20T22:15:00.000Z',
  viewerCount: 0,
  bandwidth: 0,
});

export const degradedCamera: DashboardCameraExt = makeDashboardCamera({
  id: 'cam-degraded',
  name: 'Parking Lot West',
  status: 'degraded',
  viewerCount: 1,
  bandwidth: 800_000,
});

export const reconnectingCamera: DashboardCameraExt = makeDashboardCamera({
  id: 'cam-reconnecting',
  name: 'Dock A',
  status: 'reconnecting',
  viewerCount: 0,
  bandwidth: 0,
});

export const recordingCamera: DashboardCameraExt = makeDashboardCamera({
  id: 'cam-recording',
  name: 'Server Room',
  status: 'online',
  viewerCount: 2,
  bandwidth: 3_100_000,
  isRecording: true,
  retentionDays: 7,
});

export const maintenanceCamera: DashboardCameraExt = makeDashboardCamera({
  id: 'cam-maintenance',
  name: 'Roof Pan-Tilt',
  status: 'online',
  viewerCount: 0,
  bandwidth: 0,
  maintenanceMode: true,
  maintenanceEnteredBy: 'Jane Doe',
  maintenanceEnteredAt: '2026-04-21T00:00:00.000Z',
});

// Recording / maintenance map-shape convenience exports for map-specific tests
// that need latitude/longitude/retentionDays. Importers can pick what they need.
export const recordingMapCamera: MapCameraExt = makeMapCamera({
  id: 'cam-recording',
  name: 'Server Room',
  status: 'online',
  isRecording: true,
  retentionDays: 7,
});

export const maintenanceMapCamera: MapCameraExt = makeMapCamera({
  id: 'cam-maintenance',
  name: 'Roof Pan-Tilt',
  status: 'online',
  maintenanceMode: true,
  maintenanceEnteredBy: 'Jane Doe',
  maintenanceEnteredAt: '2026-04-21T00:00:00.000Z',
});
