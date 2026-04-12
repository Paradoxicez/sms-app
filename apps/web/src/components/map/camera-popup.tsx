'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Hls from 'hls.js';
import { Badge } from '@/components/ui/badge';

interface CameraPopupProps {
  id: string;
  name: string;
  status: string;
  viewerCount?: number;
}

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  online: 'default',
  offline: 'destructive',
  degraded: 'outline',
  connecting: 'secondary',
  reconnecting: 'outline',
};

export function CameraPopup({ id, name, status, viewerCount }: CameraPopupProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    // Only attempt HLS preview if camera is online
    if (status !== 'online' || !videoRef.current) return;

    const hlsUrl = `/api/streams/${id}/hls/index.m3u8`;

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
      // Safari native HLS
      videoRef.current.src = hlsUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [id, status]);

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

      {/* Mini HLS preview */}
      <div className="overflow-hidden rounded border bg-black" style={{ width: 200, height: 112 }}>
        {status === 'online' ? (
          <video
            ref={videoRef}
            muted
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-xs text-gray-400">Stream offline</span>
          </div>
        )}
      </div>

      {/* View Details link */}
      <Link
        href={`/admin/cameras/${id}`}
        className="block text-xs font-medium text-primary hover:underline"
      >
        View Details
      </Link>
    </div>
  );
}
