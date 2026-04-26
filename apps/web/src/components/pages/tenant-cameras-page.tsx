'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import type { RowSelectionState } from '@tanstack/react-table';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useCameraStatus } from '@/hooks/use-camera-status';
import { startRecording, stopRecording } from '@/hooks/use-recordings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { type CameraRow } from '@/app/admin/cameras/components/cameras-columns';
import { CamerasDataTable } from '@/app/admin/cameras/components/cameras-data-table';
import { CameraFormDialog } from '@/app/admin/cameras/components/camera-form-dialog';
import { EmbedCodeDialog } from '@/app/admin/cameras/components/embed-code-dialog';
import { ViewStreamSheet } from '@/app/admin/cameras/components/view-stream-sheet';
import { BulkImportDialog } from '@/app/admin/cameras/components/bulk-import-dialog';
import { BulkToolbar } from '@/app/admin/cameras/components/bulk-toolbar';
import { MaintenanceReasonDialog } from '@/app/admin/cameras/components/maintenance-reason-dialog';
import {
  bulkAction,
  filterEnterMaintenanceTargets,
  filterExitMaintenanceTargets,
  filterStartRecordingTargets,
  filterStartStreamTargets,
  VERB_COPY,
  type BulkVerb,
} from '@/lib/bulk-actions';

/**
 * Phase 20 Plan 03 — tenant cameras page.
 *
 * Owns the bulk-action state machine:
 *   - rowSelection (keyed by camera.id via useReactTable.getRowId)
 *   - bulkProcessing flag (disables toolbar action buttons)
 *   - errorByCameraId map (surfaces AlertTriangle badge in Status column)
 *   - maintenanceDialog union (single row-menu flow or bulk toolbar flow)
 *   - bulkDeleteOpen AlertDialog (D-06b single-click destructive confirm)
 *
 * Row-menu maintenance is asymmetric per D-07:
 *   - camera.maintenanceMode=false → opens MaintenanceReasonDialog (single)
 *   - camera.maintenanceMode=true → runs direct DELETE, no dialog
 *
 * Bulk maintenance mirrors the same asymmetry at batch scope (D-03).
 */
