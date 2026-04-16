'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/hooks/use-notifications';
import { NotificationDropdown } from './notification-dropdown';

export function NotificationBell() {
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [orgId, setOrgId] = useState<string | undefined>(undefined);

  useEffect(() => {
    async function loadSession() {
      try {
        const session = await authClient.getSession();
        setUserId(session.data?.user?.id ?? undefined);
        setOrgId(session.data?.session?.activeOrganizationId ?? undefined);
      } catch {
        // Session check handled by layout
      }
    }
    loadSession();
  }, []);

  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    clearAll,
    loadMore,
    hasMore,
  } = useNotifications(userId, orgId);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`${unreadCount} unread notifications`}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={8} className="w-auto p-2">
        <NotificationDropdown
          notifications={notifications}
          loading={loading}
          hasMore={hasMore}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onClearAll={clearAll}
          onLoadMore={loadMore}
        />
      </PopoverContent>
    </Popover>
  );
}
