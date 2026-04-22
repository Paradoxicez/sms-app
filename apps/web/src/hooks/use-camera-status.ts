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

export function useCameraStatus(
  orgId: string | undefined,
  onStatusChange?: (event: CameraStatusEvent) => void,
  onViewersChange?: (event: CameraViewersEvent) => void,
) {
  const socketRef = useRef<Socket | null>(null);

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
      onStatusChange?.(event);
    });

    socket.on('camera:viewers', (event: CameraViewersEvent) => {
      onViewersChange?.(event);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orgId]);

  return socketRef;
}
