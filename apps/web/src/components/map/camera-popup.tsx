'use client';

import { memo, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { formatDistanceToNowStrict } from 'date-fns';
import { MapPin, MoreVertical, Wrench } from 'lucide-react';
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
  isRecording?: boolean;
  maintenanceMode?: boolean;
  maintenanceEnteredBy?: string | null;
  maintenanceEnteredAt?: string | null;
  lastOnlineAt?: string | null;
  retentionDays?: number | null;
  onViewStream?: (id: string) => void;
  onSetLocation?: (id: string, name: string) => void;
  onToggleMaintenance?: (id: string, nextState: boolean) => void;
}

const STATUS_LABEL: Record<string, string> = {
  online: 'Online',
  offline: 'Offline',
  degraded: 'Degraded',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
};

const STATUS_DOT: Record<string, string> = {
  online: 'bg-green-500',
  offline: 'bg-red-500',
  degraded: 'bg-amber-500',
  connecting: 'bg-blue-500',
  reconnecting: 'bg-amber-500',
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
        <span className="text-xs text-gray-400">Stream unavailable</span>
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
  onToggleMaintenance,
}: CameraPopupProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isOnline = status === 'online';
  const showRecOverlay = Boolean(isRecording) && isOnline;
  const showMaintOverlay = Boolean(maintenanceMode);
  const statusLabel = maintenanceMode ? 'Maintenance' : STATUS_LABEL[status] || status;
  const statusDotClass = maintenanceMode ? 'bg-amber-500' : STATUS_DOT[status] || 'bg-gray-400';
  const canViewStream = isOnline && !maintenanceMode;

  // Subtitle: dot tooltip shows status; right side shows terse context
  const subtitleParts: string[] = [];
  if (typeof viewerCount === 'number') {
    subtitleParts.push(`${viewerCount} viewer${viewerCount === 1 ? '' : 's'}`);
  }
  if (maintenanceMode && maintenanceEnteredBy) {
    subtitleParts.push(`by ${maintenanceEnteredBy}`);
  }
  if (maintenanceMode && maintenanceEnteredAt) {
    subtitleParts.push(
      formatDistanceToNowStrict(new Date(maintenanceEnteredAt), { addSuffix: true }),
    );
  }
  if (!maintenanceMode && status === 'offline' && lastOnlineAt) {
    subtitleParts.push(
      `last seen ${formatDistanceToNowStrict(new Date(lastOnlineAt), { addSuffix: true })}`,
    );
  }
  if (isOnline && isRecording && typeof retentionDays === 'number') {
    subtitleParts.push(`${retentionDays}d retention`);
  }
  const subtitleText = subtitleParts.join(' · ');
  const dotTooltip = subtitleText ? `${statusLabel} · ${subtitleText}` : statusLabel;

  return (
    <div className="space-y-1.5 p-0.5">
      {/* Top row: camera name + status dot + viewers */}
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="truncate text-sm font-semibold leading-tight">{name}</p>
        <span
          data-testid="status-dot"
          title={dotTooltip}
          aria-label={dotTooltip}
          role="img"
          className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass}`}
        />
        {subtitleText && (
          <span
            data-testid="subtitle"
            className="truncate text-[11px] text-muted-foreground"
          >
            {subtitleText}
          </span>
        )}
      </div>

      {/* Preview container 240×135 (16:9) with thin border. Status overlays are
          SIBLINGS to PreviewVideo. CRITICAL: PreviewVideo receives only {id, status}
          — do NOT add viewerCount or other parent-scope props, or memo() breaks and
          Phase 13's runaway viewer count bug regresses. */}
      <div
        data-testid="preview-container"
        className="relative aspect-[16/9] w-full overflow-hidden rounded-md border border-border bg-black"
      >
        <PreviewVideo id={id} status={status} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-1.5">
          {showMaintOverlay ? (
            <span
              data-testid="maint-overlay"
              className="flex items-center gap-1 rounded bg-amber-500/95 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm"
            >
              <Wrench className="h-2.5 w-2.5" />
              Maintenance
            </span>
          ) : isOnline ? (
            <span
              data-testid="live-overlay"
              className="flex items-center gap-1 rounded bg-red-500/95 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm motion-safe:animate-pulse"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Live
            </span>
          ) : (
            <span />
          )}
          {showRecOverlay && (
            <span
              data-testid="rec-overlay"
              className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 motion-safe:animate-pulse" />
              Rec
            </span>
          )}
        </div>
      </div>

      {/* Bottom row: details (left) + ⋮ (right) */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onViewStream?.(id)}
          disabled={!canViewStream}
          aria-label={`View details for ${name}`}
          className="rounded px-1.5 py-0.5 text-[12px] font-medium text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          details
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`More actions for ${name}`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted"
          >
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => onSetLocation?.(id, name)}>
              <MapPin className="mr-2 h-4 w-4" />
              Set Location
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setConfirmOpen(true)}>
              <Wrench className="mr-2 h-4 w-4" />
              {maintenanceMode ? 'Exit Maintenance' : 'Enter Maintenance'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Maintenance confirmation dialog (English only) */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {maintenanceMode ? 'Exit maintenance mode' : 'Enter maintenance mode'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {maintenanceMode
                ? `Camera "${name}" will return to active monitoring and resume notifications.`
                : `Camera "${name}" will be set to maintenance mode. Notifications and webhooks will be suppressed until you exit.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={maintenanceMode ? 'default' : 'destructive'}
              onClick={() => {
                onToggleMaintenance?.(id, !maintenanceMode);
                setConfirmOpen(false);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
