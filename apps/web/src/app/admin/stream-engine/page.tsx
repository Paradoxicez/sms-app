'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
        defaultValue="org"
        onValueChange={(v) => setLogsTabActive(v === 'logs')}
      >
        <TabsList>
          <TabsTrigger value="org">Organization Defaults</TabsTrigger>
          {isAdmin && <TabsTrigger value="logs">Live Logs</TabsTrigger>}
        </TabsList>

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
