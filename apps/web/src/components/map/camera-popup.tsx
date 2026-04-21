'use client';

import { memo, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  ExternalLink,
  Film,
  MapPin,
  MoreVertical,
  Play,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

interface CameraPopupProps {
  id: string;
  name: string;
  status: string;
  viewerCount?: number;
  // Phase 18 fields
  isRecording?: boolean;
  maintenanceMode?: boolean;
  maintenanceEnteredBy?: string | null;
  maintenanceEnteredAt?: string | null;
  lastOnlineAt?: string | null;
  retentionDays?: number | null;
  onViewStream?: (id: string) => void;
  onSetLocation?: (id: string, name: string) => void;
  onViewRecordings?: (id: string) => void;
  onToggleMaintenance?: (id: string, nextState: boolean) => void;
  onOpenDetail?: (id: string) => void;
}

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  online: 'default',
  offline: 'destructive',
  degraded: 'outline',
  connecting: 'secondary',
  reconnecting: 'outline',
};

// Memoized so viewerCount broadcasts do not tear down + re-attach HLS.
// Without this, every camera:viewers event caused a remount → new SRS
// `on_play` → viewerCount broadcast → remount loop, which produced the
// flicker and a runaway viewer count.
const PreviewVideo = memo(function PreviewVideo({ id, status }: { id: string; status: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    if (status !== 'online' || !videoRef.current) return;

    const hlsUrl = `/api/cameras/${id}/preview/playlist.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
        maxBufferLength: 5,
        maxMaxBufferLength: 10,
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current);
      hlsRef.current = hls;
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = hlsUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [id, status]);

  if (status !== 'online') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-xs text-gray-400">Stream offline</span>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      muted
      autoPlay
      playsInline
      className="h-full w-full object-cover"
    />
  );
});

export function CameraPopup({
  id,
  name,
  status,
  viewerCount,
  isRecording,
  maintenanceMode,
  maintenanceEnteredBy,
  maintenanceEnteredAt,
  lastOnlineAt,
  retentionDays,
  onViewStream,
  onSetLocation,
  onViewRecordings,
  onToggleMaintenance,
  onOpenDetail,
}: CameraPopupProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const showRecOverlay = Boolean(isRecording) && status === 'online';
  const showMaintOverlay = Boolean(maintenanceMode) && status === 'online';

  return (
    <div className="space-y-2 p-1">
      {/* Preview container 240×135 (16:9). Status overlay is SIBLING to PreviewVideo.
          CRITICAL: PreviewVideo is a direct child receiving only {id, status}. If it
          ever accepts viewerCount or other parent-scope props, the memo() escape-hatch
          is broken and Phase 13's remount loop will regress. */}
      <div
        data-testid="preview-container"
        className="relative overflow-hidden rounded border bg-black"
        style={{ width: 240, height: 135 }}
      >
        <PreviewVideo id={id} status={status} />
        {(showRecOverlay || showMaintOverlay) && (
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {showRecOverlay && (
              <span
                data-testid="rec-overlay"
                className="flex items-center gap-1 rounded-sm bg-red-500/85 px-1.5 py-0.5 text-[10px] font-semibold text-white motion-safe:animate-pulse"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                REC
              </span>
            )}
            {showMaintOverlay && (
              <span
                data-testid="maint-overlay"
                className="flex items-center gap-1 rounded-sm bg-gray-700/85 px-1.5 py-0.5 text-[10px] font-semibold text-white"
              >
                <Wrench className="h-2.5 w-2.5" />
                Maintenance
              </span>
            )}
          </div>
        )}
      </div>

      {/* Name + viewer count + ⋮ dropdown */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{name}</p>
          {typeof viewerCount === 'number' && (
            <p className="text-xs text-muted-foreground">
              {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`More actions for ${name}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSetLocation?.(id, name)}>
              <MapPin className="mr-2 h-4 w-4" />
              Set Location
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setConfirmOpen(true)}>
              <Wrench className="mr-2 h-4 w-4" />
              {maintenanceMode ? 'Exit Maintenance' : 'Toggle Maintenance'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenDetail?.(id)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Camera Detail
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status + recording + maintenance badges + offline timestamp */}
      <div className="space-y-1">
        <Badge variant={STATUS_VARIANT[status] || 'secondary'}>
          <span className="capitalize">{status}</span>
        </Badge>
        {isRecording && (
          <Badge
            data-testid="recording-badge"
            variant="outline"
            className="ml-0 text-[hsl(0_84%_60%)]"
          >
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[hsl(0_84%_60%)] motion-safe:animate-pulse" />
            Recording
            {typeof retentionDays === 'number' && ` · ${retentionDays} days retention`}
          </Badge>
        )}
        {maintenanceMode && (
          <Badge
            data-testid="maint-badge"
            variant="outline"
            className="ml-0 text-muted-foreground"
          >
            <Wrench className="mr-1 h-3 w-3" />
            Maintenance
            {maintenanceEnteredBy && ` · by ${maintenanceEnteredBy}`}
            {maintenanceEnteredAt &&
              ` · ${formatDistanceToNowStrict(new Date(maintenanceEnteredAt), { addSuffix: true })}`}
          </Badge>
        )}
        {status === 'offline' && lastOnlineAt && (
          <p className="text-xs text-muted-foreground">
            Offline {formatDistanceToNowStrict(new Date(lastOnlineAt), { addSuffix: true })}
          </p>
        )}
      </div>

      {/* Primary actions: View Stream + View Recordings */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => onViewStream?.(id)}
          aria-label={`View stream for ${name}`}
          className="h-7 text-xs"
        >
          <Play className="mr-1 h-3 w-3" />
          View Stream
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewRecordings?.(id)}
          aria-label={`View recordings for ${name}`}
          className="h-7 text-xs"
        >
          <Film className="mr-1 h-3 w-3" />
          View Recordings
        </Button>
      </div>

      {/* Maintenance confirmation dialog — reuses Phase 15-04 pattern, Thai + English copy. */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {maintenanceMode
                ? 'ออกจากโหมดซ่อมบำรุง / Exit maintenance mode'
                : 'เข้าสู่โหมดซ่อมบำรุง / Enter maintenance mode'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {maintenanceMode
                ? `กล้อง ${name} จะกลับมา active และแจ้งเตือนได้ตามปกติ / Camera ${name} will return to active monitoring.`
                : `กล้อง ${name} จะถูกตั้งเป็นโหมดซ่อมบำรุง และจะไม่ส่ง notification/webhook จนกว่าจะออกจากโหมดนี้ / Camera ${name} will be set to maintenance mode. Notifications and webhooks will be suppressed until you exit.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก / Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={maintenanceMode ? 'default' : 'destructive'}
              onClick={() => {
                onToggleMaintenance?.(id, !maintenanceMode);
                setConfirmOpen(false);
              }}
            >
              ยืนยัน / Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
