'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

interface HlsPlayerProps {
  src: string;
  autoPlay?: boolean;
  /** Use 'vod' for recording playback, 'live' (default) for live streams */
  mode?: 'live' | 'vod';
}

export function HlsPlayer({ src, autoPlay = true, mode = 'live' }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    let cancelled = false;
    let attempt = 0;
    const MAX_ATTEMPTS = mode === 'live' ? 6 : 3;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const mount = () => {
      if (cancelled) return;
      setError(null);

      if (Hls.isSupported()) {
        const hlsConfig: Partial<Hls['config']> = {
          enableWorker: true,
          // All URLs go through the API (same origin), so XHR must send
          // session cookies for AuthGuard-protected endpoints.
          xhrSetup: (xhr: XMLHttpRequest) => {
            xhr.withCredentials = true;
          },
        };

        if (mode === 'live') {
          // Live stream settings: low latency, small buffer
          Object.assign(hlsConfig, {
            lowLatencyMode: true,
            liveSyncDurationCount: 2,
            liveMaxLatencyDurationCount: 5,
            maxBufferLength: 10,
            backBufferLength: 0,
          });
        } else {
          // VOD settings: buffer more, no live-edge chasing
          Object.assign(hlsConfig, {
            lowLatencyMode: false,
            maxBufferLength: 30,
            backBufferLength: 30,
          });
        }

        const hls = new Hls(hlsConfig as any);
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          attempt = 0; // success — reset retry counter
          if (autoPlay) video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          hls.destroy();
          hlsRef.current = null;
          attempt += 1;
          if (attempt >= MAX_ATTEMPTS || cancelled) {
            const msg = mode === 'live'
              ? 'Stream playback error. The stream may have stopped.'
              : 'Recording playback error. The recording may be unavailable.';
            setError(msg);
            return;
          }
          const delay = Math.min(2000 + attempt * 1000, 8000);
          retryTimer = setTimeout(mount, delay);
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        if (autoPlay) video.play().catch(() => {});
      }
    };

    mount();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src, autoPlay, mode]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[hsl(0,0%,9%)]">
      {error ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="h-full w-full"
          controls
          playsInline
          muted
        />
      )}
    </div>
  );
}
