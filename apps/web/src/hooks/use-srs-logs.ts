'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface LogEntry {
  line: string;
  level: string; // 'info' | 'warn' | 'error'
  timestamp: string;
}

export function useSrsLogs(enabled: boolean, role: string) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled || role !== 'admin') return;

    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

    const socket = io(`${apiUrl}/srs-logs`, {
      path: '/socket.io',
      query: { role },
      transports: ['websocket', 'polling'],
    });

    socket.on('srs:log', (entry: LogEntry) => {
      setLogs((prev) => [...prev.slice(-499), entry]); // Keep last 500 lines
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, role]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, connected, clearLogs };
}
