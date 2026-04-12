'use client';

import { useEffect, useState, useCallback } from 'react';
import { Settings2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface NotificationPreference {
  eventType: string;
  enabled: boolean;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  'camera.online': 'Camera Online',
  'camera.offline': 'Camera Offline',
  'camera.degraded': 'Camera Degraded',
  'camera.reconnecting': 'Camera Reconnecting',
  'system.alert': 'System Alerts',
};

const EVENT_TYPE_DESCRIPTIONS: Record<string, string> = {
  'camera.online': 'When a camera comes online and starts streaming',
  'camera.offline': 'When a camera goes offline',
  'camera.degraded': 'When stream quality drops or issues are detected',
  'camera.reconnecting': 'When the system is reconnecting to a camera',
  'system.alert': 'System-level alerts and warnings',
};

const ALL_EVENT_TYPES = [
  'camera.online',
  'camera.offline',
  'camera.degraded',
  'camera.reconnecting',
  'system.alert',
];

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const data = await apiFetch<NotificationPreference[]>('/api/notifications/preferences');
        // Merge with all known event types to ensure they all show
        const prefMap = new Map(data.map((p) => [p.eventType, p.enabled]));
        setPreferences(
          ALL_EVENT_TYPES.map((eventType) => ({
            eventType,
            enabled: prefMap.get(eventType) ?? true,
          })),
        );
      } catch {
        // Default all to enabled
        setPreferences(ALL_EVENT_TYPES.map((eventType) => ({ eventType, enabled: true })));
      } finally {
        setLoading(false);
      }
    }
    fetchPreferences();
  }, []);

  const handleToggle = useCallback(async (eventType: string, enabled: boolean) => {
    setPreferences((prev) =>
      prev.map((p) => (p.eventType === eventType ? { ...p, enabled } : p)),
    );
    try {
      await apiFetch('/api/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({ eventType, enabled }),
      });
    } catch {
      // Revert on failure
      setPreferences((prev) =>
        prev.map((p) => (p.eventType === eventType ? { ...p, enabled: !enabled } : p)),
      );
    }
  }, []);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            <span className="text-xs">Preferences</span>
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notification Preferences</DialogTitle>
          <DialogDescription>
            Choose which notification types you want to receive.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            preferences.map((pref) => (
              <div key={pref.eventType} className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor={`pref-${pref.eventType}`} className="text-sm font-medium">
                    {EVENT_TYPE_LABELS[pref.eventType] || pref.eventType}
                  </Label>
                  {EVENT_TYPE_DESCRIPTIONS[pref.eventType] && (
                    <p className="text-xs text-muted-foreground">
                      {EVENT_TYPE_DESCRIPTIONS[pref.eventType]}
                    </p>
                  )}
                </div>
                <Switch
                  id={`pref-${pref.eventType}`}
                  checked={pref.enabled}
                  onCheckedChange={(checked) =>
                    handleToggle(pref.eventType, checked)
                  }
                />
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
