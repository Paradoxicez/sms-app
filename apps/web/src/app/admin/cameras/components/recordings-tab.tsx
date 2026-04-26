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
import { formatDuration, formatSize } from '@/lib/format-utils';
import { RecordingStatusBadge } from '@/components/recording-status-badge';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
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
import { HlsPlayer } from '@/components/recordings/hls-player';
import { TimelineBar } from '@/components/recordings/timeline-bar';
import { RecordingControls } from './recording-controls';
import { ScheduleDialog } from './schedule-dialog';
import { RetentionSettings } from './retention-settings';

// Use relative URLs so requests go through Next.js rewrites (same-origin cookies)
// API_BASE is only needed for non-fetch operations (e.g., download links opened in new tabs)
const API_BASE = '';

interface RecordingsTabProps {
  camera: {
    id: string;
    orgId: string;
    isRecording: boolean;
    retentionDays: number | null;
  };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  const calYear = selectedDate.getFullYear();
  const calMonth = selectedDate.getMonth() + 1;

  const { isRecording, refetch: refetchStatus } = useRecordingStatus(
    camera.id,
  );
  // Hooks now take a Date and compute the local-day UTC window internally.
  // Pre-fix we passed a `YYYY-MM-DD` string that the backend interpreted as
  // a UTC day, which mis-bucketed the timeline by the user's UTC offset.
  // See debug session recordings-detail-timeline-timezone-mismatch.md.
  const { hours, loading: timelineLoading } = useRecordingTimeline(
    camera.id,
    selectedDate,
  );
  const { days: calendarDays } = useRecordingCalendar(
    camera.id,
    selectedDate,
  );
  const {
    recordings,
    loading: listLoading,
    refetch: refetchList,
  } = useRecordingsList(camera.id, selectedDate);

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

  // Timeline buckets are 0..23 of the user's local day (backend buckets
  // relative to the supplied window start). Read recording hours via local
  // getHours() — NOT getUTCHours() — to keep seek/range-select aligned.
  const handleSeek = useCallback(
    (hour: number) => {
      const target = recordings.find((r) => {
        const startH = new Date(r.startedAt).getHours();
        const endH = r.stoppedAt
          ? new Date(r.stoppedAt).getHours() + 1
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
    // Skip time range filter — play the full recording
    return `/api/recordings/${playerRecordingId}/manifest`;
  }, [playerRecordingId]);

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
          <HlsPlayer src={hlsSrc} autoPlay={false} mode="vod" />
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
              <TableRow
                key={rec.id}
                className="cursor-pointer"
                onClick={() => {
                  setPlayerRecordingId(rec.id);
                  // Read local hours so the highlighted range on the timeline
                  // matches the table's local-formatted Time Range column.
                  const startH = new Date(rec.startedAt).getHours();
                  const endH = rec.stoppedAt ? new Date(rec.stoppedAt).getHours() + 1 : startH + 1;
                  setSelectedRange({ start: startH, end: Math.min(endH, 24) });
                }}
              >
                <TableCell>
                  {formatTime(rec.startedAt)}
                  {rec.stoppedAt ? ` - ${formatTime(rec.stoppedAt)}` : ' - ...'}
                </TableCell>
                <TableCell>{formatDuration(rec.totalDuration)}</TableCell>
                <TableCell>{formatSize(rec.totalSize)}</TableCell>
                <TableCell>
                  <RecordingStatusBadge status={rec.status} />
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

      {/* Retention Settings */}
      <RetentionSettings
        cameraId={camera.id}
        currentRetentionDays={camera.retentionDays}
        orgDefaultDays={30}
      />

      {/* Schedule Dialog */}
      <ScheduleDialog
        cameraId={camera.id}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onSaved={handleRecordingChange}
      />

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
