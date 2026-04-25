'use client';

import { useCallback, useMemo, useState } from 'react';
import type { RowSelectionState } from '@tanstack/react-table';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import {
  bulkAction,
  filterEnterMaintenanceTargets,
  filterExitMaintenanceTargets,
  filterStartRecordingTargets,
  filterStartStreamTargets,
  VERB_COPY,
  type BulkVerb,
} from '@/lib/bulk-actions';
import type { CameraRow } from '@/app/admin/cameras/components/cameras-columns';

type MaintenanceDialogState =
  | { mode: 'single'; camera: CameraRow }
  | { mode: 'bulk'; cameras: CameraRow[] }
  | null;

export interface UseCameraBulkActionsOptions {
  cameras: CameraRow[];
  refresh: () => Promise<void> | void;
}

export function useCameraBulkActions({
  cameras,
  refresh,
}: UseCameraBulkActionsOptions) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [errorByCameraId, setErrorByCameraId] = useState<
    Record<string, string>
  >({});
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [maintenanceDialog, setMaintenanceDialog] =
    useState<MaintenanceDialogState>(null);

  const selectedCameras = useMemo(
    () => cameras.filter((c) => rowSelection[c.id]),
    [cameras, rowSelection],
  );

  const runBulk = useCallback(
    async (
      verb: BulkVerb,
      targets: CameraRow[],
      opts: { reason?: string } = {},
    ) => {
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
            succeeded.length === 1
              ? copy.singular
              : copy.plural(succeeded.length),
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
        await refresh();
      } finally {
        setBulkProcessing(false);
      }
    },
    [refresh],
  );

  const handleBulkStartStream = useCallback(() => {
    void runBulk('start-stream', filterStartStreamTargets(selectedCameras));
  }, [runBulk, selectedCameras]);

  const handleBulkStartRecording = useCallback(() => {
    void runBulk(
      'start-recording',
      filterStartRecordingTargets(selectedCameras),
    );
  }, [runBulk, selectedCameras]);

  const handleBulkEnterMaintenance = useCallback(() => {
    const targets = filterEnterMaintenanceTargets(selectedCameras);
    if (targets.length === 0) return;
    setMaintenanceDialog({ mode: 'bulk', cameras: targets });
  }, [selectedCameras]);

  const handleBulkExitMaintenance = useCallback(() => {
    void runBulk(
      'exit-maintenance',
      filterExitMaintenanceTargets(selectedCameras),
    );
  }, [runBulk, selectedCameras]);

  const handleBulkDelete = useCallback(() => {
    setBulkDeleteOpen(true);
  }, []);

  const confirmBulkDelete = useCallback(async () => {
    await runBulk('delete', selectedCameras);
    setBulkDeleteOpen(false);
  }, [runBulk, selectedCameras]);

  const handleMaintenanceDialogConfirm = useCallback(
    ({ reason }: { reason: string | undefined }) => {
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
    },
    [maintenanceDialog, runBulk],
  );

  /**
   * Row-menu asymmetric maintenance (D-07):
   *  - camera.maintenanceMode=false → opens MaintenanceReasonDialog (single)
   *  - camera.maintenanceMode=true  → direct DELETE, no dialog
   */
  const handleRowMaintenanceToggle = useCallback(
    async (camera: CameraRow) => {
      if (camera.maintenanceMode) {
        try {
          await apiFetch(`/api/cameras/${camera.id}/maintenance`, {
            method: 'DELETE',
          });
          toast.success('Exited maintenance mode');
          await refresh();
        } catch {
          toast.error('Failed to exit maintenance');
        }
      } else {
        setMaintenanceDialog({ mode: 'single', camera });
      }
    },
    [refresh],
  );

  const maintenanceDialogTarget = maintenanceDialog
    ? maintenanceDialog.mode === 'single'
      ? { type: 'single' as const, cameraName: maintenanceDialog.camera.name }
      : { type: 'bulk' as const, count: maintenanceDialog.cameras.length }
    : null;

  const bulkDeleteCount = selectedCameras.length;

  return {
    rowSelection,
    setRowSelection,
    bulkProcessing,
    errorByCameraId,
    selectedCameras,

    handleBulkStartStream,
    handleBulkStartRecording,
    handleBulkEnterMaintenance,
    handleBulkExitMaintenance,
    handleBulkDelete,

    maintenanceDialog,
    setMaintenanceDialog,
    maintenanceDialogTarget,
    handleMaintenanceDialogConfirm,
    handleRowMaintenanceToggle,

    bulkDeleteOpen,
    setBulkDeleteOpen,
    bulkDeleteCount,
    confirmBulkDelete,
  };
}
