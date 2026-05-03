import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 20 Plan 03 Task 1 — bulk-actions library.
 *
 * apiFetch is mocked so every `bulkAction` dispatch is observable. The tests
 * cover (1) chunkedAllSettled concurrency + order guarantees, (2) per-verb
 * dispatch shape (method, path, body), (3) error partitioning, (4) VERB_COPY
 * pluralisation strings, and (5) pre-filter helpers that match Research A6/A7.
 */

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api';
import {
  bulkAction,
  chunkedAllSettled,
  filterEnterMaintenanceTargets,
  filterExitMaintenanceTargets,
  filterStartRecordingTargets,
  filterStartStreamTargets,
  filterStopRecordingTargets,
  filterStopStreamTargets,
  VERB_COPY,
} from './bulk-actions';

const mockedFetch = vi.mocked(apiFetch);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('chunkedAllSettled', () => {
  it('runs all items when concurrency >= items.length', async () => {
    const worker = vi.fn(async (n: number) => n * 2);
    const results = await chunkedAllSettled([1, 2, 3], 5, worker);
    expect(worker).toHaveBeenCalledTimes(3);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : undefined))).toEqual([2, 4, 6]);
  });

  it('respects concurrency limit (never more than N workers at once)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const worker = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    const items = Array.from({ length: 10 }, (_, i) => i);
    await chunkedAllSettled(items, 3, worker);
    expect(worker).toHaveBeenCalledTimes(10);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('returns results in input order regardless of completion order', async () => {
    const delays = [40, 5, 20];
    const worker = async (i: number) => {
      await new Promise((r) => setTimeout(r, delays[i]));
      return `v${i}`;
    };
    const results = await chunkedAllSettled([0, 1, 2], 3, worker);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([
      'v0',
      'v1',
      'v2',
    ]);
  });

  it('captures rejected promises as { status: "rejected", reason }', async () => {
    const worker = async (i: number) => {
      if (i === 1) throw new Error(`boom-${i}`);
      return i;
    };
    const results = await chunkedAllSettled([0, 1, 2], 3, worker);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(((results[1] as PromiseRejectedResult).reason as Error).message).toBe('boom-1');
    expect(results[2].status).toBe('fulfilled');
  });

  it('captures fulfilled promises as { status: "fulfilled", value }', async () => {
    const results = await chunkedAllSettled(['a', 'b'], 2, async (s) => s.toUpperCase());
    expect(results).toEqual([
      { status: 'fulfilled', value: 'A' },
      { status: 'fulfilled', value: 'B' },
    ]);
  });

  it('returns empty array for empty input and never invokes worker', async () => {
    const worker = vi.fn();
    const results = await chunkedAllSettled([], 5, worker);
    expect(results).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  it('handles concurrency=1 (sequential, no overlap)', async () => {
    const log: Array<{ i: number; event: 'start' | 'end' }> = [];
    const worker = async (i: number) => {
      log.push({ i, event: 'start' });
      await new Promise((r) => setTimeout(r, 5));
      log.push({ i, event: 'end' });
      return i;
    };
    await chunkedAllSettled([0, 1, 2], 1, worker);
    // With concurrency 1, each "end" must precede the next "start".
    expect(log).toEqual([
      { i: 0, event: 'start' },
      { i: 0, event: 'end' },
      { i: 1, event: 'start' },
      { i: 1, event: 'end' },
      { i: 2, event: 'start' },
      { i: 2, event: 'end' },
    ]);
  });
});

describe('bulkAction dispatch shape', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue(undefined);
  });

  it('start-stream: calls POST /api/cameras/:id/stream/start for each id', async () => {
    await bulkAction('start-stream', ['id1', 'id2']);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedFetch).toHaveBeenCalledWith('/api/cameras/id1/stream/start', { method: 'POST' });
    expect(mockedFetch).toHaveBeenCalledWith('/api/cameras/id2/stream/start', { method: 'POST' });
  });

  it('start-recording: POSTs /api/recordings/start with { cameraId } body for each id', async () => {
    await bulkAction('start-recording', ['id1', 'id2']);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    const call1 = mockedFetch.mock.calls[0];
    const call2 = mockedFetch.mock.calls[1];
    expect(call1[0]).toBe('/api/recordings/start');
    expect((call1[1] as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((call1[1] as RequestInit).body))).toEqual({ cameraId: 'id1' });
    expect(JSON.parse(String((call2[1] as RequestInit).body))).toEqual({ cameraId: 'id2' });
  });

  it('stop-stream: calls POST /api/cameras/:id/stream/stop for each id', async () => {
    await bulkAction('stop-stream', ['id1', 'id2']);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedFetch).toHaveBeenCalledWith('/api/cameras/id1/stream/stop', { method: 'POST' });
    expect(mockedFetch).toHaveBeenCalledWith('/api/cameras/id2/stream/stop', { method: 'POST' });
  });

  it('stop-recording: POSTs /api/recordings/stop with { cameraId } body for each id', async () => {
    await bulkAction('stop-recording', ['id1', 'id2']);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    const call1 = mockedFetch.mock.calls[0];
    const call2 = mockedFetch.mock.calls[1];
    expect(call1[0]).toBe('/api/recordings/stop');
    expect((call1[1] as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((call1[1] as RequestInit).body))).toEqual({ cameraId: 'id1' });
    expect(JSON.parse(String((call2[1] as RequestInit).body))).toEqual({ cameraId: 'id2' });
  });

  it('enter-maintenance WITH reason: POSTs /api/cameras/:id/maintenance with { reason } body', async () => {
    await bulkAction('enter-maintenance', ['idA'], { reason: 'Lens' });
    const call = mockedFetch.mock.calls[0];
    expect(call[0]).toBe('/api/cameras/idA/maintenance');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'Lens' });
  });

  it('enter-maintenance WITHOUT reason: POSTs with no body and no Content-Type header', async () => {
    await bulkAction('enter-maintenance', ['idA']);
    const call = mockedFetch.mock.calls[0];
    expect(call[0]).toBe('/api/cameras/idA/maintenance');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('exit-maintenance: DELETEs /api/cameras/:id/maintenance for each id', async () => {
    await bulkAction('exit-maintenance', ['id1', 'id2']);
    expect(mockedFetch).toHaveBeenCalledWith('/api/cameras/id1/maintenance', { method: 'DELETE' });
    expect(mockedFetch).toHaveBeenCalledWith('/api/cameras/id2/maintenance', { method: 'DELETE' });
  });

  it('delete: DELETEs /api/cameras/:id for each id', async () => {
    await bulkAction('delete', ['id1', 'id2']);
    expect(mockedFetch).toHaveBeenCalledWith('/api/cameras/id1', { method: 'DELETE' });
    expect(mockedFetch).toHaveBeenCalledWith('/api/cameras/id2', { method: 'DELETE' });
  });
});

