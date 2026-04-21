/**
 * Phase 18 Wave 0 — CameraMarker test stubs (teardrop SVG + recording/maintenance badges).
 * Every `it.todo` maps to UI-06 / D-13 / D-14 verifiable behavior.
 * Plan 04 implementation will flip these and replace the existing divIcon
 * (apps/web/src/components/map/camera-marker.tsx:44-58) with an SVG teardrop.
 *
 * T-18-XSS-MARKER stub guards against unescaped camera names in aria-label / innerHTML.
 */
import { describe, it } from 'vitest';

import { onlineCamera, offlineCamera, makeMapCamera } from '@/test-utils/camera-fixtures';
void onlineCamera;
void offlineCamera;
void makeMapCamera;

describe('CameraMarker (Phase 18 — map pin redesign)', () => {
  it.todo('UI-06: renders teardrop SVG with iconSize [28, 36] and iconAnchor [14, 36] (D-13)');
  it.todo('UI-06: pin fill = green #22c55e when status=online (UI-SPEC)');
  it.todo('UI-06: pin fill = red #ef4444 when status=offline');
  it.todo('UI-06: pin fill = amber #f59e0b when status=degraded or reconnecting');
  it.todo('UI-06: renders recording red dot 8x8 upper-right when isRecording=true (D-14)');
  it.todo('UI-06: renders wrench badge 10x10 gray lower-right when maintenanceMode=true (D-14)');
  it.todo('UI-06: recording dot has animate-pulse class');
  it.todo('T-18-XSS-MARKER: escapes HTML in camera name inside aria-label — name with <script> renders as &lt;script&gt;');
});
