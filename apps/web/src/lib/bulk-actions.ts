import { apiFetch } from '@/lib/api';
import type { CameraRow } from '@/app/admin/cameras/components/cameras-columns';

/**
 * Phase 20 Plan 03 — bulk-actions library.
 *
 * Fans a bulk verb out across per-camera API endpoints with a concurrency
 * cap (default 5) and partitions the results into `{ succeeded, failed }`.
 *
 * Research A6/A7: `POST /api/recordings/start` throws `BadRequestException`
 * for already-recording cameras; `POST /api/cameras/:id/stream/start` is
 * safe but still counts against the toast failure set. Callers MUST apply
 * the matching `filter*Targets` helper BEFORE dispatch so already-on cameras
 * do not appear as "N failed" in the summary toast.
 */

export type BulkVerb =
  | 'start-stream'
  | 'start-recording'
  | 'enter-maintenance'
  | 'exit-maintenance'
  | 'delete';

interface BulkActionOpts {
  /** Max parallel requests; default 5 (UI-SPEC + T-20-14). */
  concurrency?: number;
  /** Optional reason body for enter-maintenance (single or bulk share one reason). */
  reason?: string;
}

interface BulkActionFailure {
  id: string;
  error: string;
}

interface BulkActionResult {
  succeeded: string[];
  failed: BulkActionFailure[];
}

type ActionFn = (cameraId: string, reason?: string) => Promise<unknown>;

const ACTION: Record<BulkVerb, ActionFn> = {
  'start-stream': (id) =>
    apiFetch(`/api/cameras/${id}/stream/start`, { method: 'POST' }),
  'start-recording': (id) =>
    apiFetch('/api/recordings/start', {
      method: 'POST',
      body: JSON.stringify({ cameraId: id }),
    }),
  'enter-maintenance': (id, reason) =>
    // When reason is undefined, omit the body so the controller's safeParse
    // sees an undefined body (Plan 01 DTO contract: reason is optional).
    apiFetch(
      `/api/cameras/${id}/maintenance`,
      reason !== undefined
        ? { method: 'POST', body: JSON.stringify({ reason }) }
        : { method: 'POST' },
    ),
  'exit-maintenance': (id) =>
    apiFetch(`/api/cameras/${id}/maintenance`, { method: 'DELETE' }),
  delete: (id) => apiFetch(`/api/cameras/${id}`, { method: 'DELETE' }),
};

export async function bulkAction(
  verb: BulkVerb,
  cameraIds: string[],
  opts: BulkActionOpts = {},
): Promise<BulkActionResult> {
  const concurrency = opts.concurrency ?? 5;
  const results = await chunkedAllSettled(cameraIds, concurrency, async (id) => {
    await ACTION[verb](id, opts.reason);
    return id;
  });

  const succeeded: string[] = [];
  const failed: BulkActionFailure[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      succeeded.push(cameraIds[i]);
    } else {
      failed.push({ id: cameraIds[i], error: errorMessage(r.reason) });
    }
  });
  return { succeeded, failed };
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Unknown error';
}

/**
 * Promise.allSettled with a concurrency cap. Results preserve input order.
 *
 * Uses N runners pulling from a shared cursor so a slow worker does not
 * block faster ones (per-worker batching would leave workers idle).
 */
export async function chunkedAllSettled<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  if (items.length === 0) return results;
  let cursor = 0;

  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        const value = await worker(items[i]);
        results[i] = { status: 'fulfilled', value };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runner()));
  return results;
}

export const VERB_COPY: Record<
  BulkVerb,
  {
    singular: string;
    plural: (n: number) => string;
    errorTitle: string;
  }
> = {
  'start-stream': {
    singular: 'Stream started',
    plural: (n) => `${n} streams started`,
    errorTitle: 'Failed to start streams',
  },
  'start-recording': {
    singular: 'Recording started',
    plural: (n) => `${n} recordings started`,
    errorTitle: 'Failed to start recordings',
  },
  'enter-maintenance': {
    singular: 'Camera entered maintenance',
    plural: (n) => `${n} cameras entered maintenance`,
    errorTitle: 'Failed to enter maintenance',
  },
  'exit-maintenance': {
    singular: 'Camera exited maintenance',
    plural: (n) => `${n} cameras exited maintenance`,
    errorTitle: 'Failed to exit maintenance',
  },
  delete: {
    singular: 'Camera deleted',
    plural: (n) => `${n} cameras deleted`,
    errorTitle: 'Failed to delete cameras',
  },
};

// ─── Pre-filter helpers (Research A6/A7) ────────────────────────────────
// Start Stream / Start Recording endpoints treat "already on" as an error
// for recording (BadRequestException) and a silent no-op for streaming.
// Pre-filtering avoids confusing "N failed" toasts for cameras that were
// already in the desired state when the user clicked.

export function filterStartStreamTargets<T extends Pick<CameraRow, 'status'>>(
  cameras: T[],
): T[] {
  return cameras.filter((c) => c.status !== 'online');
}

export function filterStartRecordingTargets<
  T extends Pick<CameraRow, 'isRecording'>,
>(cameras: T[]): T[] {
  return cameras.filter((c) => !c.isRecording);
}

export function filterEnterMaintenanceTargets<
  T extends Pick<CameraRow, 'maintenanceMode'>,
>(cameras: T[]): T[] {
  return cameras.filter((c) => !c.maintenanceMode);
}

export function filterExitMaintenanceTargets<
  T extends Pick<CameraRow, 'maintenanceMode'>,
>(cameras: T[]): T[] {
  return cameras.filter((c) => c.maintenanceMode);
}
