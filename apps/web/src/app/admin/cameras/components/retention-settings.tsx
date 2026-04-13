'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface RetentionSettingsProps {
  cameraId: string;
  currentRetentionDays: number | null;
  orgDefaultDays: number;
}

const PRESETS = [
  { label: '7 days', value: '7' },
  { label: '14 days', value: '14' },
  { label: '30 days', value: '30' },
  { label: '60 days', value: '60' },
  { label: '90 days', value: '90' },
  { label: 'Custom', value: 'custom' },
];

export function RetentionSettings({
  cameraId,
  currentRetentionDays,
  orgDefaultDays,
}: RetentionSettingsProps) {
  const initialPreset = currentRetentionDays
    ? PRESETS.find((p) => p.value === String(currentRetentionDays))
      ? String(currentRetentionDays)
      : 'custom'
    : '';
  const [selectedPreset, setSelectedPreset] = useState(initialPreset);
  const [customDays, setCustomDays] = useState(
    currentRetentionDays ? String(currentRetentionDays) : '',
  );
  const [saving, setSaving] = useState(false);

  const effectiveDays =
    selectedPreset === 'custom'
      ? parseInt(customDays, 10) || null
      : selectedPreset
        ? parseInt(selectedPreset, 10)
        : null;

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch(`/api/recordings/camera/${cameraId}/retention`, {
        method: 'PUT',
        body: JSON.stringify({ cameraId, retentionDays: effectiveDays }),
      });
      toast.success('Retention policy updated.');
    } catch {
      toast.error('Failed to update retention policy.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Retention Policy</h3>

      <div className="max-w-sm space-y-4">
        <div className="space-y-2">
          <Label>Retention Period</Label>
          <Select
            value={selectedPreset}
            onValueChange={(v) => setSelectedPreset(String(v ?? ''))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Use organization default" />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedPreset === 'custom' && (
          <div className="space-y-2">
            <Label htmlFor="custom-retention">Custom Days</Label>
            <div className="flex items-center gap-2">
              <Input
                id="custom-retention"
                type="number"
                min={1}
                max={365}
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Leave empty to use organization default (currently {orgDefaultDays}{' '}
          days)
        </p>

        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Retention Policy
        </Button>
      </div>
    </div>
  );
}
