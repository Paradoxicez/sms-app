'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { apiFetch } from '@/lib/api';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

interface NotificationListResponse {
  items: Notification[];
  nextCursor: string | null;
}

interface UnreadCountResponse {
  count: number;
}

export function useNotifications(userId: string | undefined, orgId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Initial fetch
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    async function fetchInitial() {
      setLoading(true);
      try {
        const [listRes, countRes] = await Promise.all([
          apiFetch<NotificationListResponse>('/api/notifications?take=20'),
          apiFetch<UnreadCountResponse>('/api/notifications/unread-count'),
        ]);
        if (!cancelled) {
          setNotifications(listRes.items);
          cursorRef.current = listRes.nextCursor;
          setHasMore(!!listRes.nextCursor);
          setUnreadCount(countRes.count);
        }
      } catch {
        // Silently fail - notifications are non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInitial();
    return () => { cancelled = true; };
  }, [userId]);

  // Socket.IO connection to /notifications namespace
  useEffect(() => {
    if (!userId) return;

    // Connect to the current web origin so the Better Auth session cookie
    // (scoped to localhost:3000 in dev) accompanies the WS handshake. The
    // Next.js /socket.io/* rewrite proxies the upgrade to the API port.
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const socket = io(`${origin}/notifications`, {
      path: '/socket.io',
      query: { userId, orgId },
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    socket.on('notification:new', (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, orgId]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Silently fail
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursorRef.current) return;
    try {
      const res = await apiFetch<NotificationListResponse>(
        `/api/notifications?take=20&cursor=${cursorRef.current}`,
      );
      setNotifications((prev) => [...prev, ...res.items]);
      cursorRef.current = res.nextCursor;
      setHasMore(!!res.nextCursor);
    } catch {
      // Silently fail
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await apiFetch('/api/notifications/clear-all', { method: 'DELETE' });
      setNotifications([]);
      setUnreadCount(0);
      cursorRef.current = null;
      setHasMore(false);
    } catch {
      // Silently fail
    }
  }, []);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearAll, loadMore, hasMore };
}
