'use client';

import { memo, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface CameraPopupProps {
  id: string;
  name: string;
  status: string;
  viewerCount?: number;
  onViewStream?: (id: string) => void;
  onSetLocation?: (id: string, name: string) => void;
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

export function CameraPopup({ id, name, status, viewerCount, onViewStream, onSetLocation }: CameraPopupProps) {

  return (
    <div className="space-y-2 p-1">
      {/* Camera name */}
      <p className="text-sm font-semibold leading-tight">{name}</p>

      {/* Status badge */}
      <div className="flex items-center gap-2">
        <Badge variant={STATUS_VARIANT[status] || 'secondary'}>
          <span className="capitalize">{status}</span>
        </Badge>
        {viewerCount !== undefined && (
          <span className="text-xs text-muted-foreground">
            {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Mini HLS preview — memoized so viewer-count broadcasts don't remount it */}
      <div className="overflow-hidden rounded border bg-black" style={{ width: 200, height: 112 }}>
        <PreviewVideo id={id} status={status} />
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewStream?.(id)}
          aria-label={`View stream for ${name}`}
          className="h-7 text-xs"
        >
          View Stream
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSetLocation?.(id, name)}
          aria-label={`Set location for ${name}`}
          className="h-7 text-xs"
        >
          <MapPin className="mr-1 h-3 w-3" />
          Set Location
        </Button>
      </div>
    </div>
  );
}
