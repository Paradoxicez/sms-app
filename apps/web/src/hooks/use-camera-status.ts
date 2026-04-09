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

    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', {
      path: '/socket.io',
      query: { orgId },
      transports: ['websocket'],
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
