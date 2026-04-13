'use client';

import { useState, useMemo, useCallback } from 'react';
import { Download, Trash2 } from 'lucide-react';

import { useFeatureCheck } from '@/hooks/use-feature-check';
import {
  useRecordingStatus,
  useRecordingTimeline,
  useRecordingCalendar,
  useRecordingsList,
  deleteRecording,
  type Recording,
} from '@/hooks/use-recordings';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { HlsPlayer } from './hls-player';
import { TimelineBar } from './timeline-bar';
import { RecordingControls } from './recording-controls';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

interface RecordingsTabProps {
  camera: {
    id: string;
    orgId: string;
    isRecording: boolean;
    retentionDays: number | null;
  };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '-';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function StatusBadge({ status }: { status: Recording['status'] }) {
  switch (status) {
    case 'complete':
      return (
        <Badge className="bg-chart-1 text-white hover:bg-chart-1/90">
          Complete
        </Badge>
      );
    case 'recording':
      return (
        <Badge className="bg-chart-5 text-white animate-pulse hover:bg-chart-5/90">
          Recording
        </Badge>
      );
    case 'processing':
      return (
        <Badge className="bg-chart-4 text-white hover:bg-chart-4/90">
          Processing
        </Badge>
      );
    default:
      return <Badge variant="destructive">Error</Badge>;
  }
}

export function RecordingsTab({ camera }: RecordingsTabProps) {
  const { enabled: featureEnabled, loading: featureLoading } =
    useFeatureCheck('recordings');

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [playerRecordingId, setPlayerRecordingId] = useState<string | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Recording | null>(null);

  const dateStr = formatDate(selectedDate);
  const calYear = selectedDate.getFullYear();
  const calMonth = selectedDate.getMonth() + 1;

  const { isRecording, refetch: refetchStatus } = useRecordingStatus(
    camera.id,
  );
  const { hours, loading: timelineLoading } = useRecordingTimeline(
    camera.id,
    dateStr,
  );
  const { days: calendarDays } = useRecordingCalendar(
    camera.id,
    calYear,
    calMonth,
  );
  const {
    recordings,
    loading: listLoading,
    refetch: refetchList,
  } = useRecordingsList(camera.id, dateStr);

  // Build dates that have recordings for calendar modifiers
  const daysWithRecordings = useMemo(() => {
    return calendarDays.map(
      (d) => new Date(calYear, calMonth - 1, d),
    );
  }, [calendarDays, calYear, calMonth]);

  const handleRecordingChange = useCallback(() => {
    refetchStatus();
    refetchList();
  }, [refetchStatus, refetchList]);

  const handleSeek = useCallback(
    (hour: number) => {
      // Find the recording that covers this hour
      const target = recordings.find((r) => {
        const startH = new Date(r.startedAt).getHours();
        const endH = r.stoppedAt
          ? new Date(r.stoppedAt).getHours()
          : 24;
        return hour >= startH && hour < endH;
      });
      if (target) {
        setPlayerRecordingId(target.id);
        setSelectedRange({ start: hour, end: Math.min(hour + 1, 24) });
      }
    },
    [recordings],
  );

  const handleRangeSelect = useCallback(
    (start: number, end: number) => {
      setSelectedRange({ start, end });
      // Find first recording in range
      const target = recordings.find((r) => {
        const startH = new Date(r.startedAt).getHours();
        return startH >= Math.floor(start) && startH < Math.ceil(end);
      });
      if (target) {
        setPlayerRecordingId(target.id);
      }
    },
    [recordings],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteRecording(deleteTarget.id);
      refetchList();
    } catch {
      // Error handled at API level
    }
    setDeleteTarget(null);
  }, [deleteTarget, refetchList]);

  // Build HLS source URL from selected recording and range
  const hlsSrc = useMemo(() => {
    if (!playerRecordingId) return null;
    let url = `${API_BASE}/api/recordings/${playerRecordingId}/manifest`;
    if (selectedRange) {
      const base = new Date(selectedDate);
      const startDate = new Date(base);
      startDate.setHours(Math.floor(selectedRange.start), Math.round((selectedRange.start % 1) * 60), 0, 0);
      const endDate = new Date(base);
      endDate.setHours(Math.floor(selectedRange.end), Math.round((selectedRange.end % 1) * 60), 0, 0);
      url += `?start=${startDate.toISOString()}&end=${endDate.toISOString()}`;
    }
    return url;
  }, [playerRecordingId, selectedRange, selectedDate]);

  // Feature gate
  if (featureLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!featureEnabled) {
    return (
      <div className="py-16 text-center">
        <h3 className="text-lg font-semibold">Recordings not available</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          The recordings feature is not included in your current plan. Contact
          your administrator to upgrade.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Recording Controls */}
      <RecordingControls
        cameraId={camera.id}
        isRecording={isRecording}
        onScheduleClick={() => setScheduleOpen(true)}
        onRecordingChange={handleRecordingChange}
      />

      {/* Calendar + Timeline */}
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="w-full md:w-[280px]">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (date) setSelectedDate(date);
            }}
            modifiers={{ hasRecording: daysWithRecordings }}
            modifiersStyles={{
              hasRecording: {
                fontWeight: 600,
                borderBottom: '2px solid hsl(var(--chart-1))',
              },
            }}
          />
        </div>
        {timelineLoading ? (
          <Skeleton className="h-24 flex-1 rounded-lg" />
        ) : (
          <TimelineBar
            hours={hours}
            selectedRange={selectedRange}
            onRangeSelect={handleRangeSelect}
            onSeek={handleSeek}
          />
        )}
      </div>

      {/* HLS Player */}
      <div className="max-w-[800px]">
        {hlsSrc ? (
          <HlsPlayer src={hlsSrc} autoPlay={false} />
        ) : recordings.length > 0 ? (
          <div className="flex aspect-video items-center justify-center rounded-lg border bg-[hsl(0,0%,9%)]">
            <p className="text-sm text-muted-foreground">
              Select a time range on the timeline to play a recording.
            </p>
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-lg border bg-[hsl(0,0%,9%)]">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                No recordings for this date
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                No footage was recorded on this date. Select a different date
                from the calendar.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Recordings List */}
      {listLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : recordings.length === 0 ? (
        <div className="py-12 text-center">
          <h3 className="text-lg font-semibold">No recordings yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Start recording to capture footage from this camera. Use the Start
            Recording button or set up a schedule.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time Range</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordings.map((rec) => (
              <TableRow key={rec.id}>
                <TableCell>
                  {formatTime(rec.startedAt)}
                  {rec.stoppedAt ? ` - ${formatTime(rec.stoppedAt)}` : ' - ...'}
                </TableCell>
                <TableCell>{formatDuration(rec.totalDuration)}</TableCell>
                <TableCell>{formatSize(rec.totalSize)}</TableCell>
                <TableCell>
                  <StatusBadge status={rec.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Download recording"
                      onClick={() => {
                        window.open(
                          `${API_BASE}/api/recordings/${rec.id}/manifest`,
                          '_blank',
                        );
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete recording"
                      onClick={() => setDeleteTarget(rec)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Schedule dialog slot -- wired in Task 2 */}
      {scheduleOpen && (
        <div />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recording</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this recording and free up storage
              space. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Recording
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
