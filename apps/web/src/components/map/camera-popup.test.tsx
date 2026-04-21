/**
 * Phase 18 Wave 0 — CameraPopup test stubs (preview + badges + actions + regression guard).
 * Every `it.todo` maps to UI-06 / D-17..D-22 verifiable behavior.
 *
 * Regression guard: "PreviewVideo does not remount when viewerCount prop changes on parent"
 *   — Phase 13 had a runaway-viewer-count bug where every viewerCount broadcast
 *     remounted the <video>, triggered a fresh SRS on_play, which broadcast again.
 *     memo() at apps/web/src/components/map/camera-popup.tsx:30 is the fix. Plan 05
 *     asserts that broadcast-driven re-renders of the parent popup do NOT tear
 *     down the PreviewVideo subtree.
 */
import { describe, it } from 'vitest';

import { onlineCamera, offlineCamera, recordingMapCamera, maintenanceMapCamera, makeMapCamera } from '@/test-utils/camera-fixtures';
void onlineCamera;
void offlineCamera;
void recordingMapCamera;
void maintenanceMapCamera;
void makeMapCamera;

describe('CameraPopup (Phase 18 — map thumbnail popup redesign)', () => {
  it.todo('UI-06: preview container is 240x135 (D-17)');
  it.todo('UI-06: popup renders REC overlay top-left when isRecording and status=online (D-18)');
  it.todo('UI-06: popup renders Maintenance overlay when maintenanceMode=true (D-18)');
  it.todo('UI-06: renders Recording badge with "{N} days retention" when retentionDays present (D-19)');
  it.todo('UI-06: renders Maintenance badge with by-user + relative time (D-19)');
  it.todo('UI-06: renders "Offline {time} ago" only when status=offline (D-19)');
  it.todo('UI-06: two primary action buttons: View Stream + View Recordings (D-21)');
  it.todo('UI-06: ⋮ dropdown has Set Location, Toggle Maintenance, Open Camera Detail (D-21)');
  it.todo('UI-06: Toggle Maintenance opens confirmation dialog (Phase 15-04 reuse)');
  it.todo('UI-06: Toggle Maintenance confirm calls POST /api/cameras/:id/maintenance');
  it.todo('UI-06: View Recordings navigates to /app/recordings?camera={id}');
  it.todo('UI-06 REGRESSION GUARD: PreviewVideo does not remount when viewerCount prop changes on parent (Phase 13 runaway viewer count bug)');
  it.todo('UI-06: popup Leaflet maxWidth=320 minWidth=280 (D-22)');
});