export default function TenantCamerasPage() {
  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | undefined>(undefined);

  // View state
  const [view, setView] = useState<'table' | 'card'>('table');

  // Dialog state (non-bulk)
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editCamera, setEditCamera] = useState<CameraRow | null>(null);
  const [deleteCamera, setDeleteCamera] = useState<CameraRow | null>(null);
  const [embedCamera, setEmbedCamera] = useState<CameraRow | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);

  // ─── Phase 20 Plan 03 — Bulk state ──────────────────────────────────
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [errorByCameraId, setErrorByCameraId] = useState<Record<string, string>>({});
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [maintenanceDialog, setMaintenanceDialog] = useState<
    | { mode: 'single'; camera: CameraRow }
    | { mode: 'bulk'; cameras: CameraRow[] }
    | null
  >(null);

  const selectedCamera = cameras.find((c) => c.id === selectedCameraId) ?? null;

  const selectedCameras = useMemo(
    () => cameras.filter((c) => rowSelection[c.id]),
    [cameras, rowSelection],
  );

  useEffect(() => {
    async function loadSession() {
      try {
        const session = await authClient.getSession();
        setOrgId(session.data?.session?.activeOrganizationId ?? undefined);
      } catch {
        // Session check handled by layout
      }
    }
    loadSession();
  }, []);

  const fetchCameras = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CameraRow[]>('/api/cameras');
      setCameras(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load cameras. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  // Quick task 260425-w7v: trigger snapshot refresh on page mount.
  // Pure background — no spinner, no error toast. The refreshed thumbnails
  // will be picked up by the next fetchCameras() call (e.g. after a mutation
  // or a status-driven refetch). Server-side is debounced 5s so even rapid
  // remounts cannot stampede FFmpeg.
  useEffect(() => {
    apiFetch('/api/cameras/snapshot/refresh-all', { method: 'POST' }).catch(
      () => {
        // intentionally swallowed — best-effort cache warm
      },
    );
    // run-once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time status + codec updates via Socket.IO. The codec callback fires
  // whenever StreamProbeProcessor writes a new codecInfo (pending → success/
  // failed). Patches the row in place so the 4-state codec cell transitions
  // without a page refresh.
  useCameraStatus(
    orgId,
    (event) => {
      setCameras((prev) =>
        prev.map((c) =>
          c.id === event.cameraId
            ? { ...c, status: event.status as CameraRow['status'] }
            : c,
        ),
      );
    },
    undefined,
    (event) => {
      setCameras((prev) =>
        prev.map((c) =>
          c.id === event.cameraId
            ? { ...c, codecInfo: event.codecInfo as CameraRow['codecInfo'] }
            : c,
        ),
      );
    },
  );

  // ─── Row-menu action handlers ────────────────────────────────────────
  // All row-menu callbacks are stable via useCallback so the column useMemo
  // in CamerasDataTable does not re-create columns on every parent render —
  // column-definition churn resets TanStack's internal row-selection state
  // and defeats the getRowId contract.
  const handleEdit = useCallback((camera: CameraRow) => {
    setEditCamera(camera);
  }, []);

  const handleViewStream = useCallback((camera: CameraRow) => {
    setSelectedCameraId(camera.id);
  }, []);

  const handleStreamToggle = useCallback(
    async (camera: CameraRow) => {
      try {
        if (camera.status === 'online') {
          await apiFetch(`/api/cameras/${camera.id}/stream/stop`, { method: 'POST' });
          toast.success('Stream stopped');
        } else {
          await apiFetch(`/api/cameras/${camera.id}/stream/start`, { method: 'POST' });
          toast.success('Stream started');
        }
        fetchCameras();
      } catch {
        toast.error('Failed to toggle stream');
      }
    },
    [fetchCameras],
  );

  const handleRecordToggle = useCallback(
    async (camera: CameraRow) => {
      try {
        if (camera.isRecording) {
          await stopRecording(camera.id);
          toast.success('Recording stopped');
        } else {
          await startRecording(camera.id);
          toast.success('Recording started');
        }
        fetchCameras();
      } catch {
        toast.error('Failed to toggle recording');
      }
    },
    [fetchCameras],
  );

  const handleEmbedCode = useCallback((camera: CameraRow) => {
    setEmbedCamera(camera);
  }, []);

  const handleDelete = useCallback((camera: CameraRow) => {
    setDeleteCamera(camera);
  }, []);

  async function confirmDelete() {
    if (!deleteCamera) return;
    try {
      await apiFetch(`/api/cameras/${deleteCamera.id}`, { method: 'DELETE' });
      toast.success('Camera deleted');
      setDeleteCamera(null);
      fetchCameras();
    } catch {
      toast.error('Failed to delete camera');
    }
  }

  const runRowExitMaintenance = useCallback(
    async (camera: CameraRow) => {
      try {
        await apiFetch(`/api/cameras/${camera.id}/maintenance`, { method: 'DELETE' });
        toast.success('Exited maintenance mode');
        await fetchCameras();
      } catch {
        toast.error('Failed to exit maintenance mode. Please try again.');
      }
    },
    [fetchCameras],
  );

  /**
   * D-07 asymmetric: row-menu "Maintenance" opens the reason dialog (single
   * mode) when entering, runs direct DELETE when exiting. Avoids prompting
   * users for a reason they don't need to provide on exit.
   */
  const handleRowMaintenanceToggle = useCallback(
    (camera: CameraRow) => {
      if (camera.maintenanceMode) {
        void runRowExitMaintenance(camera);
      } else {
        setMaintenanceDialog({ mode: 'single', camera });
      }
    },
    [runRowExitMaintenance],
  );

  // ─── Bulk-action handlers ────────────────────────────────────────────

  /**
   * Shared fan-out helper used by every bulk verb. Resolves into three
   * outcomes:
   *   - All succeeded → clear rowSelection, fire VERB_COPY toast
   *   - All failed → keep rowSelection at failed ids, fire errorTitle toast
   *   - Partial → keep rowSelection at failed ids, fire "N succeeded, M failed"
   *
   * `errorByCameraId` is patched so the Status column's AlertTriangle badge
   * shows the verbatim API error until the camera is re-targeted.
   */
  async function runBulk(
    verb: BulkVerb,
    targets: CameraRow[],
    opts: { reason?: string } = {},
  ) {
    if (targets.length === 0) return;
    const ids = targets.map((c) => c.id);
    setBulkProcessing(true);
    setErrorByCameraId((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        delete next[id];
      });
      return next;
    });
    try {
      const { succeeded, failed } = await bulkAction(verb, ids, {
        reason: opts.reason,
      });
      const copy = VERB_COPY[verb];
      if (failed.length === 0) {
        toast.success(
          succeeded.length === 1 ? copy.singular : copy.plural(succeeded.length),
        );
        setRowSelection({});
      } else if (succeeded.length === 0) {
        toast.error(copy.errorTitle);
        const nextSel: RowSelectionState = {};
        failed.forEach((f) => {
          nextSel[f.id] = true;
        });
        setRowSelection(nextSel);
      } else {
        toast.error(`${succeeded.length} succeeded, ${failed.length} failed`);
        const nextSel: RowSelectionState = {};
        failed.forEach((f) => {
          nextSel[f.id] = true;
        });
        setRowSelection(nextSel);
      }
      if (failed.length > 0) {
        setErrorByCameraId((prev) => {
          const next = { ...prev };
          failed.forEach((f) => {
            next[f.id] = f.error;
          });
          return next;
        });
      }
      await fetchCameras();
    } finally {
      setBulkProcessing(false);
    }
  }

  function handleBulkStartStream() {
    void runBulk('start-stream', filterStartStreamTargets(selectedCameras));
  }

  function handleBulkStartRecording() {
    void runBulk('start-recording', filterStartRecordingTargets(selectedCameras));
  }

  function handleBulkEnterMaintenance() {
    const targets = filterEnterMaintenanceTargets(selectedCameras);
    if (targets.length === 0) return;
    setMaintenanceDialog({ mode: 'bulk', cameras: targets });
  }

  function handleBulkExitMaintenance() {
    void runBulk(
      'exit-maintenance',
      filterExitMaintenanceTargets(selectedCameras),
    );
  }

  function handleBulkDelete() {
    setBulkDeleteOpen(true);
  }

  async function confirmBulkDelete() {
    await runBulk('delete', selectedCameras);
    setBulkDeleteOpen(false);
  }

  function handleMaintenanceDialogConfirm({ reason }: { reason: string | undefined }) {
    if (!maintenanceDialog) return;
    if (maintenanceDialog.mode === 'single') {
      const cam = maintenanceDialog.camera;
      setMaintenanceDialog(null);
      void runBulk('enter-maintenance', [cam], { reason });
    } else {
      const cams = maintenanceDialog.cameras;
      setMaintenanceDialog(null);
      void runBulk('enter-maintenance', cams, { reason });
    }
  }

  const maintenanceDialogTarget = maintenanceDialog
    ? maintenanceDialog.mode === 'single'
      ? { type: 'single' as const, cameraName: maintenanceDialog.camera.name }
      : { type: 'bulk' as const, count: maintenanceDialog.cameras.length }
    : null;

  const bulkDeleteCount = selectedCameras.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Cameras</h1>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <BulkToolbar
        selected={selectedCameras}
        processing={bulkProcessing}
        onStartStream={handleBulkStartStream}
        onStartRecording={handleBulkStartRecording}
        onEnterMaintenance={handleBulkEnterMaintenance}
        onExitMaintenance={handleBulkExitMaintenance}
        onDelete={handleBulkDelete}
        onClear={() => setRowSelection({})}
        // Phase 22 Plan 22-11 — refetch + clear selection after a successful
        // bulk Add/Remove tag. The popovers self-contain their fetch + toast
        // lifecycle and only call back on success.
        onTagBulkSuccess={() => {
          setRowSelection({});
          void fetchCameras();
        }}
      />

      <CamerasDataTable
        cameras={cameras}
        loading={isLoading}
        onEdit={handleEdit}
        onViewStream={handleViewStream}
        onDelete={handleDelete}
        onRecordToggle={handleRecordToggle}
        onStreamToggle={handleStreamToggle}
        onMaintenanceToggle={handleRowMaintenanceToggle}
        onEmbedCode={handleEmbedCode}
        onCreateCamera={() => setCreateDialogOpen(true)}
        onImportCameras={() => setImportDialogOpen(true)}
        view={view}
        onViewChange={setView}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        errorByCameraId={errorByCameraId}
      />

      {/* Create mode dialog */}
      <CameraFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={fetchCameras}
      />

      {/* Edit mode dialog */}
      <CameraFormDialog
        open={!!editCamera}
        onOpenChange={(open) => {
          if (!open) setEditCamera(null);
        }}
        onSuccess={fetchCameras}
        camera={editCamera}
      />

      {/* Embed code dialog */}
      {embedCamera && (
        <EmbedCodeDialog
          cameraId={embedCamera.id}
          open={!!embedCamera}
          onOpenChange={(open) => {
            if (!open) setEmbedCamera(null);
          }}
        />
      )}

      {/* Single-row delete confirmation */}
      <AlertDialog
        open={!!deleteCamera}
        onOpenChange={(open) => {
          if (!open) setDeleteCamera(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Camera</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete &apos;{deleteCamera?.name}&apos;? Existing
              recordings for this camera will be kept but will no longer be
              associated with a camera.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Maintenance reason dialog — handles BOTH row-menu (single) and bulk flows */}
      <MaintenanceReasonDialog
        open={maintenanceDialog !== null}
        onOpenChange={(open) => {
          if (!open) setMaintenanceDialog(null);
        }}
        target={maintenanceDialogTarget}
        submitting={bulkProcessing}
        onConfirm={handleMaintenanceDialogConfirm}
      />

      {/* Bulk delete confirm (D-06b single-click destructive) */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDeleteCount === 1
                ? 'Delete 1 Camera'
                : `Delete ${bulkDeleteCount} Cameras`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the following cameras and all their
              recordings. This cannot be undone.
            </AlertDialogDescription>
            {/*
              List + "+N more" rendered OUTSIDE AlertDialogDescription. base-ui
              renders AlertDialogDescription as a <p>, and nested <ul>/<div>
              inside a <p> is invalid HTML (triggers React 19 hydration
              warnings).
            */}
            <div className="mt-1 text-sm text-muted-foreground">
              <ul className="list-disc pl-5">
                {selectedCameras.slice(0, 5).map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
              {bulkDeleteCount > 5 && (
                <p className="mt-2">+{bulkDeleteCount - 5} more</p>
              )}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmBulkDelete}
              disabled={bulkProcessing}
            >
              {bulkProcessing ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : bulkDeleteCount === 1 ? (
                'Delete 1 Camera'
              ) : (
                `Delete ${bulkDeleteCount} Cameras`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk import dialog */}
      <BulkImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={fetchCameras}
      />

      <ViewStreamSheet
        camera={selectedCamera}
        open={!!selectedCameraId}
        onOpenChange={(open) => {
          if (!open) setSelectedCameraId(null);
        }}
        onStreamToggle={handleStreamToggle}
        onRecordToggle={handleRecordToggle}
        onRefresh={fetchCameras}
      />
    </div>
  );
}
