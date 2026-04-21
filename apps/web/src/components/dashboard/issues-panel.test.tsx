/**
 * Phase 18 Wave 0 — Tenant IssuesPanel test stubs (replaces CameraStatusTable).
 * Every `it.todo` maps to a UI-05 / D-04 verifiable behavior.
 * Plan 02 implementation task will flip these to real `it` assertions.
 */
import { describe, it } from 'vitest';

import {
  onlineCamera,
  offlineCamera,
  degradedCamera,
  reconnectingCamera,
  recordingCamera,
  maintenanceCamera,
  makeDashboardCamera,
} from '@/test-utils/camera-fixtures';
void onlineCamera;
void offlineCamera;
void degradedCamera;
void reconnectingCamera;
void recordingCamera;
void maintenanceCamera;
void makeDashboardCamera;

describe('IssuesPanel (Phase 18 — tenant dashboard)', () => {
  it.todo('UI-05: empty state renders CheckCircle2 + "All cameras healthy" (D-04 reward signal)');
  it.todo('UI-05: sorts issues severity offline → degraded → reconnecting → recording-failed → maintenance (D-04)');
  it.todo('UI-05: offline row action Investigate navigates to /app/cameras/{id}');
  it.todo('UI-05: maintenance row shows "Maintenance · by {user} · {time}"');
  it.todo('UI-05: empty-state body shows "{N} cameras online, 0 issues."');
});
