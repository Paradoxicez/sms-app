'use client';

import { useEffect, useState, useCallback } from 'react';
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

export default function TenantCamerasPage() {
  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | undefined>(undefined);

  // View state
  const [view, setView] = useState<'table' | 'card'>('table');

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editCamera, setEditCamera] = useState<CameraRow | null>(null);
  const [deleteCamera, setDeleteCamera] = useState<CameraRow | null>(null);
  const [embedCamera, setEmbedCamera] = useState<CameraRow | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [maintenanceTarget, setMaintenanceTarget] = useState<CameraRow | null>(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

  const selectedCamera = cameras.find(c => c.id === selectedCameraId) ?? null;

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

  // Real-time status updates via Socket.IO
  useCameraStatus(orgId, (event) => {
    setCameras((prev) =>
      prev.map((c) =>
        c.id === event.cameraId
          ? { ...c, status: event.status as CameraRow['status'] }
          : c
      )
    );
  });

  // Action handlers
  function handleEdit(camera: CameraRow) {
    setEditCamera(camera);
  }

  function handleViewStream(camera: CameraRow) {
    setSelectedCameraId(camera.id);
    // View Stream Sheet — wired in Plan 03
  }

  async function handleStreamToggle(camera: CameraRow) {
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
  }

  async function handleRecordToggle(camera: CameraRow) {
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
  }

  function handleEmbedCode(camera: CameraRow) {
    setEmbedCamera(camera);
  }

  function handleDelete(camera: CameraRow) {
    setDeleteCamera(camera);
  }

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

  function handleMaintenanceToggle(camera: CameraRow) {
    setMaintenanceTarget(camera);
  }

  async function confirmMaintenanceToggle() {
    if (!maintenanceTarget) return;
    const entering = !maintenanceTarget.maintenanceMode;
    setMaintenanceLoading(true);
    try {
      const res = await fetch(`/api/cameras/${maintenanceTarget.id}/maintenance`, {
        method: entering ? 'POST' : 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      toast.success(
        entering
          ? `กล้อง "${maintenanceTarget.name}" อยู่ในโหมดซ่อมบำรุงแล้ว`
          : 'ออกจากโหมดซ่อมบำรุงแล้ว — คลิก Start Stream เพื่อเริ่มสตรีม',
      );
      setMaintenanceTarget(null);
      await fetchCameras();
    } catch {
      toast.error(
        entering
          ? 'ไม่สามารถเข้าโหมดซ่อมบำรุงได้ กรุณาลองใหม่'
          : 'ไม่สามารถออกจากโหมดซ่อมบำรุงได้ กรุณาลองใหม่',
      );
    } finally {
      setMaintenanceLoading(false);
    }
  }

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

      <CamerasDataTable
        cameras={cameras}
        loading={isLoading}
        onEdit={handleEdit}
        onViewStream={handleViewStream}
        onDelete={handleDelete}
        onRecordToggle={handleRecordToggle}
        onStreamToggle={handleStreamToggle}
        onMaintenanceToggle={handleMaintenanceToggle}
        onEmbedCode={handleEmbedCode}
        onCreateCamera={() => setCreateDialogOpen(true)}
        onImportCameras={() => setImportDialogOpen(true)}
        view={view}
        onViewChange={setView}
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

      {/* Delete confirmation */}
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

      {/* Maintenance confirmation */}
      <AlertDialog
        open={!!maintenanceTarget}
        onOpenChange={(open) => {
          if (!open && !maintenanceLoading) setMaintenanceTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {maintenanceTarget?.maintenanceMode
                ? 'ออกจากโหมดซ่อมบำรุง?'
                : 'เข้าโหมดซ่อมบำรุง?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {maintenanceTarget?.maintenanceMode ? (
                <>
                  กล้อง &quot;{maintenanceTarget?.name}&quot; จะกลับมารับการแจ้งเตือนและ webhook ตามปกติ{' '}
                  <strong className="font-semibold">
                    สตรีมจะยังไม่เริ่มใหม่โดยอัตโนมัติ
                  </strong>{' '}
                  — คลิก &quot;Start Stream&quot; เพื่อเริ่มใหม่เมื่อพร้อม
                </>
              ) : (
                <>
                  การเข้าโหมดซ่อมบำรุงจะ
                  <strong className="font-semibold">หยุดสตรีม</strong>{' '}
                  ของกล้อง &quot;{maintenanceTarget?.name}&quot; และระงับการแจ้งเตือน (notifications + webhooks) จนกว่าจะออกจากโหมดนี้ การบันทึก (recording) จะหยุดไปด้วย
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={maintenanceLoading}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              variant={maintenanceTarget?.maintenanceMode ? 'default' : 'destructive'}
              onClick={confirmMaintenanceToggle}
              disabled={maintenanceLoading}
            >
              {maintenanceTarget?.maintenanceMode ? 'ออกจากโหมด' : 'เข้าโหมดซ่อมบำรุง'}
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
        onOpenChange={(open) => { if (!open) setSelectedCameraId(null) }}
        onStreamToggle={handleStreamToggle}
        onRecordToggle={handleRecordToggle}
      />
    </div>
  );
}