describe('bulkAction partitioning + error extraction', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('partitions results into succeeded + failed arrays', async () => {
    mockedFetch
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValueOnce(undefined);
    const { succeeded, failed } = await bulkAction('delete', ['a', 'b', 'c']);
    expect(succeeded).toEqual(['a', 'c']);
    expect(failed).toEqual([{ id: 'b', error: 'fail-2' }]);
    expect(succeeded.length + failed.length).toBe(3);
  });

  it('Error reason: failed[i].error === reason.message', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('boom'));
    const { failed } = await bulkAction('delete', ['x']);
    expect(failed[0]).toEqual({ id: 'x', error: 'boom' });
  });

  it('string reason: failed[i].error === reason', async () => {
    mockedFetch.mockRejectedValueOnce('text-failure');
    const { failed } = await bulkAction('delete', ['x']);
    expect(failed[0]).toEqual({ id: 'x', error: 'text-failure' });
  });

  it('object reason with no message: failed[i].error === "Unknown error"', async () => {
    mockedFetch.mockRejectedValueOnce({});
    const { failed } = await bulkAction('delete', ['x']);
    expect(failed[0]).toEqual({ id: 'x', error: 'Unknown error' });
  });

  it('default concurrency is 5 (max in-flight caps at 5 for 10 hanging items)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const deferreds = Array.from({ length: 10 }, () => deferred<void>());
    let i = 0;
    mockedFetch.mockImplementation(() => {
      const d = deferreds[i++];
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return d.promise.finally(() => {
        inFlight--;
      });
    });
    const ids = Array.from({ length: 10 }, (_, n) => `id${n}`);
    const pending = bulkAction('delete', ids);
    // Let microtasks settle so all workers have started.
    await Promise.resolve();
    await Promise.resolve();
    expect(maxInFlight).toBeLessThanOrEqual(5);
    // Resolve everything so the test does not hang.
    deferreds.forEach((d) => d.resolve());
    await pending;
  });

  it('explicit concurrency override: concurrency=2 caps in-flight at 2', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const deferreds = Array.from({ length: 6 }, () => deferred<void>());
    let i = 0;
    mockedFetch.mockImplementation(() => {
      const d = deferreds[i++];
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return d.promise.finally(() => {
        inFlight--;
      });
    });
    const ids = Array.from({ length: 6 }, (_, n) => `id${n}`);
    const pending = bulkAction('delete', ids, { concurrency: 2 });
    await Promise.resolve();
    await Promise.resolve();
    expect(maxInFlight).toBeLessThanOrEqual(2);
    deferreds.forEach((d) => d.resolve());
    await pending;
  });
});

