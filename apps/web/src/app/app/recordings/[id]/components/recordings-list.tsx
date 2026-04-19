'use client';

import { Play } from 'lucide-react';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { RecordingStatusBadge } from '@/components/recording-status-badge';
import { formatDuration, formatSize } from '@/lib/format-utils';
import type { Recording } from '@/hooks/use-recordings';

export interface RecordingsListProps {
  recordings: Recording[];
  loading: boolean;
  currentRecordingId: string;
  selectedDate: Date;
  onRowClick: (id: string) => void;
}

export function RecordingsList({
  recordings,
  loading,
  currentRecordingId,
  selectedDate,
  onRowClick,
}: RecordingsListProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">
        Recordings on {format(selectedDate, 'MMM d, yyyy')}
      </h2>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Time Range</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={`s-${i}`}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={`sc-${i}-${j}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : recordings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <p className="text-sm font-medium">No recordings on this date</p>
                  <p className="text-sm text-muted-foreground">
                    Use the date picker or arrows above to navigate to a date with footage.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              recordings.map((rec) => {
                const isCurrent = rec.id === currentRecordingId;
                const start = format(new Date(rec.startedAt), 'HH:mm');
                const end = rec.stoppedAt
                  ? format(new Date(rec.stoppedAt), 'HH:mm')
                  : '...';
                return (
                  <TableRow
                    key={rec.id}
                    tabIndex={0}
                    className={`cursor-pointer ${isCurrent ? 'bg-accent/40' : ''}`}
                    onClick={() => onRowClick(rec.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(rec.id);
                      }
                    }}
                    aria-label={`Open recording ${start} - ${end}`}
                  >
                    <TableCell>
                      {isCurrent && (
                        <Play className="size-4 text-primary" aria-label="Now playing" />
                      )}
                    </TableCell>
                    <TableCell>{`${start} - ${end}`}</TableCell>
                    <TableCell>{formatDuration(rec.totalDuration ?? null)}</TableCell>
                    <TableCell>{formatSize(rec.totalSize ?? null)}</TableCell>
                    <TableCell>
                      <RecordingStatusBadge status={rec.status} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
