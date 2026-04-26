'use client';

import * as React from 'react';
import { Download, Loader2, Play, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';

import {
  DataTable,
  DataTableRowActions,
  type RowAction,
} from '@/components/ui/data-table';
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
import { RecordingStatusBadge } from '@/components/recording-status-badge';
import { formatDuration, formatSize } from '@/lib/format-utils';
import { deleteRecording, type Recording } from '@/hooks/use-recordings';

export interface RecordingsListProps {
  recordings: Recording[];
  loading: boolean;
  currentRecordingId: string;
  selectedDate: Date;
  onRowClick: (id: string) => void;
  onDeleted: (deletedId: string) => void;
  refetch: () => Promise<void>;
}

export function RecordingsList({
  recordings,
  loading,
  currentRecordingId,
  selectedDate,
  onRowClick,
  onDeleted,
  refetch,
}: RecordingsListProps) {
  const [deleteTarget, setDeleteTarget] = React.useState<Recording | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const handleDownload = React.useCallback((rec: Recording) => {
    window.open(`/api/recordings/${rec.id}/download`, '_blank');
    toast('Download started');
  }, []);

  const confirmDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRecording(deleteTarget.id);
      toast('Recording deleted');
      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      await refetch();
      onDeleted(deletedId);
    } catch {
      toast.error('Failed to delete recording');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, refetch, onDeleted]);

  const columns = React.useMemo<ColumnDef<Recording>[]>(
    () => [
      {
        id: 'now-playing',
        header: '',
        enableSorting: false,
        size: 32,
        cell: ({ row }) =>
          row.original.id === currentRecordingId ? (
            <Play className="size-4 text-primary" aria-label="Now playing" />
          ) : null,
      },
      {
        id: 'timeRange',
        header: 'Time Range',
        enableSorting: false,
        cell: ({ row }) => {
          const start = format(new Date(row.original.startedAt), 'HH:mm');
          const end = row.original.stoppedAt
            ? format(new Date(row.original.stoppedAt), 'HH:mm')
            : '...';
          return `${start} - ${end}`;
        },
      },
      {
        accessorKey: 'totalDuration',
        header: 'Duration',
        cell: ({ getValue }) => formatDuration(getValue<number | null>()),
      },
      {
        accessorKey: 'totalSize',
        header: 'Size',
        cell: ({ getValue }) => formatSize(getValue<number | null>()),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => (
          <RecordingStatusBadge status={getValue<Recording['status']>()} />
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        size: 40,
        cell: ({ row }) => {
          const recording = row.original;
          const actions: RowAction<Recording>[] = [
            {
              label: 'Download',
              icon: Download,
              onClick: () => handleDownload(recording),
            },
            {
              label: 'Delete',
              icon: Trash2,
              variant: 'destructive',
              onClick: () => setDeleteTarget(recording),
            },
          ];
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <DataTableRowActions row={row} actions={actions} />
            </div>
          );
        },
      },
    ],
    [currentRecordingId, handleDownload],
  );

  const deleteCopy = React.useMemo(() => {
    if (!deleteTarget) return '';
    const start = format(new Date(deleteTarget.startedAt), 'HH:mm');
    const end = deleteTarget.stoppedAt
      ? format(new Date(deleteTarget.stoppedAt), 'HH:mm')
      : '...';
    return `This recording (${start} – ${end}, ${formatSize(deleteTarget.totalSize ?? null)}) will be permanently removed. This action cannot be undone.`;
  }, [deleteTarget]);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">
        Recordings on {format(selectedDate, 'MMM d, yyyy')}
      </h2>

      <DataTable
        columns={columns}
        data={recordings}
        loading={loading}
        emptyState={{
          title: 'No recordings on this date',
          description:
            'Use the date picker or arrows above to navigate to a date with footage.',
        }}
        onRowClick={(rec) => onRowClick(rec.id)}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recording?</AlertDialogTitle>
            <AlertDialogDescription>{deleteCopy}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete recording'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
