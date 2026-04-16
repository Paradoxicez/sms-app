'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Camera, Cpu, Clock, HardDrive, MemoryStick, MonitorOff, Wifi } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { StatCard } from '@/components/dashboard/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PlatformStats {
  totalOrgs: number;
  totalCameras: number;
  camerasOnline: number;
  camerasOffline: number;
  totalViewers: number;
  streamBandwidth: number;
}

interface OrgSummary {
  orgId: string;
  orgName: string;
  orgSlug: string;
  camerasOnline: number;
  camerasOffline: number;
  totalCameras: number;
}

function formatBandwidth(bytes: number): string {
  if (bytes == null || typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0)
    return '0 B/s';
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

interface SystemMetricsData {
  cpuPercent: number;
  memPercent: number;
  load1m: number;
  srsUptime: number;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

export default function PlatformDashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [metrics, setMetrics] = useState<SystemMetricsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await apiFetch<SystemMetricsData>('/api/admin/dashboard/system-metrics');
      setMetrics(data);
    } catch {
      // silent
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await apiFetch<PlatformStats>(
          '/api/admin/dashboard/stats',
        );
        setStats(data);
      } catch {
        setError('Failed to load platform stats');
      } finally {
        setStatsLoading(false);
      }
    }

    async function loadOrgs() {
      try {
        const data = await apiFetch<OrgSummary[]>(
          '/api/admin/dashboard/orgs',
        );
        setOrgs(data);
      } catch {
        // Stats error already shown
      } finally {
        setOrgsLoading(false);
      }
    }

    loadStats();
    loadOrgs();
    fetchMetrics();
    intervalRef.current = setInterval(fetchMetrics, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMetrics]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Platform Dashboard</h1>

      {/* Stat cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[108px] w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Organizations"
            value={stats.totalOrgs}
            icon={<Building2 className="h-4 w-4" />}
          />
          <StatCard
            label="Total Cameras"
            value={stats.totalCameras}
            icon={<Camera className="h-4 w-4" />}
          />
          <StatCard
            label="Cameras Online"
            value={stats.camerasOnline}
            icon={<Camera className="h-4 w-4" />}
            badge={
              stats.camerasOnline > 0
                ? { text: 'Live', variant: 'default' }
                : undefined
            }
          />
          <StatCard
            label="Cameras Offline"
            value={stats.camerasOffline}
            icon={<MonitorOff className="h-4 w-4" />}
            badge={
              stats.camerasOffline > 0
                ? {
                    text: `${stats.camerasOffline} down`,
                    variant: 'destructive',
                  }
                : undefined
            }
          />
          <StatCard
            label="Stream Bandwidth"
            value={formatBandwidth(stats.streamBandwidth * 125)}
            icon={<Wifi className="h-4 w-4" />}
          />
        </div>
      ) : null}

      {/* System metrics */}
      {metricsLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[108px] w-full rounded-xl" />
          ))}
        </div>
      ) : metrics ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="CPU Usage"
            value={`${metrics.cpuPercent.toFixed(1)}%`}
            icon={<Cpu className="h-4 w-4" />}
            badge={metrics.cpuPercent > 80 ? { text: 'High', variant: 'destructive' } : undefined}
          />
          <StatCard
            label="Memory Usage"
            value={`${metrics.memPercent.toFixed(1)}%`}
            icon={<MemoryStick className="h-4 w-4" />}
            badge={metrics.memPercent > 80 ? { text: 'High', variant: 'destructive' } : undefined}
          />
          <StatCard
            label="System Load (1m)"
            value={metrics.load1m.toFixed(2)}
            icon={<HardDrive className="h-4 w-4" />}
          />
          <StatCard
            label="SRS Uptime"
            value={formatUptime(metrics.srsUptime)}
            icon={<Clock className="h-4 w-4" />}
          />
        </div>
      ) : null}

      {/* Org Summary table */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {orgsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No organizations found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead className="text-right">Online</TableHead>
                  <TableHead className="text-right">Offline</TableHead>
                  <TableHead className="text-right">Total Cameras</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.orgId}>
                    <TableCell className="font-medium">
                      {org.orgName}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {org.orgSlug}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-emerald-600">
                      {org.camerasOnline}
                    </TableCell>
                    <TableCell className="text-right text-red-500">
                      {org.camerasOffline}
                    </TableCell>
                    <TableCell className="text-right">
                      {org.totalCameras}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
