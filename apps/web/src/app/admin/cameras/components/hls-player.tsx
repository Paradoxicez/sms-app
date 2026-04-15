'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

interface HlsPlayerProps {
  src: string;
  autoPlay?: boolean;
}

export function HlsPlayer({ src, autoPlay = true }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    let cancelled = false;
    let attempt = 0;
    const MAX_ATTEMPTS = 6; // ~2+3+4+6+8 = 23s total — covers SRS warm-up
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const mount = () => {
      if (cancelled) return;
      setError(null);

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          // Preview URL goes through /api/cameras/:id/preview/* which is
          // AuthGuard-protected, so XHR must send session cookies.
          xhrSetup: (xhr) => {
            xhr.withCredentials = true;
          },
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          attempt = 0; // success — reset retry counter
          if (autoPlay) video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          // SRS takes a few seconds after on_publish before the first
          // HLS segment lands on disk. Retry with backoff so the player
          // does not stay in its error state forever when the user just
          // restarted the stream.
          hls.destroy();
          hlsRef.current = null;
          attempt += 1;
          if (attempt >= MAX_ATTEMPTS || cancelled) {
            setError('Stream playback error. The stream may have stopped.');
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
  }, [src, autoPlay]);

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
