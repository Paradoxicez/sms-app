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

export interface RecordingCameraInclude {
  id: string;
  name: string;
  site: {
    id: string;
    name: string;
    project: { id: string; name: string };
  };
}

export interface RecordingWithCamera extends Recording {
  camera: RecordingCameraInclude;
  _count?: { segments: number };
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

/* ---------- Single Recording (with camera include) ---------- */

export type RecordingLoadError = 'not-found' | 'forbidden' | 'network';

export function useRecording(id: string | undefined) {
  const [recording, setRecording] = useState<RecordingWithCamera | null>(null);
  const [loading, setLoading] = useState<boolean>(!!id);
  const [error, setError] = useState<RecordingLoadError | null>(null);

  useEffect(() => {
    if (!id) {
      setRecording(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<RecordingWithCamera>(`/api/recordings/${id}`)
      .then((r) => {
        if (!cancelled) setRecording(r);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        const msg = err.message ?? '';
        if (msg.includes('404')) setError('not-found');
        else if (msg.includes('403')) setError('forbidden');
        else setError('network');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { recording, loading, error };
}

/* ---------- Timezone helpers (timeline / calendar / list) ---------- */

// Convert a user-facing local date (or month) to the UTC instants that
// bracket it in the user's browser timezone. The backend's timeline and
// list endpoints accept these as `startUtc`/`endUtc` and do all bucketing
// relative to them, so the API process never needs to know what timezone
// the user is in. Pre-fix the endpoints accepted `date=YYYY-MM-DD` and
// applied `gte/lte` on UTC midnights, which mis-bucketed any non-UTC user.
// See debug session `recordings-detail-timeline-timezone-mismatch.md`.
function localDayWindow(d: Date): { startUtc: string; endUtc: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

function localMonthWindow(d: Date): { startUtc: string; endUtc: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  // Day 0 of next month = last day of this month at 23:59:59.999 local.
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

/* ---------- Timeline ---------- */

export function useRecordingTimeline(
  cameraId: string | undefined,
  selectedDate: Date | undefined,
) {
  const [hours, setHours] = useState<TimelineHour[]>([]);
  const [loading, setLoading] = useState(false);

  // Memoise window strings so the effect doesn't refire on every render
  // (a fresh Date with the same value would otherwise produce a new
  // identity each render and refetch in a loop).
  const dateKey = selectedDate
    ? `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`
    : '';

  useEffect(() => {
    if (!cameraId || !selectedDate) return;
    let cancelled = false;
    setLoading(true);
    const { startUtc, endUtc } = localDayWindow(selectedDate);
    const params = new URLSearchParams({ startUtc, endUtc });
    apiFetch<{ hours: TimelineHour[] }>(
      `/api/recordings/camera/${cameraId}/timeline?${params.toString()}`,
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
    // dateKey is the stable identity for the local day; selectedDate would
    // change identity on every parent render even when the calendar day is
    // unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, dateKey]);

  return { hours, loading };
}

/* ---------- Calendar ---------- */

export function useRecordingCalendar(
  cameraId: string | undefined,
  displayedMonth: Date | undefined,
) {
  const [days, setDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const monthKey = displayedMonth
    ? `${displayedMonth.getFullYear()}-${displayedMonth.getMonth()}`
    : '';

  useEffect(() => {
    if (!cameraId || !displayedMonth) return;
    let cancelled = false;
    setLoading(true);
    const { startUtc, endUtc } = localMonthWindow(displayedMonth);
    const params = new URLSearchParams({ startUtc, endUtc });
    apiFetch<{ days: number[] }>(
      `/api/recordings/camera/${cameraId}/calendar?${params.toString()}`,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, monthKey]);

  return { days, loading };
}

/* ---------- Recordings List ---------- */

export function useRecordingsList(
  cameraId: string | undefined,
  selectedDate: Date | undefined,
) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);

  const dateKey = selectedDate
    ? `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`
    : '';

  const fetch = useCallback(async () => {
    if (!cameraId || !selectedDate) return;
    setLoading(true);
    try {
      const { startUtc, endUtc } = localDayWindow(selectedDate);
      const params = new URLSearchParams({ startUtc, endUtc });
      const data = await apiFetch<Recording[]>(
        `/api/recordings/camera/${cameraId}?${params.toString()}`,
      );
      setRecordings(data);
    } catch {
      setRecordings([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, dateKey]);

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
