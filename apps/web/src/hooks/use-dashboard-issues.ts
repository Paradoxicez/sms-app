'use client';

import { useMemo } from 'react';

import {
  useCameraStatusList,
  type DashboardCamera,
} from './use-dashboard-stats';

/**
 * Severity rank for the tenant dashboard Issues panel.
 *
 * Order (lower = worse):
 *   0 = offline       (camera down, urgent)
 *   1 = degraded      (stream up, quality / drops)
 *   2 = reconnecting  (transient network blip)
 *   3 = maintenance   (intentional; lowest severity — no gap for deferred recording-failed)
 *
 * Note: recording-failed (status === 'online' && recordingExpected && !isRecording)
 * is deferred per Phase 18 RESEARCH OQ-01 — revisit when Phase 15 exposes a
 * dedicated failure state. Until then the gap is closed (maintenance = 3, not 4).
 */
function severityRank(c: DashboardCamera): number {
  if (c.status === 'offline') return 0;
  if (c.status === 'degraded') return 1;
  if (c.status === 'reconnecting') return 2;
  if (c.maintenanceMode) return 3;
  return 99;
}

function lastOnlineEpoch(c: DashboardCamera): number {
  // null `lastOnlineAt` sorts last (treat as +Infinity-adjacent large value).
  return c.lastOnlineAt ? new Date(c.lastOnlineAt).getTime() : Number.MAX_SAFE_INTEGER;
}

export interface UseDashboardIssuesResult {
  issues: DashboardCamera[];
  loading: boolean;
  error: string | null;
  /** Count of cameras that are truly healthy (online and not in maintenance). */
  onlineCount: number;
}

/**
 * Compose-only hook: reads the shared camera-status list (polled every 30s and
 * pushed via Socket.IO from the dashboard page) and derives the severity-sorted
 * list of cameras that need operator attention.
 *
 * Returned shape intentionally omits navigation callbacks — the consumer wires
 * `next/navigation` itself so this hook stays framework-agnostic for tests.
 */
export function useDashboardIssues(): UseDashboardIssuesResult {
  const { cameras, loading, error } = useCameraStatusList();

  return useMemo(() => {
    const issues = cameras
      .filter(
        (c) =>
          c.status === 'offline' ||
          c.status === 'degraded' ||
          c.status === 'reconnecting' ||
          c.maintenanceMode === true,
      )
      .slice() // copy before sort — do not mutate upstream state
      .sort((a, b) => {
        const rankDiff = severityRank(a) - severityRank(b);
        if (rankDiff !== 0) return rankDiff;
        // Secondary: oldest failure first (smaller lastOnlineAt first).
        return lastOnlineEpoch(a) - lastOnlineEpoch(b);
      });

    const onlineCount = cameras.filter(
      (c) => c.status === 'online' && !c.maintenanceMode,
    ).length;

    return { issues, loading, error, onlineCount };
  }, [cameras, loading, error]);
}
