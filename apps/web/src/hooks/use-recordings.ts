'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';

/* ---------- Types ---------- */

export interface Recording {
  id: string;
  cameraId: string;
  status: 'recording' | 'complete' | 'processing' | 'error';
  startedAt: string;
  stoppedAt?: string | null;
  totalSize?: number | null;
  totalDuration?: number | null;
}

export interface TimelineHour {
  hour: number;
  hasData: boolean;
}

export interface StorageQuota {
  usedBytes: number;
  limitBytes: number;
  usedGb: number;
  limitGb: number;
  percentage: number;
}

/* ---------- Recording Status ---------- */

export function useRecordingStatus(cameraId: string | undefined) {
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!cameraId) return;
    try {
      const recordings = await apiFetch<Recording[]>(
        `/api/recordings/camera/${cameraId}`,
      );
      setIsRecording(recordings.some((r) => r.status === 'recording'));
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [cameraId]);

  useEffect(() => {
    fetch();
    intervalRef.current = setInterval(fetch, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetch]);

  return { isRecording, loading, refetch: fetch };
}

/* ---------- Timeline ---------- */

export function useRecordingTimeline(
  cameraId: string | undefined,
  date: string | undefined,
) {
  const [hours, setHours] = useState<TimelineHour[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cameraId || !date) return;
    let cancelled = false;
    setLoading(true);
    apiFetch<{ hours: TimelineHour[] }>(
      `/api/recordings/camera/${cameraId}/timeline?date=${date}`,
    )
      .then((data) => {
        if (!cancelled) setHours(Array.isArray(data) ? data : data.hours ?? []);
      })
      .catch(() => {
        if (!cancelled) setHours([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cameraId, date]);

  return { hours, loading };
}

/* ---------- Calendar ---------- */

export function useRecordingCalendar(
  cameraId: string | undefined,
  year: number,
  month: number,
) {
  const [days, setDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cameraId) return;
    let cancelled = false;
    setLoading(true);
    apiFetch<{ days: number[] }>(
      `/api/recordings/camera/${cameraId}/calendar?year=${year}&month=${month}`,
    )
      .then((data) => {
        if (!cancelled) setDays(data.days ?? []);
      })
      .catch(() => {
        if (!cancelled) setDays([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cameraId, year, month]);

  return { days, loading };
}

/* ---------- Recordings List ---------- */

export function useRecordingsList(
  cameraId: string | undefined,
  date: string | undefined,
) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!cameraId || !date) return;
    setLoading(true);
    try {
      const data = await apiFetch<Recording[]>(
        `/api/recordings/camera/${cameraId}?date=${date}`,
      );
      setRecordings(data);
    } catch {
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  }, [cameraId, date]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { recordings, loading, refetch: fetch };
}

/* ---------- Storage Quota ---------- */

export function useStorageQuota() {
  const [quota, setQuota] = useState<StorageQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    try {
      const raw = await apiFetch<{
        usageBytes: string;
        limitBytes: string;
        usagePercent: number;
        allowed: boolean;
      }>('/api/recordings/storage');
      const usedBytes = Number(raw.usageBytes);
      const limitBytes = Number(raw.limitBytes);
      setQuota({
        usedBytes,
        limitBytes,
        usedGb: usedBytes / (1024 * 1024 * 1024),
        limitGb: limitBytes / (1024 * 1024 * 1024),
        percentage: raw.usagePercent,
      });
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    intervalRef.current = setInterval(fetch, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetch]);

  return { quota, loading, refetch: fetch };
}

/* ---------- Mutation helpers ---------- */

export async function startRecording(cameraId: string) {
  return apiFetch<Recording>('/api/recordings/start', {
    method: 'POST',
    body: JSON.stringify({ cameraId }),
  });
}

export async function stopRecording(cameraId: string) {
  return apiFetch<Recording>('/api/recordings/stop', {
    method: 'POST',
    body: JSON.stringify({ cameraId }),
  });
}

export async function deleteRecording(id: string) {
  return apiFetch<void>(`/api/recordings/${id}`, {
    method: 'DELETE',
  });
}
