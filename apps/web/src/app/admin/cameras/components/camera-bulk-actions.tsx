'use client';

import { Loader2 } from 'lucide-react';

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
import { BulkToolbar } from '@/app/admin/cameras/components/bulk-toolbar';
import { MaintenanceReasonDialog } from '@/app/admin/cameras/components/maintenance-reason-dialog';
import type { useCameraBulkActions } from '@/hooks/use-camera-bulk-actions';

type BulkActions = ReturnType<typeof useCameraBulkActions>;

export function CameraBulkActions({
  actions,
}: {
  actions: BulkActions;
}) {
  const {
    selectedCameras,
    bulkProcessing,
    handleBulkStartStream,
    handleBulkStartRecording,
    handleBulkEnterMaintenance,
    handleBulkExitMaintenance,
    handleBulkDelete,
    setRowSelection,
    maintenanceDialog,
    setMaintenanceDialog,
    maintenanceDialogTarget,
    handleMaintenanceDialogConfirm,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    bulkDeleteCount,
    confirmBulkDelete,
  } = actions;

  return (
    <>
      <BulkToolbar
        selected={selectedCameras}
        processing={bulkProcessing}
        onStartStream={handleBulkStartStream}
        onStartRecording={handleBulkStartRecording}
        onEnterMaintenance={handleBulkEnterMaintenance}
        onExitMaintenance={handleBulkExitMaintenance}
        onDelete={handleBulkDelete}
        onClear={() => setRowSelection({})}
      />

      <MaintenanceReasonDialog
        open={maintenanceDialog !== null}
        onOpenChange={(open) => {
          if (!open) setMaintenanceDialog(null);
        }}
        target={maintenanceDialogTarget}
        submitting={bulkProcessing}
        onConfirm={handleMaintenanceDialogConfirm}
      />

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
            <AlertDialogCancel disabled={bulkProcessing}>
              Cancel
            </AlertDialogCancel>
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
    </>
  );
}
