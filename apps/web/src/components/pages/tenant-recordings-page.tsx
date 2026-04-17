'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Trash2 } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { formatDuration, formatSize } from '@/lib/format-utils';
import { RecordingStatusBadge } from '@/components/recording-status-badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Skeleton } from '@/components/ui/skeleton';

interface Camera {
  id: string;
  name: string;
}

interface Recording {
  id: string;
  cameraId: string;
  status: 'recording' | 'complete' | 'processing' | 'error';
  startedAt: string;
  stoppedAt?: string | null;
  totalSize?: number | null;
  totalDuration?: number | null;
  camera?: { name: string };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}


export default function TenantRecordingsPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState('all');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch cameras list for filter
  useEffect(() => {
    apiFetch<Camera[]>('/api/cameras')
      .then(setCameras)
      .catch(() => setCameras([]));
  }, []);

  const fetchRecordings = useCallback(async () => {
    if (!selectedCamera) {
      setRecordings([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('date', startDate.toISOString().split('T')[0]);
      const data = await apiFetch<Recording[]>(
        `/api/recordings/camera/${selectedCamera}?${params.toString()}`,
      );
      // Client-side filters for status and date range
      let filtered = data;
      if (statusFilter !== 'all') {
        filtered = filtered.filter((r) => r.status === statusFilter);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter(
          (r) => new Date(r.startedAt) <= end,
        );
      }
      setRecordings(filtered);
    } catch {
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCamera, startDate, endDate, statusFilter]);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === recordings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recordings.map((r) => r.id)));
    }
  }

  async function handleDeleteSelected() {
    setDeleting(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          apiFetch(`/api/recordings/${id}`, { method: 'DELETE' }),
        ),
      );
      setSelectedIds(new Set());
      fetchRecordings();
    } catch {
      // Partial failure handled
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  }

  const cameraName = (cameraId: string) =>
    cameras.find((c) => c.id === cameraId)?.name ?? cameraId;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Recordings</h1>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Camera</Label>
          <Select
            value={selectedCamera}
            onValueChange={(v) => setSelectedCamera(String(v ?? ''))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select camera" />
            </SelectTrigger>
            <SelectContent>
              {cameras.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <DatePicker
            date={startDate}
            onDateChange={setStartDate}
            placeholder="Start date"
            className="w-[160px]"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">End Date</Label>
          <DatePicker
            date={endDate}
            onDateChange={setEndDate}
            placeholder="End date"
            className="w-[160px]"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(String(v ?? 'all'))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="recording">Recording</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Selected Recordings ({selectedIds.size})
          </Button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !selectedCamera ? (
        <div className="py-16 text-center">
          <h3 className="text-lg font-semibold">Select a camera</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a camera from the filter above to view its recordings.
          </p>
        </div>
      ) : recordings.length === 0 ? (
        <div className="py-16 text-center">
          <h3 className="text-lg font-semibold">No recordings found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            No recordings match your current filters. Try adjusting the date
            range or camera selection.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size === recordings.length}
                  onChange={toggleSelectAll}
                  aria-label="Select all recordings"
                />
              </TableHead>
              <TableHead>Camera</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Time Range</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordings.map((rec) => (
              <TableRow key={rec.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(rec.id)}
                    onChange={() => toggleSelect(rec.id)}
                    aria-label={`Select recording from ${formatTime(rec.startedAt)}`}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/app/cameras/${rec.cameraId}?tab=recordings`}
                    className="text-primary hover:underline"
                  >
                    {rec.camera?.name ?? cameraName(rec.cameraId)}
                  </Link>
                </TableCell>
                <TableCell>{formatDate(rec.startedAt)}</TableCell>
                <TableCell>
                  {formatTime(rec.startedAt)}
                  {rec.stoppedAt
                    ? ` - ${formatTime(rec.stoppedAt)}`
                    : ' - ...'}
                </TableCell>
                <TableCell>{formatDuration(rec.totalDuration)}</TableCell>
                <TableCell>{formatSize(rec.totalSize)}</TableCell>
                <TableCell>
                  <RecordingStatusBadge status={rec.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Recordings</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected recordings. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Recordings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
