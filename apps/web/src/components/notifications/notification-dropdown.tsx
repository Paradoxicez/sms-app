'use client';

import { Bell } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationItem } from './notification-item';
import type { Notification } from '@/hooks/use-notifications';

interface NotificationDropdownProps {
  notifications: Notification[];
  loading: boolean;
  hasMore: boolean;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onLoadMore: () => void;
}

export function NotificationDropdown({
  notifications,
  loading,
  hasMore,
  onMarkAsRead,
  onMarkAllAsRead,
  onLoadMore,
}: NotificationDropdownProps) {
  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="w-[320px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pb-2">
        <span className="text-sm font-semibold">Notifications</span>
        {hasUnread && (
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={onMarkAllAsRead}
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* List */}
      <ScrollArea className="max-h-96">
        {loading && notifications.length === 0 ? (
          <div className="space-y-2 px-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3 py-2">
                <Skeleton className="h-4 w-4 mt-0.5 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bell className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-muted-foreground">No notifications</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You&apos;re all caught up!
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={onMarkAsRead}
              />
            ))}
            {hasMore && (
              <div className="flex justify-center py-2">
                <Button variant="ghost" size="sm" onClick={onLoadMore}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
