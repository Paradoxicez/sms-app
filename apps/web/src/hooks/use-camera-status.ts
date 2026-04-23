'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface CameraStatusEvent {
  cameraId: string;
  status: string;
  timestamp: string;
}

interface CameraViewersEvent {
  cameraId: string;
  count: number;
}

interface CameraCodecInfoEvent {
  cameraId: string;
  // Mirrors the backend tagged union (apps/api/src/cameras/types/codec-info.ts).
  // Typed as `unknown` here to avoid duplicating the schema across packages —
  // consumers route it through normalizeCodecInfo at the prop boundary.
  codecInfo: unknown;
  timestamp: string;
}

export function useCameraStatus(
  orgId: string | undefined,
  onStatusChange?: (event: CameraStatusEvent) => void,
  onViewersChange?: (event: CameraViewersEvent) => void,
  onCodecInfoChange?: (event: CameraCodecInfoEvent) => void,
) {
  const socketRef = useRef<Socket | null>(null);
  // Keep latest callback refs so the WS listener always invokes the freshest
  // closure even when the parent passes a new function each render. Without
  // refs, the listener captures the first-render closure and silently misses
  // state updates added after mount.
  const statusRef = useRef(onStatusChange);
  const viewersRef = useRef(onViewersChange);
  const codecRef = useRef(onCodecInfoChange);
  statusRef.current = onStatusChange;
  viewersRef.current = onViewersChange;
  codecRef.current = onCodecInfoChange;

  useEffect(() => {
    if (!orgId) return;

    // Gateway is registered under the /camera-status namespace — the root
    // namespace has no listeners, so events never reached the UI.
    // Connect to the current web origin so the Better Auth session cookie
    // (scoped to localhost:3000 in dev) accompanies the WS handshake. The
    // Next.js /socket.io/* rewrite proxies the upgrade to the API port.
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const socket = io(`${origin}/camera-status`, {
      path: '/socket.io',
      query: { orgId },
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    socket.on('camera:status', (event: CameraStatusEvent) => {
      statusRef.current?.(event);
    });

    socket.on('camera:viewers', (event: CameraViewersEvent) => {
      viewersRef.current?.(event);
    });

    socket.on('camera:codec-info', (event: CameraCodecInfoEvent) => {
      codecRef.current?.(event);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orgId]);

  return socketRef;
}