describe('VERB_COPY', () => {
  it('start-stream singular: "Stream started"', () => {
    expect(VERB_COPY['start-stream'].singular).toBe('Stream started');
  });
  it('start-stream plural(3): "3 streams started"', () => {
    expect(VERB_COPY['start-stream'].plural(3)).toBe('3 streams started');
  });
  it('start-recording singular: "Recording started"', () => {
    expect(VERB_COPY['start-recording'].singular).toBe('Recording started');
  });
  it('start-recording plural(3): "3 recordings started"', () => {
    expect(VERB_COPY['start-recording'].plural(3)).toBe('3 recordings started');
  });
  it('stop-stream singular: "Stream stopped"', () => {
    expect(VERB_COPY['stop-stream'].singular).toBe('Stream stopped');
  });
  it('stop-stream plural(3): "3 streams stopped"', () => {
    expect(VERB_COPY['stop-stream'].plural(3)).toBe('3 streams stopped');
  });
  it('stop-stream errorTitle: "Failed to stop streams"', () => {
    expect(VERB_COPY['stop-stream'].errorTitle).toBe('Failed to stop streams');
  });
  it('stop-recording singular: "Recording stopped"', () => {
    expect(VERB_COPY['stop-recording'].singular).toBe('Recording stopped');
  });
  it('stop-recording plural(3): "3 recordings stopped"', () => {
    expect(VERB_COPY['stop-recording'].plural(3)).toBe('3 recordings stopped');
  });
  it('stop-recording errorTitle: "Failed to stop recordings"', () => {
    expect(VERB_COPY['stop-recording'].errorTitle).toBe('Failed to stop recordings');
  });
  it('enter-maintenance singular: "Camera entered maintenance"', () => {
    expect(VERB_COPY['enter-maintenance'].singular).toBe('Camera entered maintenance');
  });
  it('enter-maintenance plural(3): "3 cameras entered maintenance"', () => {
    expect(VERB_COPY['enter-maintenance'].plural(3)).toBe('3 cameras entered maintenance');
  });
  it('exit-maintenance singular: "Camera exited maintenance"', () => {
    expect(VERB_COPY['exit-maintenance'].singular).toBe('Camera exited maintenance');
  });
  it('exit-maintenance plural(3): "3 cameras exited maintenance"', () => {
    expect(VERB_COPY['exit-maintenance'].plural(3)).toBe('3 cameras exited maintenance');
  });
  it('delete singular: "Camera deleted"', () => {
    expect(VERB_COPY.delete.singular).toBe('Camera deleted');
  });
  it('delete plural(3): "3 cameras deleted"', () => {
    expect(VERB_COPY.delete.plural(3)).toBe('3 cameras deleted');
  });
});

describe('pre-filter helpers (Research A6/A7)', () => {
  const cams = [
    { id: 'a', status: 'online' as const, isRecording: true, maintenanceMode: false },
    { id: 'b', status: 'offline' as const, isRecording: false, maintenanceMode: false },
    { id: 'c', status: 'online' as const, isRecording: false, maintenanceMode: true },
    { id: 'd', status: 'offline' as const, isRecording: true, maintenanceMode: true },
  ];

  it('filterStartStreamTargets removes cameras with status=online (keeps offline/reconnecting)', () => {
    const kept = filterStartStreamTargets(cams);
    expect(kept.map((c) => c.id)).toEqual(['b', 'd']);
  });

  it('filterStartRecordingTargets removes cameras with isRecording=true', () => {
    const kept = filterStartRecordingTargets(cams);
    expect(kept.map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('filterStopStreamTargets keeps only cameras with status=online (inverse of filterStartStreamTargets)', () => {
    const kept = filterStopStreamTargets(cams);
    expect(kept.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('filterStopRecordingTargets keeps only cameras with isRecording=true (inverse of filterStartRecordingTargets)', () => {
    const kept = filterStopRecordingTargets(cams);
    expect(kept.map((c) => c.id)).toEqual(['a', 'd']);
  });

  it('filterEnterMaintenanceTargets keeps only cameras with maintenanceMode=false', () => {
    const kept = filterEnterMaintenanceTargets(cams);
    expect(kept.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('filterExitMaintenanceTargets keeps only cameras with maintenanceMode=true', () => {
    const kept = filterExitMaintenanceTargets(cams);
    expect(kept.map((c) => c.id)).toEqual(['c', 'd']);
  });

  it('pre-filter helpers do NOT mutate their input array', () => {
    const snapshot = [...cams];
    filterStartStreamTargets(cams);
    filterStartRecordingTargets(cams);
    filterStopStreamTargets(cams);
    filterStopRecordingTargets(cams);
    filterEnterMaintenanceTargets(cams);
    filterExitMaintenanceTargets(cams);
    expect(cams).toEqual(snapshot);
  });
});
