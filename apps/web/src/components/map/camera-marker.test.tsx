/**
 * Phase 18 Plan 03 — CameraMarker teardrop SVG + badges + XSS escape tests.
 * Exercises the pure `buildMarkerIcon` helper directly to avoid react-leaflet
 * in jsdom. Plan 00 left 8 `it.todo` placeholders; this file flips them all.
 */
import { describe, it, expect } from 'vitest';

import { onlineCamera, offlineCamera, makeMapCamera } from '@/test-utils/camera-fixtures';
import { buildMarkerIcon } from './camera-marker';

void onlineCamera;
void offlineCamera;
void makeMapCamera;

const base = { status: 'online', isRecording: false, maintenanceMode: false, name: 'Base' };

describe('CameraMarker (Phase 18 — map pin redesign)', () => {
  it('UI-06: renders teardrop SVG with iconSize [28, 36] and iconAnchor [14, 36] (D-13)', () => {
    const icon = buildMarkerIcon(base);
    expect(icon.options.iconSize).toEqual([28, 36]);
    expect(icon.options.iconAnchor).toEqual([14, 36]);
    expect(icon.options.popupAnchor).toEqual([0, -34]);
    expect(icon.options.html).toMatch(/<svg[^>]*viewBox="0 0 28 36"/);
    // Teardrop path anchors bottom-center at (14, 36)
    expect(icon.options.html).toMatch(/d="M14 0/);
  });

  it('UI-06: pin fill = green #22c55e when status=online (UI-SPEC)', () => {
    const icon = buildMarkerIcon({ ...base, status: 'online' });
    expect(icon.options.html).toContain('fill="#22c55e"');
  });

  it('UI-06: pin fill = red #ef4444 when status=offline', () => {
    const icon = buildMarkerIcon({ ...base, status: 'offline' });
    expect(icon.options.html).toContain('fill="#ef4444"');
  });

  it('UI-06: pin fill = amber #f59e0b when status=degraded or reconnecting', () => {
    const degraded = buildMarkerIcon({ ...base, status: 'degraded' });
    const reconnecting = buildMarkerIcon({ ...base, status: 'reconnecting' });
    expect(degraded.options.html).toContain('fill="#f59e0b"');
    expect(reconnecting.options.html).toContain('fill="#f59e0b"');
  });

  it('UI-06: renders recording red dot 8x8 upper-right when isRecording=true (D-14)', () => {
    const on = buildMarkerIcon({ ...base, isRecording: true });
    const off = buildMarkerIcon({ ...base, isRecording: false });
    expect(on.options.html).toMatch(/camera-pin__rec-dot/);
    expect(on.options.html).toMatch(/width:8px;height:8px/);
    expect(on.options.html).toMatch(/background:#ef4444/);
    expect(off.options.html).not.toMatch(/camera-pin__rec-dot/);
  });

  it('UI-06: renders wrench badge 10x10 gray lower-right when maintenanceMode=true (D-14)', () => {
    const on = buildMarkerIcon({ ...base, maintenanceMode: true });
    const off = buildMarkerIcon({ ...base, maintenanceMode: false });
    expect(on.options.html).toMatch(/camera-pin__maint/);
    expect(on.options.html).toMatch(/width:10px;height:10px/);
    expect(on.options.html).toMatch(/background:#6b7280/);
    expect(off.options.html).not.toMatch(/camera-pin__maint/);
  });

  it('UI-06: recording dot has animate-pulse class', () => {
    const icon = buildMarkerIcon({ ...base, isRecording: true });
    expect(icon.options.html).toMatch(/motion-safe:animate-pulse/);
  });

  it('T-18-XSS-MARKER: escapes HTML in camera name inside aria-label — name with <script> renders as &lt;script&gt;', () => {
    const icon = buildMarkerIcon({ ...base, name: '<script>alert(1)</script>' });
    expect(icon.options.html).not.toContain('<script>alert(1)</script>');
    expect(icon.options.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');

    const imgIcon = buildMarkerIcon({ ...base, name: '<img src=x onerror=alert(1)>' });
    expect(imgIcon.options.html).not.toContain('<img src=x');
    expect(imgIcon.options.html).toContain('&lt;img');
  });
});
