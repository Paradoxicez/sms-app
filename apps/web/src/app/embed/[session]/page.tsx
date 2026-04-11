'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Hls from 'hls.js';
import { Loader2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

interface SessionInfo {
  id: string;
  hlsUrl: string;
  expiresAt: string;
  cameraId: string;
}

type EmbedState = 'loading' | 'playing' | 'error';

export default function EmbedPlayerPage() {
  const params = useParams();
  const sessionId = params.session as string;

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [state, setState] = useState<EmbedState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const res = await fetch(
          `${API_BASE}/api/playback/sessions/${sessionId}`,
        );

        if (!res.ok) {
          if (!cancelled) {
            setState('error');
            setErrorMessage(
              'Session not found. The playback session may have expired or been revoked.',
            );
          }
          return;
        }

        const session: SessionInfo = await res.json();

        // Check if expired
        if (new Date(session.expiresAt).getTime() < Date.now()) {
          if (!cancelled) {
            setState('error');
            setErrorMessage(
              'Session not found. The playback session may have expired or been revoked.',
            );
          }
          return;
        }

        if (cancelled) return;

        const video = videoRef.current;
        if (!video) return;

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
          });
          hls.loadSource(session.hlsUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!cancelled) {
              setState('playing');
              video.play().catch(() => {});
            }
          });

          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal && !cancelled) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                setState('error');
                setErrorMessage(
                  'Stream is currently offline. The camera may be disconnected or the stream has not been started.',
                );
              } else {
                setState('error');
                setErrorMessage(
                  'Unable to load video stream. Please check your connection and try again.',
                );
              }
            }
          });

          hlsRef.current = hls;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS
          video.src = session.hlsUrl;
          video.addEventListener('loadedmetadata', () => {
            if (!cancelled) {
              setState('playing');
              video.play().catch(() => {});
            }
          });
          video.addEventListener('error', () => {
            if (!cancelled) {
              setState('error');
              setErrorMessage(
                'Unable to load video stream. Please check your connection and try again.',
              );
            }
          });
        } else {
          setState('error');
          setErrorMessage(
            'Unable to load video stream. Please check your connection and try again.',
          );
        }
      } catch {
        if (!cancelled) {
          setState('error');
          setErrorMessage(
            'Unable to load video stream. Please check your connection and try again.',
          );
        }
      }
    }

    loadSession();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [sessionId]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {state === 'loading' && (
        <Loader2
          className="animate-spin h-8 w-8 text-white"
        />
      )}

      {state === 'error' && (
        <p
          style={{
            color: 'hsl(0 0% 70%)',
            fontSize: 16,
            textAlign: 'center',
            maxWidth: 480,
            padding: '0 24px',
            lineHeight: 1.5,
          }}
        >
          {errorMessage}
        </p>
      )}

      <video
        ref={videoRef}
        controls
        autoPlay
        muted
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: state === 'playing' ? 'block' : 'none',
        }}
      />
    </div>
  );
}
