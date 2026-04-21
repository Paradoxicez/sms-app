'use client';

/**
 * Phase 18 Plan 05 — super-admin dashboard data hooks.
 *
 * Three polling sub-hooks that each GET an `/api/admin/dashboard/*` endpoint
 * every 30s. Cluster nodes reuse the existing `useClusterNodes` hook which
 * already layers Socket.IO real-time updates on top of REST.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

const POLL_INTERVAL_MS = 30000;

// --- Types ----------------------------------------------------------------

export type PlatformIssueType =
  | 'srs-down'
  | 'edge-down'
  | 'org-offline-rate'
  | 'minio-down'
  | 'ffmpeg-saturated';

export interface PlatformIssue {
  type: PlatformIssueType;
  severity: 'critical' | 'warning';
  label: string;
  meta?: Record<string, unknown>;
}

export interface StorageForecastPoint {
  date: string;
  /** BigInt serialised as string to avoid JSON.stringify crashes. */
  bytes: string;
}

export interface StorageForecast {
  points: StorageForecastPoint[];
  estimatedDaysUntilFull: number | null;
}

export interface AuditHighlight {
  id: string;
  action: string;
  resource: string;
  actorName: string | null;
  orgName: string | null;
  createdAt: string;
}

// --- usePlatformIssues ----------------------------------------------------

export function usePlatformIssues() {
  const [issues, setIssues] = useState<PlatformIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchIssues = useCallback(async () => {
    try {
      const data = await apiFetch<PlatformIssue[]>(
        '/api/admin/dashboard/platform-issues',
      );
      setIssues(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      setError('Failed to load platform issues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIssues();
    intervalRef.current = setInterval(fetchIssues, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchIssues]);

  return { issues, loading, error, refetch: fetchIssues };
}

// --- useStorageForecast ---------------------------------------------------

export function useStorageForecast(range: '7d' | '30d') {
  const [forecast, setForecast] = useState<StorageForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchForecast = useCallback(async () => {
    try {
      const data = await apiFetch<StorageForecast>(
        `/api/admin/dashboard/storage-forecast?range=${range}`,
      );
      setForecast(data);
      setError(null);
    } catch {
      setError('Failed to load storage forecast');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    // Range changed — show loading again until fresh data lands.
    setLoading(true);
    fetchForecast();
    intervalRef.current = setInterval(fetchForecast, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchForecast]);

  return { forecast, loading, error, refetch: fetchForecast };
}

// --- useActiveStreamsCount ------------------------------------------------

export function useActiveStreamsCount() {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const data = await apiFetch<{ count: number }>(
        '/api/admin/dashboard/active-streams',
      );
      setCount(data?.count ?? 0);
      setError(null);
    } catch {
      setError('Failed to load active streams count');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();
    intervalRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchCount]);

  return { count, loading, error, refetch: fetchCount };
}

// --- useRecordingsActive --------------------------------------------------

export function useRecordingsActive() {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const data = await apiFetch<{ count: number }>(
        '/api/admin/dashboard/recordings-active',
      );
      setCount(data?.count ?? 0);
      setError(null);
    } catch {
      setError('Failed to load active recordings count');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();
    intervalRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchCount]);

  return { count, loading, error, refetch: fetchCount };
}

// --- useOrgHealthOverview -------------------------------------------------

export interface OrgHealth {
  orgId: string;
  orgName: string;
  orgSlug: string;
  packageName: string | null;
  camerasUsed: number;
  camerasLimit: number | null;
  cameraUsagePct: number;
  /** BigInt serialised as string to avoid JSON.stringify crashes. */
  storageUsedBytes: string;
  storageLimitGb: number | null;
  storageUsagePct: number;
  /** BigInt serialised as string. */
  bandwidthTodayBytes: string;
  issuesCount: number;
}

export function useOrgHealthOverview() {
  const [orgs, setOrgs] = useState<OrgHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrgs = useCallback(async () => {
    try {
      const data = await apiFetch<OrgHealth[]>(
        '/api/admin/dashboard/org-health',
      );
      setOrgs(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      setError('Failed to load organization health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgs();
    intervalRef.current = setInterval(fetchOrgs, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchOrgs]);

  return { orgs, loading, error, refetch: fetchOrgs };
}

// --- useRecentAudit -------------------------------------------------------

export function useRecentAudit(limit = 7) {
  const [entries, setEntries] = useState<AuditHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      const data = await apiFetch<AuditHighlight[]>(
        `/api/admin/dashboard/recent-audit?limit=${limit}`,
      );
      setEntries(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      setError('Failed to load recent audit events');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchEntries();
    intervalRef.current = setInterval(fetchEntries, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchEntries]);

  return { entries, loading, error, refetch: fetchEntries };
}
