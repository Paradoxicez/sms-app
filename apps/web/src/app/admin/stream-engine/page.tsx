'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

interface SystemSettings {
  hlsFragment: number;
  hlsWindow: number;
  hlsEncryption: boolean;
  rtmpPort: number;
  srtPort: number;
  timeoutSeconds: number;
}

interface OrgSettings {
  defaultProfileId: string | null;
  maxReconnectAttempts: number;
  autoStartOnBoot: boolean;
  defaultRecordingMode: string;
}

interface StreamProfile {
  id: string;
  name: string;
  isDefault: boolean;
}

const RECORDING_MODES = [
  { label: 'Off', value: 'off' },
  { label: 'Continuous', value: 'continuous' },
  { label: 'Motion', value: 'motion' },
];

export default function StreamEnginePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Stream Engine Settings</h1>

      <Tabs defaultValue="system">
        <TabsList>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="org">Organization Defaults</TabsTrigger>
        </TabsList>

        <TabsContent value="system">
          <SystemSettingsTab />
        </TabsContent>
        <TabsContent value="org">
          <OrgSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SystemSettingsTab() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [hlsFragment, setHlsFragment] = useState(2);
  const [hlsWindow, setHlsWindow] = useState(10);
  const [hlsEncryption, setHlsEncryption] = useState(false);
  const [rtmpPort, setRtmpPort] = useState(1935);
  const [srtPort, setSrtPort] = useState(10080);
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await apiFetch<SystemSettings>('/api/admin/settings/stream-engine');
        setSettings(data);
        setHlsFragment(data.hlsFragment);
        setHlsWindow(data.hlsWindow);
        setHlsEncryption(data.hlsEncryption);
        setRtmpPort(data.rtmpPort);
        setSrtPort(data.srtPort);
        setTimeoutSeconds(data.timeoutSeconds);
      } catch {
        setError('Could not load system settings.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('/api/admin/settings/stream-engine', {
        method: 'PATCH',
        body: JSON.stringify({
          hlsFragment,
          hlsWindow,
          hlsEncryption,
          rtmpPort,
          srtPort,
          timeoutSeconds,
        }),
      });
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Card className="mt-4">
        <CardContent className="space-y-4 pt-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>System Configuration</CardTitle>
        <CardDescription>
          Configure the stream engine system-level settings. Changes will regenerate the configuration and reload the engine.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <Label htmlFor="hlsFragment">HLS Fragment Size</Label>
            <div className="flex items-center gap-2">
              <Input
                id="hlsFragment"
                type="number"
                value={hlsFragment}
                onChange={(e) => setHlsFragment(Number(e.target.value))}
                min={1}
                max={30}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hlsWindow">HLS Window Size</Label>
            <div className="flex items-center gap-2">
              <Input
                id="hlsWindow"
                type="number"
                value={hlsWindow}
                onChange={(e) => setHlsWindow(Number(e.target.value))}
                min={5}
                max={120}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rtmpPort">RTMP Port</Label>
            <Input
              id="rtmpPort"
              type="number"
              value={rtmpPort}
              onChange={(e) => setRtmpPort(Number(e.target.value))}
              min={1}
              max={65535}
              className="w-32"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="srtPort">SRT Port</Label>
            <Input
              id="srtPort"
              type="number"
              value={srtPort}
              onChange={(e) => setSrtPort(Number(e.target.value))}
              min={1}
              max={65535}
              className="w-32"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="timeout">Connection Timeout</Label>
            <div className="flex items-center gap-2">
              <Input
                id="timeout"
                type="number"
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                min={5}
                max={300}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 sm:col-span-2">
            <div>
              <Label htmlFor="hlsEncryption">HLS Encryption</Label>
              <p className="text-xs text-muted-foreground">
                Enable AES-128 encryption for HLS segments
              </p>
            </div>
            <Switch
              id="hlsEncryption"
              checked={hlsEncryption}
              onCheckedChange={(checked) => setHlsEncryption(!!checked)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrgSettingsTab() {
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<StreamProfile[]>([]);

  // Form state
  const [defaultProfileId, setDefaultProfileId] = useState<string>('');
  const [maxReconnectAttempts, setMaxReconnectAttempts] = useState(10);
  const [autoStartOnBoot, setAutoStartOnBoot] = useState(false);
  const [defaultRecordingMode, setDefaultRecordingMode] = useState('off');

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [orgData, profileData] = await Promise.all([
          apiFetch<OrgSettings>('/api/settings/org'),
          apiFetch<StreamProfile[]>('/api/stream-profiles'),
        ]);

        setDefaultProfileId(orgData.defaultProfileId || '');
        setMaxReconnectAttempts(orgData.maxReconnectAttempts);
        setAutoStartOnBoot(orgData.autoStartOnBoot);
        setDefaultRecordingMode(orgData.defaultRecordingMode);
        setProfiles(Array.isArray(profileData) ? profileData : []);
      } catch {
        setError('Could not load organization settings.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('/api/settings/org', {
        method: 'PATCH',
        body: JSON.stringify({
          defaultProfileId: defaultProfileId || null,
          maxReconnectAttempts,
          autoStartOnBoot,
          defaultRecordingMode,
        }),
      });
      toast.success('Organization defaults saved');
    } catch {
      toast.error('Failed to save organization defaults');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Card className="mt-4">
        <CardContent className="space-y-4 pt-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Organization Defaults</CardTitle>
        <CardDescription>
          Set default behavior for cameras in your organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <Label>Default Stream Profile</Label>
          <Select
            value={defaultProfileId}
            onValueChange={(v) => setDefaultProfileId(String(v ?? ''))}
          >
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue placeholder="Select a profile" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? ' (Default)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="maxReconnect">Max Reconnect Attempts</Label>
          <Input
            id="maxReconnect"
            type="number"
            value={maxReconnectAttempts}
            onChange={(e) => setMaxReconnectAttempts(Number(e.target.value))}
            min={0}
            max={100}
            className="w-24"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="autoStart">Auto-start on Boot</Label>
            <p className="text-xs text-muted-foreground">
              Automatically start streaming when the server boots
            </p>
          </div>
          <Switch
            id="autoStart"
            checked={autoStartOnBoot}
            onCheckedChange={(checked) => setAutoStartOnBoot(!!checked)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Default Recording Mode</Label>
          <Select
            value={defaultRecordingMode}
            onValueChange={(v) => setDefaultRecordingMode(String(v ?? ''))}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECORDING_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Defaults'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
