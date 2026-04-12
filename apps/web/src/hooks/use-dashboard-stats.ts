'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';

export interface DashboardStats {
  camerasOnline: number;
  camerasOffline: number;
  totalCameras: number;
  totalViewers: number;
  bandwidth: number;
}

export interface UsageDataPoint {
  date: string;
  requests: number;
  bandwidth: number;
}

export interface SystemMetrics {
  cpuPercent: number;
  memPercent: number;
  memKbyte: number;
  srsUptime: number;
  systemCpu: number;
  systemMemPercent: number;
  load1m: number;
  load5m: number;
}

export interface DashboardCamera {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'degraded' | 'connecting' | 'reconnecting';
  lastOnlineAt: string | null;
  viewerCount: number;
  bandwidth: number;
}

const POLL_INTERVAL = 30000;

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiFetch<DashboardStats>('/api/dashboard/stats');
      setStats(data);
      setError(null);
    } catch {
      setError('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    intervalRef.current = setInterval(fetchStats, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

export function useUsageTimeSeries(range: '24h' | '7d' | '30d') {
  const [data, setData] = useState<UsageDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const result = await apiFetch<{ data: UsageDataPoint[] }>(
        `/api/dashboard/usage?range=${range}`,
      );
      setData(result.data ?? []);
      setError(null);
    } catch {
      setError('Failed to load usage data');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    fetchUsage();
    intervalRef.current = setInterval(fetchUsage, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchUsage]);

  return { data, loading, error };
}

export function useSystemMetrics() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await apiFetch<SystemMetrics>('/api/dashboard/system-metrics');
      setMetrics(data);
      setError(null);
    } catch {
      setError('Failed to load system metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    intervalRef.current = setInterval(fetchMetrics, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMetrics]);

  return { metrics, loading, error };
}

export function useCameraStatusList() {
  const [cameras, setCameras] = useState<DashboardCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCameras = useCallback(async () => {
    try {
      const data = await apiFetch<DashboardCamera[]>('/api/dashboard/cameras');
      setCameras(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      setError('Failed to load camera list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
    intervalRef.current = setInterval(fetchCameras, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchCameras]);

  return { cameras, setCameras, loading, error };
}
