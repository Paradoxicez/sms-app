'use client';

import { Camera, Server, AlertTriangle, RefreshCw } from 'lucide-react';
import type { Notification } from '@/hooks/use-notifications';

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const diff = now - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getNotificationIcon(type: string) {
  if (type === 'camera.online') {
    return <Camera className="h-4 w-4 text-green-500" />;
  }
  if (type === 'camera.offline') {
    return <Camera className="h-4 w-4 text-red-500" />;
  }
  if (type === 'camera.degraded') {
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  }
  if (type === 'camera.reconnecting') {
    return <RefreshCw className="h-4 w-4 text-amber-500" />;
  }
  if (type === 'system.alert') {
    return <Server className="h-4 w-4 text-red-500" />;
  }
  return <Camera className="h-4 w-4 text-muted-foreground" />;
}

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}

export function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
  return (
    <button
      type="button"
      className={`w-full flex items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted ${
        !notification.read ? 'bg-primary/5' : ''
      }`}
      onClick={() => {
        if (!notification.read) {
          onMarkAsRead(notification.id);
        }
      }}
    >
      <div className="mt-0.5 shrink-0">
        {getNotificationIcon(notification.type)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{notification.title}</p>
        {notification.body && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {notification.body}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
      {!notification.read && (
        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  );
}
