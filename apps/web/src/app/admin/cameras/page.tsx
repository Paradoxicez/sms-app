'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Upload, Camera as CameraIcon, Filter } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useCameraStatus } from '@/hooks/use-camera-status';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CameraStatusDot, CameraStatusBadge } from './components/camera-status-badge';
import { CameraFormDialog } from './components/camera-form-dialog';
import { BulkImportDialog } from './components/bulk-import-dialog';

type CameraStatus = 'online' | 'offline' | 'degraded' | 'connecting' | 'reconnecting';

interface CameraItem {
  id: string;
  name: string;
  status: CameraStatus;
  streamUrl: string;
  codecInfo?: {
    video?: string;
    width?: number;
    height?: number;
  } | null;
  createdAt: string;
  site?: {
    id: string;
    name: string;
    project?: {
      id: string;
      name: string;
    };
  };
}

const ALL_STATUSES: CameraStatus[] = ['online', 'offline', 'degraded', 'connecting', 'reconnecting'];

export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Set<CameraStatus>>(new Set());
  const [orgId, setOrgId] = useState<string | undefined>(undefined);

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
      const data = await apiFetch<CameraItem[]>('/api/cameras');
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
  useCameraStatus(
    orgId,
    (event) => {
      setCameras((prev) =>
        prev.map((c) =>
          c.id === event.cameraId ? { ...c, status: event.status as CameraStatus } : c,
        ),
      );
    },
  );

  const filteredCameras =
    statusFilter.size === 0
      ? cameras
      : cameras.filter((c) => statusFilter.has(c.status));

  function toggleStatusFilter(status: CameraStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cameras</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import Cameras
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Camera
          </Button>
        </div>
      </div>

      {/* Status filter */}
      {cameras.length > 0 && (
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <Filter className="h-3 w-3" />
              Status
              {statusFilter.size > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {statusFilter.size}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleStatusFilter(s)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted ${
                    statusFilter.has(s) ? 'bg-muted font-medium' : ''
                  }`}
                >
                  <CameraStatusDot status={s} />
                  <span className="capitalize">{s}</span>
                </button>
              ))}
              {statusFilter.size > 0 && (
                <button
                  onClick={() => setStatusFilter(new Set())}
                  className="mt-1 w-full rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  Clear filters
                </button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !error && filteredCameras.length === 0 && cameras.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CameraIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No cameras registered</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add your first camera to start streaming. You can add cameras individually or import in bulk.
          </p>
          <Button onClick={() => setDialogOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Add Camera
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Status</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Codec</TableHead>
              <TableHead>Resolution</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCameras.map((cam) => (
              <TableRow key={cam.id}>
                <TableCell>
                  <CameraStatusBadge status={cam.status} showLabel={false} />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/cameras/${cam.id}`}
                    className="font-medium hover:underline"
                  >
                    {cam.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {cam.site?.project?.name || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {cam.site?.name || '-'}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {cam.codecInfo?.video || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {cam.codecInfo?.width && cam.codecInfo?.height
                    ? `${cam.codecInfo.width}x${cam.codecInfo.height}`
                    : '-'}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(cam.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CameraFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchCameras}
      />

      <BulkImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={fetchCameras}
      />
    </div>
  );
}
