'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Toggle } from '@/components/ui/toggle';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface Schedule {
  id: string;
  scheduleType: string;
  config: {
    startTime?: string;
    endTime?: string;
    days?: string[];
    windows?: { startTime: string; endTime: string }[];
  };
  enabled: boolean;
}

interface ScheduleDialogProps {
  cameraId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ScheduleDialog({
  cameraId,
  open,
  onOpenChange,
  onSaved,
}: ScheduleDialogProps) {
  const [scheduleType, setScheduleType] = useState('daily');
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [selectedDays, setSelectedDays] = useState<string[]>([
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
  ]);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingSchedules, setExistingSchedules] = useState<Schedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  const fetchSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    try {
      const data = await apiFetch<Schedule[]>(
        `/api/recordings/camera/${cameraId}/schedules`,
      );
      setExistingSchedules(data);
    } catch {
      setExistingSchedules([]);
    } finally {
      setLoadingSchedules(false);
    }
  }, [cameraId]);

  useEffect(() => {
    if (open) fetchSchedules();
  }, [open, fetchSchedules]);

  async function handleSave() {
    setSaving(true);
    try {
      const config: Record<string, unknown> = {
        startTime,
        endTime,
      };
      if (scheduleType === 'weekly') {
        config.days = selectedDays;
      }
      await apiFetch('/api/recordings/schedules', {
        method: 'POST',
        body: JSON.stringify({
          cameraId,
          scheduleType,
          config,
          enabled,
        }),
      });
      toast.success('Recording schedule saved successfully.');
      fetchSchedules();
      onSaved();
    } catch {
      toast.error('Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSchedule(id: string) {
    try {
      await apiFetch(`/api/recordings/schedules/${id}`, {
        method: 'DELETE',
      });
      fetchSchedules();
    } catch {
      toast.error('Failed to delete schedule.');
    }
  }

  function toggleDay(day: string) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recording Schedule</DialogTitle>
          <DialogDescription>
            Configure when this camera should automatically record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Schedule Type */}
          <div className="space-y-2">
            <Label>Schedule Type</Label>
            <Select
              value={scheduleType}
              onValueChange={(v) => setScheduleType(String(v ?? 'daily'))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-start">Start Time</Label>
              <Input
                id="schedule-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-end">End Time</Label>
              <Input
                id="schedule-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Weekly: Day checkboxes */}
          {scheduleType === 'weekly' && (
            <div className="space-y-2">
              <Label>Days</Label>
              <div className="flex flex-wrap gap-1">
                {DAYS.map((day) => (
                  <Toggle
                    key={day}
                    variant="outline"
                    size="sm"
                    pressed={selectedDays.includes(day)}
                    onPressedChange={() => toggleDay(day)}
                  >
                    {day}
                  </Toggle>
                ))}
              </div>
            </div>
          )}

          {/* Enable toggle */}
          <div className="flex items-center gap-3">
            <Switch
              checked={enabled}
              onCheckedChange={(val) => setEnabled(Boolean(val))}
            />
            <Label>Enable schedule</Label>
          </div>

          {/* Existing schedules */}
          {!loadingSchedules && existingSchedules.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Active Schedules
              </Label>
              <div className="flex flex-wrap gap-2">
                {existingSchedules.map((s) => (
                  <Badge
                    key={s.id}
                    variant={s.enabled ? 'default' : 'secondary'}
                    className="gap-1"
                  >
                    {s.scheduleType}: {s.config.startTime} - {s.config.endTime}
                    {s.config.days && ` (${s.config.days.join(', ')})`}
                    <button
                      onClick={() => handleDeleteSchedule(s.id)}
                      className="ml-1 rounded-full p-0.5 hover:bg-background/20"
                      aria-label={`Remove ${s.scheduleType} schedule`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Discard
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
