/**
 * Phase 18 Plan 02 — Dedicated severity-sort coverage for useDashboardIssues.
 * The issues-panel.test.tsx mocks this hook to focus on rendering; this file
 * exercises the real sort logic so the severity contract is locked down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import {
  onlineCamera,
  offlineCamera,
  degradedCamera,
  reconnectingCamera,
  maintenanceCamera,
} from '@/test-utils/camera-fixtures';

// Control the raw camera-status list the hook consumes.
const camerasMock = vi.fn();
vi.mock('./use-dashboard-stats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./use-dashboard-stats')>();
  return {
    ...actual,
    useCameraStatusList: () => ({
      cameras: camerasMock(),
      setCameras: vi.fn(),
      loading: false,
      error: null,
    }),
  };
});

import { useDashboardIssues } from './use-dashboard-issues';

beforeEach(() => {
  camerasMock.mockReset();
});

describe('useDashboardIssues (Phase 18 Plan 02)', () => {
  it('sorts offline → degraded → reconnecting → maintenance', () => {
    // Scramble the input; the hook must produce the canonical severity order.
    camerasMock.mockReturnValue([
      maintenanceCamera,
      reconnectingCamera,
      onlineCamera,
      degradedCamera,
      offlineCamera,
    ]);

    const { result } = renderHook(() => useDashboardIssues());

    expect(result.current.issues).toHaveLength(4);
    expect(result.current.issues[0].id).toBe(offlineCamera.id);
    expect(result.current.issues[1].id).toBe(degradedCamera.id);
    expect(result.current.issues[2].id).toBe(reconnectingCamera.id);
    expect(result.current.issues[3].id).toBe(maintenanceCamera.id);
  });

  it('filters out healthy online cameras (status=online && !maintenanceMode)', () => {
    camerasMock.mockReturnValue([onlineCamera]);

    const { result } = renderHook(() => useDashboardIssues());

    expect(result.current.issues).toHaveLength(0);
    expect(result.current.onlineCount).toBe(1);
  });

  it('counts maintenanceMode cameras as issues (not healthy)', async () => {
    camerasMock.mockReturnValue([onlineCamera, maintenanceCamera]);

    const { result } = renderHook(() => useDashboardIssues());

    await waitFor(() => {
      expect(result.current.issues).toHaveLength(1);
    });
    expect(result.current.issues[0].id).toBe(maintenanceCamera.id);
    // onlineCount excludes maintenance (because maintenanceMode=true).
    expect(result.current.onlineCount).toBe(1);
  });
});
