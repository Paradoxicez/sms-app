'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Circle, Square, Clock, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
} from '@/components/ui/progress';
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
import {
  startRecording,
  stopRecording,
  useStorageQuota,
} from '@/hooks/use-recordings';

interface RecordingControlsProps {
  cameraId: string;
  isRecording: boolean;
  onScheduleClick: () => void;
  onRecordingChange: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb < 1 ? `${(gb * 1024).toFixed(0)} MB` : `${gb.toFixed(1)} GB`;
}

export function RecordingControls({
  cameraId,
  isRecording,
  onScheduleClick,
  onRecordingChange,
}: RecordingControlsProps) {
  const [loading, setLoading] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const { quota } = useStorageQuota();

  async function handleStart() {
    setLoading(true);
    try {
      await startRecording(cameraId);
      onRecordingChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start recording');
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setStopDialogOpen(false);
    setLoading(true);
    try {
      await stopRecording(cameraId);
      onRecordingChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop recording');
    } finally {
      setLoading(false);
    }
  }

  const percentage = quota?.percentage ?? 0;
  const storageColorClass =
    percentage > 90
      ? '[&_[data-slot=progress-indicator]]:bg-chart-5'
      : percentage > 80
        ? '[&_[data-slot=progress-indicator]]:bg-chart-4'
        : '[&_[data-slot=progress-indicator]]:bg-chart-1';

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRecording ? (
            <>
              <Button
                variant="destructive"
                onClick={() => setStopDialogOpen(true)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Square className="mr-2 h-4 w-4" />
                )}
                Stop Recording
              </Button>
              <Badge variant="destructive" className="animate-pulse">
                REC
              </Badge>
            </>
          ) : (
            <Button onClick={handleStart} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Circle className="mr-2 h-4 w-4" />
              )}
              Start Recording
            </Button>
          )}
          <Button variant="outline" onClick={onScheduleClick}>
            <Clock className="mr-2 h-4 w-4" />
            Set Schedule
          </Button>
        </div>

        {quota && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {formatBytes(quota.usedBytes)} / {formatBytes(quota.limitBytes)}{' '}
              used
            </span>
            <Progress
              value={percentage}
              className={`w-[120px] ${storageColorClass}`}
              aria-label={`Storage usage: ${percentage.toFixed(0)}% (${formatBytes(quota.usedBytes)} of ${formatBytes(quota.limitBytes)})`}
            >
              <ProgressTrack className="h-2">
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
          </div>
        )}
      </div>

      <AlertDialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Recording</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop the current recording. The footage captured so far
              will be saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStop}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Stop Recording
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
