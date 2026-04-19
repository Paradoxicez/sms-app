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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useSrsLogs } from '@/hooks/use-srs-logs';
import { LogViewer } from '@/components/srs-logs/log-viewer';

interface SystemSettings {
  hlsFragment: number;
  hlsWindow: number;
  hlsEncryption: boolean;
  rtmpPort: number;
  srtPort: number;
  timeoutSeconds: number;
}

interface OrgSettings {
  defaultRetentionDays: number;
}

export default function StreamEnginePage() {
  // TODO: In production, derive role from session/auth context
  const userRole = 'admin';
  const isAdmin = userRole === 'admin';

  const [logsTabActive, setLogsTabActive] = useState(false);
  const { logs, connected, clearLogs } = useSrsLogs(logsTabActive && isAdmin, userRole);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Stream Engine Settings</h1>

      <Tabs
        defaultValue="system"
        onValueChange={(v) => setLogsTabActive(v === 'logs')}
      >
        <TabsList>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="org">Organization Defaults</TabsTrigger>
          {isAdmin && <TabsTrigger value="logs">Live Logs</TabsTrigger>}
        </TabsList>

        <TabsContent value="system">
          <SystemSettingsTab />
        </TabsContent>
        <TabsContent value="org">
          <OrgSettingsTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="logs">
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>SRS Live Logs</CardTitle>
                <CardDescription>
                  Real-time log output from the stream engine. Only visible to super admins.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LogViewer logs={logs} connected={connected} onClear={clearLogs} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
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
  const [defaultRetentionDays, setDefaultRetentionDays] = useState(30);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const orgData = await apiFetch<OrgSettings>('/api/settings/org');
        setDefaultRetentionDays(orgData.defaultRetentionDays);
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
        body: JSON.stringify({ defaultRetentionDays }),
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
          <Skeleton className="h-10 w-full" />
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
          Retention policy for recordings in your organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="retentionDays">Default Retention Days</Label>
          <Input
            id="retentionDays"
            type="number"
            value={defaultRetentionDays}
            onChange={(e) => setDefaultRetentionDays(Number(e.target.value))}
            min={1}
            max={3650}
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">
            Recordings older than this (in days) are deleted by the retention
            job. Applies only when a camera has no explicit retention override.
          </p>
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
