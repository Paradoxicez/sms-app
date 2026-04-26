'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentRole } from '@/hooks/use-current-role';
import { useFeatures } from '@/hooks/use-features';
import {
  useRecording,
  useRecordingTimeline,
  useRecordingsList,
  useRecordingCalendar,
} from '@/hooks/use-recordings';
import { FeatureGateEmptyState } from '@/components/feature-gate-empty-state';
import { HlsPlayer } from '@/components/recordings/hls-player';
import { TimelineBar } from '@/components/recordings/timeline-bar';
import { PlaybackPageHeader } from './components/playback-page-header';
import { RecordingsList } from './components/recordings-list';

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function PlaybackSkeleton() {
  return (
    <div className="container mx-auto space-y-6 py-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="aspect-video w-full max-w-[1024px] mx-auto rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}

export default function PlaybackPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const id = params.id;

  const { activeOrgId, loading: roleLoading } = useCurrentRole();
  const { isEnabled, loading: featuresLoading } = useFeatures(activeOrgId);
  const { recording, loading: recordingLoading, error: recordingError } = useRecording(id);

  // selectedDate is user-driven; initialize once from the recording (Pitfall 1)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [didInitDate, setDidInitDate] = useState(false);
  useEffect(() => {
    if (!recording || didInitDate) return;
    setSelectedDate(new Date(recording.startedAt));
    setDidInitDate(true);
  }, [recording, didInitDate]);

  // displayedMonth tracks calendar nav independent of selectedDate (Pitfall 6)
  const [displayedMonth, setDisplayedMonth] = useState<Date | null>(null);
  useEffect(() => {
    if (selectedDate && !displayedMonth) setDisplayedMonth(selectedDate);
  }, [selectedDate, displayedMonth]);

  const cameraId = recording?.cameraId;
  // Hooks now take a Date (the user's local-day selection) and compute the
  // UTC window internally. Pre-fix we passed a `YYYY-MM-DD` string and the
  // backend mis-interpreted it as a UTC day, causing the timeline-vs-table
  // 7-hour offset for any non-UTC user. See debug session
  // recordings-detail-timeline-timezone-mismatch.md.
  const { hours, loading: timelineLoading } = useRecordingTimeline(
    cameraId,
    selectedDate ?? undefined,
  );
  const { recordings, loading: listLoading, refetch: refetchRecordings } =
    useRecordingsList(cameraId, selectedDate ?? undefined);
  const { days } = useRecordingCalendar(cameraId, displayedMonth ?? undefined);

  // After date change, navigate to first recording on the new date (D-05)
  useEffect(() => {
    if (!recordings.length || !selectedDate || !recording) return;
    const dateStr = formatDateStr(selectedDate);
    const currentRecordingDate = formatDateStr(new Date(recording.startedAt));
    if (
      dateStr !== currentRecordingDate &&
      !recordings.some((r) => r.id === id)
    ) {
      router.push(`/app/recordings/${recordings[0].id}`);
    }
  }, [recordings, selectedDate, recording, id, router]);

  // Timeline click -> navigate to recording at that hour (D-09).
  // The timeline indexes hours 0..23 over the user's local day (the backend
  // buckets relative to the supplied window start). To match those buckets
  // we read the recording's local hour via getHours() — NOT getUTCHours().
  const handleSeek = useCallback(
    (hour: number) => {
      const target = recordings.find((r) => {
        const sH = new Date(r.startedAt).getHours();
        const eH = r.stoppedAt
          ? new Date(r.stoppedAt).getHours() + 1
          : 24;
        return hour >= sH && hour < eH;
      });
      if (target && target.id !== id) {
        router.push(`/app/recordings/${target.id}`);
      }
    },
    [recordings, id, router],
  );

  const handleRangeSelect = useCallback(
    (start: number, _end: number) => {
      handleSeek(Math.floor(start));
    },
    [handleSeek],
  );

  const handleListRowClick = useCallback(
    (rowId: string) => {
      if (rowId !== id) router.push(`/app/recordings/${rowId}`);
    },
    [id, router],
  );

  const handleListDeleted = useCallback(
    (deletedId: string) => {
      // Only act when the user deleted the recording they're currently watching.
      // For non-current deletes, the refetch in RecordingsList already updated the list.
      if (deletedId !== id) return;
      // `recordings` here is the post-refetch list (RecordingsList awaits refetch
      // before invoking onDeleted). The .filter is a defensive safety net in case
      // the deleted row hasn't been pruned yet.
      const next = recordings.find((r) => r.id !== deletedId);
      if (next) {
        router.push(`/app/recordings/${next.id}`);
      } else {
        router.push('/app/recordings');
      }
    },
    [id, recordings, router],
  );

  const hlsSrc = useMemo(() => `/api/recordings/${id}/manifest`, [id]);

  // ---- Render ----
  if (roleLoading || featuresLoading) {
    return <Skeleton className="h-8 w-32" />;
  }
  if (!isEnabled('recordings')) {
    return (
      <FeatureGateEmptyState
        featureName="Recordings"
        featureSlug="recordings"
      />
    );
  }
  if (recordingError === 'not-found') {
    return (
      <div className="container mx-auto space-y-4 py-12 text-center">
        <h1 className="text-xl font-semibold">Recording not available</h1>
        <p className="text-sm text-muted-foreground">
          This recording may have been deleted or expired. Return to the
          Recordings list to view available footage.
        </p>
        <Button variant="ghost" onClick={() => router.push('/app/recordings')}>
          Back to Recordings
        </Button>
      </div>
    );
  }
  if (recordingError === 'forbidden') {
    return (
      <FeatureGateEmptyState
        featureName="Recordings"
        featureSlug="recordings"
      />
    );
  }
  if (recordingError === 'network') {
    return (
      <div className="container mx-auto space-y-4 py-12 text-center">
        <h1 className="text-xl font-semibold">Couldn&apos;t load recording</h1>
        <p className="text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
        <Button
          variant="ghost"
          onClick={() => {
            if (typeof window !== 'undefined') window.location.reload();
          }}
        >
          <RotateCw className="mr-2 size-4" />
          Retry
        </Button>
      </div>
    );
  }
  if (recordingLoading || !recording || !selectedDate) {
    return <PlaybackSkeleton />;
  }

  return (
    <div className="container mx-auto space-y-6 py-6">
      <PlaybackPageHeader
        cameraName={recording.camera?.name ?? 'Recording'}
        siteName={recording.camera?.site?.name}
        projectName={recording.camera?.site?.project?.name}
        selectedDate={selectedDate}
        displayedMonth={displayedMonth ?? selectedDate}
        daysWithRecordings={days}
        onDateChange={setSelectedDate}
        onMonthChange={setDisplayedMonth}
        onBack={() => router.back()}
      />

      <div className="mx-auto max-w-[1024px]">
        <HlsPlayer key={id} src={hlsSrc} autoPlay={false} mode="vod" />
      </div>

      {timelineLoading ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : (
        <TimelineBar
          hours={hours}
          selectedRange={null}
          onRangeSelect={handleRangeSelect}
          onSeek={handleSeek}
        />
      )}

      <RecordingsList
        recordings={recordings}
        loading={listLoading}
        currentRecordingId={id}
        selectedDate={selectedDate}
        onRowClick={handleListRowClick}
        onDeleted={handleListDeleted}
        refetch={refetchRecordings}
      />
    </div>
  );
}
